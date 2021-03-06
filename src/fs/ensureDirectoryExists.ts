import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export function ensureDirectoryExists(directory: string) {
  if (!existsSync(directory)) {
    ensureDirectoryExists(dirname(directory))
    mkdirSync(directory)
  }
}
