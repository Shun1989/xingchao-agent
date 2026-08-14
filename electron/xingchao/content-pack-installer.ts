import type { ContentPackManifest } from "../../src/domain/xingchao/types.ts"

import JSZip from "jszip"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { originalFleetPack, validateContentPack } from "../../src/domain/xingchao/content-pack.ts"
import { inspectContentPackEntries } from "../../src/domain/xingchao/pack-security.ts"

export interface InstalledContentPack {
  id: string
  version: string
  directory: string
  installedAt: number
  manifest: ContentPackManifest
}

export interface ContentPackInstallOptions {
  currentAppVersion?: string
  reservedPackIds?: readonly string[]
}

const safeId = /^[a-z0-9][a-z0-9-]{1,63}$/
const safeVersion = /^\d+\.\d+\.\d+$/
const manifestSizeLimit = 1024 * 1024

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

function isZipSymlink(entry: JSZip.JSZipObject): boolean {
  const permissions =
    typeof entry.unixPermissions === "string" ? Number.parseInt(entry.unixPermissions, 8) : entry.unixPermissions
  return typeof permissions === "number" && (permissions & 0o170000) === 0o120000
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function requireSafeIdentity(id: string, version: string): void {
  if (!safeId.test(id) || !safeVersion.test(version)) throw new Error("Invalid content pack identity")
}

function packsRoot(userDataDirectory: string): string {
  return path.resolve(userDataDirectory, "content-packs")
}

export async function installContentPackArchive(
  archive: Uint8Array,
  userDataDirectory: string,
  options: ContentPackInstallOptions = {},
): Promise<InstalledContentPack> {
  const zip = await JSZip.loadAsync(archive, { createFolders: false })
  const files = Object.values(zip.files).filter((entry) => !entry.dir)
  const descriptors = files.map((entry) => ({
    path: entry.name,
    size: (entry as typeof entry & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0,
    symlink: isZipSymlink(entry),
  }))
  const inspection = inspectContentPackEntries(descriptors)
  if (!inspection.accepted) throw new Error(`Content pack rejected: ${inspection.errors.join("; ")}`)
  const fileBytes = new Map(
    await Promise.all(files.map(async (entry) => [entry.name, await entry.async("uint8array")] as const)),
  )

  const manifestEntry = zip.file("manifest.json")
  if (!manifestEntry) throw new Error("Content pack is missing manifest.json")
  const manifest = validateContentPack(JSON.parse(await manifestEntry.async("text")))
  requireSafeIdentity(manifest.id, manifest.version)
  const reservedPackIds = new Set([originalFleetPack.id, ...(options.reservedPackIds ?? [])])
  if (reservedPackIds.has(manifest.id)) throw new Error(`Content pack ID is reserved: ${manifest.id}`)
  if (options.currentAppVersion && compareVersions(options.currentAppVersion, manifest.minimumAppVersion) < 0) {
    throw new Error(`Content pack requires app version ${manifest.minimumAppVersion} or newer`)
  }
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

  const root = packsRoot(userDataDirectory)
  const finalDirectory = path.join(root, manifest.id, manifest.version)
  if (await pathExists(finalDirectory))
    throw new Error(`Content pack is already installed: ${manifest.id}@${manifest.version}`)

  const stagingDirectory = path.join(root, ".staging", randomUUID())
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

  const installed = await stat(finalDirectory)
  return {
    id: manifest.id,
    version: manifest.version,
    directory: finalDirectory,
    installedAt: installed.mtimeMs,
    manifest,
  }
}

export async function listInstalledContentPacks(userDataDirectory: string): Promise<InstalledContentPack[]> {
  const root = packsRoot(userDataDirectory)
  let idEntries
  try {
    idEntries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  const installed: InstalledContentPack[] = []
  for (const idEntry of idEntries) {
    if (!idEntry.isDirectory() || idEntry.name === ".staging" || !safeId.test(idEntry.name)) continue
    const idDirectory = path.join(root, idEntry.name)
    const versionEntries = await readdir(idDirectory, { withFileTypes: true })
    for (const versionEntry of versionEntries) {
      if (!versionEntry.isDirectory() || !safeVersion.test(versionEntry.name)) continue
      const directory = path.join(idDirectory, versionEntry.name)
      try {
        const manifestPath = path.join(directory, "manifest.json")
        const manifestStat = await stat(manifestPath)
        if (manifestStat.size > manifestSizeLimit) throw new Error("manifest.json exceeds the size limit")
        const manifest = validateContentPack(JSON.parse(await readFile(manifestPath, "utf8")))
        if (manifest.id !== idEntry.name || manifest.version !== versionEntry.name) {
          throw new Error("Manifest identity does not match its install directory")
        }
        const directoryStat = await stat(directory)
        installed.push({
          directory,
          id: manifest.id,
          installedAt: directoryStat.mtimeMs,
          manifest,
          version: manifest.version,
        })
      } catch (error) {
        console.warn(`[xingchao] ignoring invalid installed content pack ${idEntry.name}@${versionEntry.name}:`, error)
      }
    }
  }
  return installed.sort((left, right) => right.installedAt - left.installedAt || left.id.localeCompare(right.id))
}

export async function removeInstalledContentPack(
  userDataDirectory: string,
  id: string,
  version: string,
): Promise<boolean> {
  requireSafeIdentity(id, version)
  if (id === originalFleetPack.id) throw new Error("The built-in original fleet cannot be removed")
  const root = packsRoot(userDataDirectory)
  const directory = path.join(root, id, version)
  if (!(await pathExists(directory))) return false
  await rm(directory, { force: false, recursive: true })
  const idDirectory = path.dirname(directory)
  if ((await readdir(idDirectory)).length === 0) await rmdir(idDirectory)
  return true
}
