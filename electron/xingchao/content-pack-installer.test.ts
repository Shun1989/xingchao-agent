import JSZip from "jszip"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { originalFleetPack } from "../../src/domain/xingchao/content-pack.ts"
import { installContentPackArchive } from "./content-pack-installer.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function createArchive(options: { asset?: string; checksum?: string; path?: string } = {}): Promise<Uint8Array> {
  const zip = new JSZip()
  const assetPath = options.path ?? "portraits/lanxi.png"
  const asset = options.asset
  const checksums = asset ? { [assetPath]: options.checksum ?? createHash("sha256").update(asset).digest("hex") } : {}
  zip.file("manifest.json", JSON.stringify({ ...originalFleetPack, id: "weekly-test-pack", checksums }))
  if (asset) zip.file(assetPath, asset)
  return zip.generateAsync({ type: "uint8array" })
}

describe("content-pack installer", () => {
  it("installs a validated pack atomically under the app data directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-"))
    temporaryDirectories.push(root)
    const installed = await installContentPackArchive(await createArchive({ asset: "portrait" }), root)
    expect(installed).toMatchObject({ id: "weekly-test-pack", version: "1.0.0" })
    expect(await readFile(path.join(installed.directory, "portraits", "lanxi.png"), "utf8")).toBe("portrait")
  })

  it("rejects traversal and checksum mismatches without leaving an installed pack", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-"))
    temporaryDirectories.push(root)
    await expect(
      installContentPackArchive(await createArchive({ asset: "bad", path: "../escape.png" }), root),
    ).rejects.toThrow(/rejected|missing file/i)
    await expect(
      installContentPackArchive(await createArchive({ asset: "bad", checksum: "0".repeat(64) }), root),
    ).rejects.toThrow(/checksum mismatch/i)
  })
})
