import { pipe } from 'fp-ts/function'
import { map as mapOption, none, Option, some } from 'fp-ts/Option'
import { compact } from 'fp-ts/ReadonlyArray'
import { existsSync, promises, statSync } from 'fs'
import { basename, join, relative } from 'path'

import { EXTENSIONS } from './constants'
import { getFileExtension } from './helpers/getFileExtension'
import { DirectoryInputModule, FileInputModule, InputModule } from './types'

export async function readInputModules(directory: string) {
  const relativePaths = await promises.readdir(directory)
  const paths = relativePaths.map((p) => join(directory, p))
  const files = paths.filter((p) => statSync(p).isFile())
  const directories = paths.filter((p) => statSync(p).isDirectory())
  const modules: readonly InputModule[] = [
    ...compact(files.map(filePathToModule(directory))),
    ...directories.map(directoryToModule(directory)),
  ]

  return modules
}

function filePathToModule(directory: string) {
  return (filePath: string): Option<FileInputModule> => {
    const extension = getFileExtension(filePath)

    if (extension !== '.js') {
      return none
    }

    return some({ type: 'file', filePath: relative(directory, filePath) })
  }
}

function directoryToModule(baseDirectory: string) {
  return (directory: string): DirectoryInputModule => {
    return {
      type: 'directory',
      directory: relative(baseDirectory, directory),
      filePath: pipe(
        directory,
        findEntrypoint,
        mapOption((p) => relative(baseDirectory, p)),
      ),
    }
  }
}

function findEntrypoint(directory: string) {
  const pathsToTry = ['index', 'exports', basename(directory)].flatMap((base) =>
    EXTENSIONS.map((ext) => join(directory, base + ext)),
  )

  for (const path of pathsToTry) {
    if (existsSync(path)) {
      return some(path)
    }
  }

  return none
}
