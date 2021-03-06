import remapping from '@ampproject/remapping'
import { pipe } from 'fp-ts/lib/function'
import { isSome } from 'fp-ts/lib/Option'
import { contramap, ordNumber } from 'fp-ts/lib/Ord'
import { groupBy, sort } from 'fp-ts/lib/ReadonlyNonEmptyArray'
import { map } from 'fp-ts/lib/ReadonlyRecord'
import { existsSync, promises, writeFileSync } from 'fs'
import MagicString from 'magic-string'
import { basename } from 'path'
import rimraf from 'rimraf'

import {
  CreateDirectory,
  MoveFile,
  RequiredChange,
  RewriteImport,
  RewriteSources,
  WritePackageJson,
} from './findRequiredChanges'
import { Document } from './types'

const ordRequredChange = pipe(
  ordNumber,
  contramap((x: Exclude<RequiredChange, CreateDirectory>) => (x.type === 'move' ? 1 : -1)),
)

export async function writeChanges(documents: readonly Document[], requiredChanges: ReadonlyArray<RequiredChange>) {
  const directoriesToCreate = requiredChanges.filter((x): x is CreateDirectory => x.type === 'create-directory')
  const documentsToMove = requiredChanges.filter((x): x is MoveFile => x.type === 'move')
  const importsToRewrite = requiredChanges.filter((x): x is RewriteImport => x.type === 'rewrite-import')
  const sourcesToRewrite = requiredChanges.filter((x): x is RewriteSources => x.type === 'rewrite-sources')
  const packageJsonsToWrite = requiredChanges.filter((x): x is WritePackageJson => x.type === 'write-package-json')
  const importsToRewriteByDocument = pipe(
    importsToRewrite,
    groupBy((x) => x.document),
    map(sort(ordRequredChange)),
  )
  const whereToMoveByDocument = pipe(
    documentsToMove,
    groupBy((x) => x.from),
  )
  const sourcesToRewriteByDocument = pipe(
    sourcesToRewrite,
    groupBy((x) => x.document),
  )

  await Promise.all(
    directoriesToCreate.map(({ directory }) =>
      !existsSync(directory) ? promises.mkdir(directory) : (rimraf.sync(directory), promises.mkdir(directory)),
    ),
  )
  await Promise.all(packageJsonsToWrite.map(({ filePath, content }) => promises.writeFile(filePath, content)))

  for (const document of documents) {
    const changes = importsToRewriteByDocument[document.filePath] ?? []

    if (changes.length === 0) {
      continue
    }

    const ms = new MagicString(document.contents, {
      filename: basename(document.filePath),
      indentExclusionRanges: [],
    })

    // Rewrite imports pointing to other source files
    for (const change of changes) {
      ms.overwrite(change.dependency.position.start, change.dependency.position.end, change.specifier)
    }

    const builtins = document.dependencies.filter((x) => x.isNodeBuiltin)

    // Rewrite node builtins to point to find
    for (const { specifier, position } of builtins) {
      if (!specifier.startsWith('node')) {
        ms.overwrite(position.start, position.end, `node:${specifier}`)
      }
    }

    const { to } = whereToMoveByDocument[document.filePath][0]
    const updatedContent = ms.toString()

    writeFileSync(to, updatedContent)

    if (isSome(document.sourceMap)) {
      const updatedSourceMap = JSON.parse(ms.generateMap({ file: basename(document.filePath) }).toString())
      const sourceMapPath = document.sourceMap.value
      const { to } = whereToMoveByDocument[sourceMapPath][0]

      const sourcesToRewrite = sourcesToRewriteByDocument[sourceMapPath] ?? []
      const sourceMapDocument = documents.find((x) => x.filePath === sourceMapPath)!
      const currentContent = JSON.parse(sourceMapDocument.contents)

      if (sourcesToRewrite.length > 0) {
        currentContent.sources = sourcesToRewrite.flatMap((x) => x.sources)
      }

      console.log(currentContent, updatedSourceMap)

      const remapped = remapping([updatedSourceMap, currentContent], () => null).toString()

      writeFileSync(to, remapped)
    }
  }
}
