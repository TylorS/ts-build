// TODO: Should this detect if something is using your same baseUrl/origin?
export const isExternalUrl = (path: string): boolean => {
  try {
    return new URL(path).href === path
  } catch {
    return false
  }
}
