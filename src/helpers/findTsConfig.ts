import { none, Option, some } from 'fp-ts/Option'
import * as fs from 'fs'
import { basename, dirname, resolve } from 'path'
import { sync as nodeResolve } from 'resolve'
import {
  convertCompilerOptionsFromJson,
  findConfigFile,
  FormatDiagnosticsHost,
  formatDiagnosticsWithColorAndContext,
  getDefaultCompilerOptions,
  parseConfigFileTextToJson,
  sys,
} from 'typescript'

import { TsConfig } from '../types/TsConfig'

export type FindTsConfigOptions = {
  readonly directory: string
  readonly configFileName?: string
}

export const DEFAULT_TSCONFIG_FILENAME = 'tsconfig.json'

export function findTsConfig({
  directory,
  configFileName = DEFAULT_TSCONFIG_FILENAME,
}: FindTsConfigOptions): Option<TsConfig> {
  const configPath = findConfigFile(directory, sys.fileExists, configFileName)

  if (!configPath) {
    return none
  }

  const formatHost: FormatDiagnosticsHost = {
    getCanonicalFileName: (path) => resolve(directory, path),
    getCurrentDirectory: () => directory,
    getNewLine: () => sys.newLine,
  }
  const baseConfig = parseConfigFile(directory, configPath, formatHost)

  if (baseConfig.extends) {
    const extensions = Array.isArray(baseConfig.extends) ? baseConfig.extends : [baseConfig.extends]
    const extendedConfigPaths = extensions.map((ext) => nodeResolve(ext, { basedir: dirname(configPath) }))
    const extendedConfigs = extendedConfigPaths.map((path) => parseConfigFile(directory, path, formatHost))

    return some(extendedConfigs.reduceRight(mergeConfigs, baseConfig))
  }

  return some(baseConfig)
}

function mergeConfigs(base: TsConfig, extension: TsConfig): TsConfig {
  return {
    ...extension,
    ...base,
    compilerOptions: {
      ...extension.compilerOptions,
      ...base.compilerOptions,
    },
  }
}

function parseConfigFile(directory: string, filePath: string, host: FormatDiagnosticsHost): TsConfig {
  const fileName = basename(filePath)
  const contents = fs.readFileSync(filePath).toString()
  const { config } = parseConfigFileTextToJson(filePath, contents)
  const { options, errors } = convertCompilerOptionsFromJson(config.compilerOptions, directory, fileName)

  if (errors && errors.length > 0) {
    throw new Error(formatDiagnosticsWithColorAndContext(errors, host))
  }

  return {
    ...config,
    compilerOptions: { ...getDefaultCompilerOptions(), ...options },
    configPath: filePath,
  }
}
