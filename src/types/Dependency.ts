import { Position } from './Position'

export interface Dependency {
  readonly specifier: string
  readonly filePath: string
  readonly fileExtension: string
  readonly position: Position
  readonly isNodeBuiltin: boolean
}
