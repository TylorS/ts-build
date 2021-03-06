import * as O from 'fp-ts/Option'

import { TsConfigPathsResolver } from './createResolveTsConfigPaths'
import { isExternalUrl } from './isExternalUrl'
import { resolvePackage, ResolvePackageOptions } from './resolvePackage'

export type ResolvePathFromSourceFileOptions = ResolvePackageOptions & {
  readonly pathsResolver: TsConfigPathsResolver
}

export async function resolvePath(options: ResolvePathFromSourceFileOptions): Promise<O.Option<string>> {
  const { specifier, pathsResolver } = options

  if (pathsResolver.isInPaths(specifier)) {
    const option = await pathsResolver.resolvePath(specifier)

    if (O.isSome(option)) {
      return option
    }
  }

  if (isExternalUrl(specifier)) {
    return O.none
  }

  return O.some(await resolvePackage(options))
}
