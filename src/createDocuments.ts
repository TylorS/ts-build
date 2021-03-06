import builtins from 'builtin-modules'
import { pipe } from 'fp-ts/function'
import { map as mapOption, none, some } from 'fp-ts/Option'
import { compact } from 'fp-ts/ReadonlyArray'
import { dirname, join, relative, resolve } from 'path'
import rimraf from 'rimraf'
import { MemoryEmitResult, MemoryEmitResultFile, Project, SourceFile, StringLiteral } from 'ts-morph'
import { CustomTransformers, formatDiagnosticsWithColorAndContext, ModuleKind } from 'typescript'

import { EXTENSIONS, OUT_DIR, SOURCE_MAP_EXT, SUPPORTS_DEPENDENCIES_EXTENSIONS } from './constants'
import { ensureDirectoryExists } from './fs/ensureDirectoryExists'
import { writeFile } from './fs/writeFile'
import { createResolveTsConfigPaths, TsConfigPathsResolver } from './helpers/createResolveTsConfigPaths'
import { createFormatHost } from './helpers/formatHost'
import { getFileExtension } from './helpers/getFileExtension'
import { resolvePath } from './helpers/resolvePath'
import { Dependency } from './types/Dependency'
import { Document } from './types/Document'
import { TsConfig } from './types/TsConfig'

export type CreateDocumentsOptions = {
  readonly directory: string
  readonly tsConfig: TsConfig

  readonly customTransformers?: CustomTransformers
}

export async function createDocuments(options: CreateDocumentsOptions): Promise<readonly Document[]> {
  const { directory, tsConfig } = options
  const { compilerOptions } = tsConfig

  rimraf.sync(resolve(directory, OUT_DIR))
  ensureDirectoryExists(resolve(directory, OUT_DIR))

  const project = new Project({
    tsConfigFilePath: tsConfig.configPath,
    compilerOptions: {
      ...compilerOptions,
      allowJs: true,
      module: ModuleKind.ESNext,
      outDir: OUT_DIR,
      sourceMap: true,
      declaration: true,
      declarationMap: true,
    },
    skipFileDependencyResolution: true,
  })
  const pathsResolver = createResolveTsConfigPaths({ compilerOptions })

  const esmSourceResult: MemoryEmitResult = project.emitToMemory({
    customTransformers: options.customTransformers,
  })

  const diagnostics = esmSourceResult.getDiagnostics()

  if (diagnostics.length > 0) {
    throw new Error(
      formatDiagnosticsWithColorAndContext(
        diagnostics.map((d) => d.compilerObject),
        createFormatHost(directory),
      ),
    )
  }

  const files = esmSourceResult.getFiles()

  const documents: ReadonlyArray<Document> = files.map((file) =>
    fileToDocument({
      sourceMaps: compilerOptions.sourceMap ?? false,
      declarationMaps: compilerOptions.declarationMap ?? false,
      directory,
      rootDir: OUT_DIR,
      file,
    }),
  )

  await Promise.all(documents.map((d) => writeFile(d.filePath, d.contents)))

  return Promise.all(documents.map((d) => findDocumentDependencies(project, pathsResolver, d)))
}

async function findDocumentDependencies(
  project: Project,
  pathsResolver: TsConfigPathsResolver,
  document: Document,
): Promise<Document> {
  const { filePath, fileExtension, contents } = document
  const supportsDependencies = SUPPORTS_DEPENDENCIES_EXTENSIONS.includes(fileExtension)
  const sourceFile = getOrCreateFile(project, filePath, contents)
  const dependencies = supportsDependencies ? await findDependencies(sourceFile, pathsResolver) : []
  const doc: Document = { ...document, dependencies }

  return doc
}

function getOrCreateFile(project: Project, filePath: string, contents: string) {
  // overwrite:true is needed since we manually write to the disk so we can traverse the filesystem for dependencies.
  return project.getSourceFile(filePath) || project.createSourceFile(filePath, contents, { overwrite: true })
}

type FileToDocumentOptions = {
  readonly sourceMaps: boolean
  readonly declarationMaps: boolean
  readonly directory: string
  readonly rootDir: string
  readonly file: MemoryEmitResultFile
}

function fileToDocument(options: FileToDocumentOptions): Document {
  const { sourceMaps, declarationMaps, directory, file } = options
  const { filePath, text } = file
  const fileExtension = getFileExtension(filePath)
  const isDeclaration = fileExtension === '.d.ts'
  const supportsSourceMap = !fileExtension.endsWith(SOURCE_MAP_EXT) && (isDeclaration ? declarationMaps : sourceMaps)
  const relativePath = relative(OUT_DIR, filePath)
  const outputFilePath = join(directory, OUT_DIR, relativePath)
  const document: Document = {
    filePath: outputFilePath,
    fileExtension,
    contents: text,
    dependencies: [],
    sourceMap: supportsSourceMap ? some(outputFilePath + SOURCE_MAP_EXT) : none,
  }

  return document
}

async function findDependencies(sourceFile: SourceFile, pathsResolver: TsConfigPathsResolver) {
  const filePath = sourceFile.getFilePath()
  const fileExtension = getFileExtension(filePath)
  const isDeclaration = fileExtension === '.d.ts'
  const directory = dirname(filePath)
  const stringLiterals = [
    ...sourceFile.getImportStringLiterals(),
    ...sourceFile
      .getExportDeclarations()
      .map((d) => d.getModuleSpecifier())
      .filter((x): x is StringLiteral => x !== undefined),
  ]

  return compact(
    await Promise.all(
      stringLiterals.map((literal) => resolveStringLiteral(directory, isDeclaration, pathsResolver, literal)),
    ),
  )
}

async function resolveStringLiteral(
  directory: string,
  isDeclaration: boolean,
  pathsResolver: TsConfigPathsResolver,
  literal: StringLiteral,
) {
  const text = literal.getText()
  const start = literal.getStart() + 1
  const end = literal.getEnd() - 1
  const specifier = text.slice(1, -1)
  const path = await resolvePath({
    directory,
    specifier,
    extensions: isDeclaration ? ['.d.ts', ...EXTENSIONS] : EXTENSIONS,
    mainFields: ['module', 'jsnext:main', 'main'],
    pathsResolver,
  })

  return pipe(
    path,
    mapOption(
      (filePath): Dependency => ({
        specifier,
        filePath,
        fileExtension: getFileExtension(filePath),
        position: { start, end },
        isNodeBuiltin: builtins.includes(specifier),
      }),
    ),
  )
}
