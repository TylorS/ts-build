import { existsSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import rimraf from 'rimraf'
import { CustomTransformers } from 'typescript'

import { OUT_DIR } from './constants'
import { createDocuments } from './createDocuments'
import { findRequiredChanges } from './findRequiredChanges'
import { generateGitIgnore } from './generateGitIgnore'
import { getOutputModules } from './getOutputModules'
import { readInputModules } from './readInputModules'
import { TsConfig } from './types/TsConfig'
import { writeChanges } from './writeChanges'

export interface BuildOptions {
  readonly directory: string
  readonly tsConfig: TsConfig

  readonly gitignoreTemplate?: string
  readonly customTransformers?: CustomTransformers
}

export async function build(options: BuildOptions) {
  console.log('Generating documents...')
  const [documents, inputModules] = await Promise.all([
    createDocuments(options),
    readInputModules(resolve(options.directory, OUT_DIR)),
  ] as const)

  console.log('Defining output modules...')
  const outputModules = getOutputModules({
    directory: options.directory,
    inputModules,
    documents,
  })

  console.log('Finding required changes...')
  const requiredChanges = findRequiredChanges(options.directory, outputModules)

  try {
    console.log('Writing changes...')
    await writeChanges(documents, requiredChanges)

    const gitignore = generateGitIgnore(options.directory, options.gitignoreTemplate ?? '.gitignore', outputModules)

    writeFileSync(join(options.directory, '.gitignore'), gitignore)

    console.log('Complete!')
  } catch (error) {
    outputModules.forEach(
      (x) => existsSync(join(options.directory, x.name)) && rimraf.sync(join(options.directory, x.name)),
    )

    throw error
  }
}
