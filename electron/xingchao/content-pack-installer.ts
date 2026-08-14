import JSZip from "jszip"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { validateContentPack } from "../../src/domain/xingchao/content-pack.ts"
import { inspectContentPackEntries } from "../../src/domain/xingchao/pack-security.ts"

export interface InstalledContentPack {
  id: string
  version: string
  directory: string
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function installContentPackArchive(
  archive: Uint8Array,
  userDataDirectory: string,
): Promise<InstalledContentPack> {
  const zip = await JSZip.loadAsync(archive, { createFolders: false })
  const files = Object.values(zip.files).filter((entry) => !entry.dir)
  const descriptors = files.map((entry) => ({
    path: entry.name,
    size: (entry as typeof entry & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0,
  }))
  const inspection = inspectContentPackEntries(descriptors)
  if (!inspection.accepted) throw new Error(`Content pack rejected: ${inspection.errors.join("; ")}`)
  const fileBytes = new Map(
    await Promise.all(files.map(async (entry) => [entry.name, await entry.async("uint8array")] as const)),
  )

  const manifestEntry = zip.file("manifest.json")
  if (!manifestEntry) throw new Error("Content pack is missing manifest.json")
  const manifest = validateContentPack(JSON.parse(await manifestEntry.async("text")))
  const archivePaths = new Set(files.map((entry) => entry.name.replaceAll("\\", "/")))

  for (const [assetPath, expectedHash] of Object.entries(manifest.checksums)) {
    const normalized = assetPath.replaceAll("\\", "/")
    if (normalized === "manifest.json") throw new Error("manifest.json cannot checksum itself")
    const entry = zip.file(normalized)
    if (!entry || !archivePaths.has(normalized)) throw new Error(`Checksum references a missing file: ${assetPath}`)
    const actualHash = sha256(fileBytes.get(entry.name) ?? new Uint8Array())
    if (actualHash !== expectedHash.toLowerCase()) throw new Error(`Checksum mismatch: ${assetPath}`)
  }

  for (const entry of files) {
    const normalized = entry.name.replaceAll("\\", "/")
    if (normalized !== "manifest.json" && !manifest.checksums[normalized]) {
      throw new Error(`Asset is missing a checksum: ${normalized}`)
    }
  }

  const packsRoot = path.resolve(userDataDirectory, "content-packs")
  const finalDirectory = path.join(packsRoot, manifest.id, manifest.version)
  if (await pathExists(finalDirectory))
    throw new Error(`Content pack is already installed: ${manifest.id}@${manifest.version}`)

  const stagingDirectory = path.join(packsRoot, ".staging", randomUUID())
  try {
    for (const entry of files) {
      const normalized = entry.name.replaceAll("\\", "/")
      const destination = path.join(stagingDirectory, ...normalized.split("/"))
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, fileBytes.get(entry.name) ?? new Uint8Array(), { mode: 0o600 })
    }
    await mkdir(path.dirname(finalDirectory), { recursive: true })
    await rename(stagingDirectory, finalDirectory)
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true })
    throw error
  }

  return { id: manifest.id, version: manifest.version, directory: finalDirectory }
}
