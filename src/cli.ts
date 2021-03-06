import { pipe } from 'fp-ts/function'
import { getOrElse } from 'fp-ts/Option'
import { join } from 'path'
import { getDefaultCompilerOptions } from 'typescript'
import yargs from 'yargs'

import { build } from './build'
import { findTsConfig } from './helpers/findTsConfig'
import { TsConfig } from './types/TsConfig'

const program = yargs
  .options('tsConfig', {
    type: 'string',
    default: 'tsconfig.json',
  })
  .options('directory', { type: 'string', default: process.cwd() })
  .help()

const options = program.argv

const main = async () => {
  const tsConfig = pipe(
    findTsConfig({ directory: options.directory, configFileName: options.tsConfig }),
    getOrElse(() => defaultTsConfig),
  )

  await build({ directory: options.directory, tsConfig })
}

const defaultTsConfig: TsConfig = {
  compilerOptions: getDefaultCompilerOptions(),
  configPath: join(options.directory, 'tsconfig.json'),
  include: ['src'],
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

export {}
