import JSZip from "jszip"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { originalFleetPack } from "../../src/domain/xingchao/content-pack.ts"
import { ContentPackServiceImpl } from "./node.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function createArchivePath(root: string): Promise<string> {
  const zip = new JSZip()
  zip.file("manifest.json", JSON.stringify({ ...originalFleetPack, id: "service-test-pack" }))
  const filePath = path.join(root, "service-test-pack.xcp")
  await writeFile(filePath, await zip.generateAsync({ type: "uint8array" }))
  return filePath
}

describe("ContentPackServiceImpl", () => {
  it("keeps archive selection and removal confirmation in the main-process service", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const selectedPath = await createArchivePath(root)
    const confirmRemoval = vi.fn(async () => true)
    const service = new ContentPackServiceImpl({
      appVersion: "0.1.0",
      confirmRemoval,
      selectArchivePath: async () => selectedPath,
      userDataDirectory: root,
    })

    await expect(service.list()).resolves.toHaveLength(1)
    await expect(service.install()).resolves.toMatchObject({ id: "service-test-pack", source: "installed" })
    await expect(service.list()).resolves.toHaveLength(2)
    await expect(service.remove({ id: "service-test-pack", version: "1.0.0" })).resolves.toBe(true)
    expect(confirmRemoval).toHaveBeenCalledOnce()
    await expect(service.list()).resolves.toHaveLength(1)
  })

  it("does nothing when the picker is cancelled or the target is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const service = new ContentPackServiceImpl({
      appVersion: "0.1.0",
      confirmRemoval: async () => false,
      selectArchivePath: async () => undefined,
      userDataDirectory: root,
    })
    await expect(service.install()).resolves.toBeNull()
    await expect(service.remove({ id: "missing-pack", version: "1.0.0" })).resolves.toBe(false)
  })
})
