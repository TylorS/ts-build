import { Option } from 'fp-ts/Option'

import { Dependency } from './Dependency'

export interface Document {
  readonly filePath: string
  readonly fileExtension: string
  readonly contents: string
  readonly dependencies: readonly Dependency[]
  readonly sourceMap: Option<string> // Path to sourceMap
}
