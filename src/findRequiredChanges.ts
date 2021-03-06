import { RawSourceMap } from '@ampproject/remapping/dist/types/types'
import { eqStrict } from 'fp-ts/lib/Eq'
import { getEq } from 'fp-ts/lib/ReadonlyArray'
import { basename, dirname, join, relative, resolve } from 'path'

import { Dependency, Document, OutputModule } from './types'

const stringArrayEq = getEq(eqStrict)

export type RequiredChange = RewriteImport | MoveFile | CreateDirectory | RewriteSources | WritePackageJson

export type RewriteImport = {
  readonly type: 'rewrite-import'
  readonly document: string
  readonly dependency: Dependency
  readonly specifier: string
}

export type MoveFile = {
  readonly type: 'move'
  readonly from: string
  readonly to: string
}

export type CreateDirectory = {
  readonly type: 'create-directory'
  readonly directory: string
}

export type WritePackageJson = {
  readonly type: 'write-package-json'
  readonly filePath: string
  readonly content: string
}

export type RewriteSources = {
  readonly type: 'rewrite-sources'
  readonly document: string
  readonly sources: ReadonlyArray<string>
}

export function findRequiredChanges(directory: string, modules: readonly OutputModule[]): readonly RequiredChange[] {
  const documents = modules.flatMap((module) => module.documents)
  const requiredChanges: RequiredChange[] = []
  const inputPathToOutputPath = new Map<string, string>()

  for (const module of modules) {
    const outputDirectory = join(directory, module.name)

    requiredChanges.push({ type: 'create-directory', directory: outputDirectory })
    requiredChanges.push({
      type: 'write-package-json',
      filePath: join(outputDirectory, 'package.json'),
      content: JSON.stringify(module.packageJson.package, null, 2),
    })

    for (const document of module.documents) {
      const outputPath = findOutputFilePath(directory, module, document)

      inputPathToOutputPath.set(document.filePath, outputPath)
    }
  }

  for (const document of documents) {
    const documentOutputPath = inputPathToOutputPath.get(document.filePath)!

    for (const dependency of document.dependencies) {
      const dependencyOutputPath = inputPathToOutputPath.get(dependency.filePath)

      if (dependencyOutputPath) {
        const filePath = relative(dirname(documentOutputPath), dependencyOutputPath)

        requiredChanges.push({ type: 'rewrite-import', document: document.filePath, dependency, specifier: filePath })
      }
    }

    if (document.fileExtension.endsWith('.map')) {
      const sourceMap = JSON.parse(document.contents) as RawSourceMap

      if (sourceMap.sources) {
        const rewrittenSources = sourceMap.sources.map((x) =>
          x ? rewriteSource(document, inputPathToOutputPath, x) : x,
        )

        if (!stringArrayEq.equals(sourceMap.sources, rewrittenSources)) {
          requiredChanges.push({
            type: 'rewrite-sources',
            document: document.filePath,
            sources: rewrittenSources,
          })
        }
      }
    }
  }

  inputPathToOutputPath.forEach((to, from) => requiredChanges.push({ type: 'move', from, to }))

  return requiredChanges
}

function findOutputFilePath(directory: string, module: OutputModule, document: Document) {
  const outputDirectory = join(directory, module.name)

  if (module.input.type === 'file') {
    return join(outputDirectory, basename(document.filePath))
  }

  const relativePath = relative(module.input.directory, document.filePath)
  const outputPath = join(outputDirectory, relativePath)

  return outputPath
}

function rewriteSource(document: Document, outputPaths: Map<string, string>, sourceRelativePath: string): any {
  const filePath = resolve(dirname(document.filePath), sourceRelativePath)
  const outputPath = outputPaths.get(document.filePath)!

  if (!outputPath) {
    throw new Error(`Unable to find output path for ${document.filePath}`)
  }

  return relative(dirname(outputPath), filePath)
}
