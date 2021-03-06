import { Option } from 'fp-ts/Option'

import { Document } from './Document'

export type OutputModule = {
  readonly name: string
  readonly packageJson: PackageJson
  readonly documents: readonly Document[]
  readonly input: InputModule
}

export type PackageJson =
  | {
      readonly type: 'main'
      readonly package: {
        readonly type: 'module'
        readonly main: string
        readonly types: string
        readonly typings: string
        readonly sideEffects: false
        readonly exports: ExportMap
      }
    }
  | {
      readonly type: 'directory'
      readonly package: {
        readonly sideEffects: false
        readonly exports: ExportMap
      }
    }

export type ExportMap = Record<string, { import: string }>

export type InputModule = FileInputModule | DirectoryInputModule

export type FileInputModule = {
  readonly type: 'file'
  readonly filePath: string
}

export type DirectoryInputModule = {
  readonly type: 'directory'
  readonly directory: string
  readonly filePath: Option<string>
}
