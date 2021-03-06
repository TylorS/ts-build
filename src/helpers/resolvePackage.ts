import enhancedResolve from 'enhanced-resolve'
import { Either, isLeft, left, right } from 'fp-ts/Either'
import resolve from 'resolve'

import { getFileExtension } from './getFileExtension'

const moduleDirectory = ['node_modules', '@types']

const enhancedResolveOptions = {
  fileSystem: require('fs'),
  useSyncFileSystemCalls: true,
  enforceExtension: false,
  modules: moduleDirectory,
}

const createEnhancedResolver = (mainFields: readonly string[], extensions: readonly string[]) =>
  enhancedResolve.ResolverFactory.createResolver({
    ...enhancedResolveOptions,
    mainFields: mainFields ? Array.from(mainFields) : void 0,
    extensions: Array.from(extensions),
  })

export type ResolvePackageOptions = {
  readonly specifier: string
  readonly directory: string
  readonly extensions: readonly string[]
  readonly mainFields: readonly string[]
}

export async function resolvePackage(options: ResolvePackageOptions) {
  const { specifier, directory, extensions, mainFields } = options

  // eslint-disable-next-line require-yield
  const either = await new Promise<Either<Error, string>>((res) =>
    resolve(
      specifier,
      {
        basedir: directory,
        moduleDirectory,
        extensions,
        packageIterator,
        packageFilter: (pkg) => {
          // Prefer main fields specified
          for (const field of mainFields) {
            if (field in pkg) {
              pkg.main = pkg[field]

              return pkg
            }
          }
        },
      },
      (err, resolved) => {
        res(err ? left(err) : right(resolved!))
      },
    ),
  )

  if (isLeft(either)) {
    console.log('falling back to enhanced-resolve', specifier)

    const resolver = createEnhancedResolver(mainFields, extensions)
    const enhancedEither = await new Promise<Either<Error, string>>((res) => {
      resolver.resolve({}, directory, specifier, {}, (err, arg) => {
        res(err || !arg ? left(err ?? new Error(`Unable to resolve`)) : right(arg))
      })
    })

    if (isLeft(enhancedEither)) {
      throw either.left
    }

    return enhancedEither.right
  }

  return either.right
}

const packageIterator = (request: string, _: string, defaultCanditates: () => string[]): string[] => {
  try {
    const defaults = defaultCanditates()
    const ext = getFileExtension(request)

    if (defaults.includes(ext)) {
      return defaults
    }

    // Attempt to add the current extension to those being looked up
    return [...defaultCanditates(), ext]
  } catch {
    return defaultCanditates()
  }
}
