import { resolve } from 'path'
import { FormatDiagnosticsHost, sys } from 'typescript'

export const createFormatHost = (directory: string): FormatDiagnosticsHost => ({
  getCanonicalFileName: (path) => resolve(directory, path),
  getCurrentDirectory: () => directory,
  getNewLine: () => sys.newLine,
})
