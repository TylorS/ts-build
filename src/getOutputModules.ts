import { pipe } from 'fp-ts/function'
import { getOrElse, map as mapOption } from 'fp-ts/Option'
import { basename, join, relative, resolve } from 'path'

import { JS_REGEX, OUT_DIR } from './constants'
import { getFileExtension } from './helpers/getFileExtension'
import {
  DirectoryInputModule,
  Document,
  ExportMap,
  FileInputModule,
  InputModule,
  OutputModule,
  PackageJson,
} from './types'

export type GetOutputModulesOptions = {
  readonly directory: string
  readonly inputModules: readonly InputModule[]
  readonly documents: readonly Document[]
}

export function getOutputModules({
  directory,
  inputModules,
  documents,
}: GetOutputModulesOptions): readonly OutputModule[] {
  return inputModules.map((m) =>
    m.type === 'file'
      ? createFileOutputModule(directory, m, documents)
      : createDirectoryOutputModule(directory, m, documents),
  )
}

function createFileOutputModule(
  directory: string,
  input: FileInputModule,
  documents: readonly Document[],
): OutputModule {
  const main = basename(input.filePath)
  const relatedFiles = getRelatedFiles(input.filePath)
  const docs = documents.filter((d) => relatedFiles.some((f) => d.filePath.endsWith(f)))
  const exports = getExportMap(directory, main, docs)
  const output: OutputModule = {
    name: main.replace(new RegExp(`${getFileExtension(main)}$`, ''), ''),
    documents: docs,
    packageJson: generatePackageJsonWithMain(main, exports),
    input,
  }

  return output
}

function createDirectoryOutputModule(
  directory: string,
  input: DirectoryInputModule,
  documents: readonly Document[],
): OutputModule {
  const isWithinDirectory = (d: Document, outDir: string) => {
    const absoluteOutDir = resolve(directory, outDir)
    const relativePath = relative(absoluteOutDir, d.filePath)

    return relativePath.startsWith(input.directory)
  }

  const name = basename(input.directory)
  const docs = documents.filter((d) => isWithinDirectory(d, OUT_DIR))
  const packageJson = pipe(
    input.filePath,
    mapOption((filePath) =>
      pipe(filePath, basename, (x) => generatePackageJsonWithMain(x, getExportMap(directory, filePath, docs))),
    ),
    getOrElse(
      (): PackageJson => ({
        type: 'directory',
        package: {
          sideEffects: false,
          exports: getExportMap(directory, `${Math.random()}`, docs),
        },
      }),
    ),
  )
  const output: OutputModule = {
    name,
    documents: docs,
    packageJson,
    input,
  }

  return output
}

function getRelatedFiles(filePath: string) {
  const path = filePath.replace(getFileExtension(filePath), '')

  return ['.js', '.js.map', '.d.ts', '.d.ts.map'].map((ext) => path + ext)
}

function generatePackageJsonWithMain(main: string, exports: ExportMap): PackageJson {
  const types = ensureRelative(main.replace(JS_REGEX, '.d.ts'))

  return {
    type: 'main',
    package: {
      type: 'module',
      main: ensureRelative(main),
      types,
      typings: types,
      sideEffects: false,
      exports,
    },
  }
}

function getExportMap(directory: string, main: string, documents: readonly Document[]): ExportMap {
  const map: Record<keyof ExportMap, ExportMap[keyof ExportMap]> = {}
  const esmDir = join(directory, OUT_DIR)

  for (const esmDoc of documents) {
    const path = relative(esmDir, esmDoc.filePath)

    if (!JS_REGEX.test(path)) {
      continue
    }

    const isMain = relative(esmDir, esmDoc.filePath) === main

    map[isMain ? '.' : ensureRelative(path)] = {
      import: ensureRelative(path.replace(JS_REGEX, '.mjs')),
    }
  }

  return map
}

function ensureRelative(path: string) {
  if (path.startsWith('.')) {
    return path
  }

  return './' + path
}
