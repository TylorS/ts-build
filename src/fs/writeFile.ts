import { promises } from 'fs'
import { dirname } from 'path'

import { ensureDirectoryExists } from './ensureDirectoryExists'

export async function writeFile(filePath: string, contents: string) {
  ensureDirectoryExists(dirname(filePath))

  await promises.writeFile(filePath, contents)
}
