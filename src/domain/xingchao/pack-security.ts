const allowedAssetExtensions = new Set([
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".wav",
  ".mp3",
  ".ogg",
  ".moc3",
  ".model3",
  ".motion3",
  ".exp3",
])

export interface PackEntryDescriptor {
  path: string
  size: number
  mimeType?: string
}

export interface PackInspection {
  accepted: boolean
  errors: string[]
}

export const CONTENT_PACK_LIMITS = {
  maxEntries: 512,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
} as const

export function inspectContentPackEntries(entries: readonly PackEntryDescriptor[]): PackInspection {
  const errors: string[] = []
  if (entries.length > CONTENT_PACK_LIMITS.maxEntries) errors.push("内容包文件数量超过上限")
  let totalBytes = 0
  for (const entry of entries) {
    const normalized = entry.path.replaceAll("\\", "/")
    const segments = normalized.split("/")
    if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || segments.includes("..")) {
      errors.push(`非法路径：${entry.path}`)
    }
    if (entry.size < 0 || entry.size > CONTENT_PACK_LIMITS.maxEntryBytes) errors.push(`文件大小超限：${entry.path}`)
    totalBytes += Math.max(0, entry.size)
    const suffix = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".")).toLocaleLowerCase() : ""
    if (!allowedAssetExtensions.has(suffix)) errors.push(`不允许的文件类型：${entry.path}`)
  }
  if (totalBytes > CONTENT_PACK_LIMITS.maxTotalBytes) errors.push("内容包解压后总大小超过上限")
  return { accepted: errors.length === 0, errors }
}
