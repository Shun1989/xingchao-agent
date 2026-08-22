import JSZip from "jszip"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { originalFleetPack } from "../../src/domain/xingchao/content-pack.ts"
import { ContentPackServiceImpl } from "./node.ts"
import { ContentPackRuntimeManager } from "./runtime-manager.ts"
import { ContentPackSelectionStore } from "./selection-store.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function createArchivePath(root: string, version = "1.0.0"): Promise<string> {
  const zip = new JSZip()
  zip.file("manifest.json", JSON.stringify({ ...originalFleetPack, id: "service-test-pack", version }))
  const filePath = path.join(root, `service-test-pack-${version}.xcp`)
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
      confirmRemoval,
      confirmSelection: async () => true,
      runtimeManager: new ContentPackRuntimeManager({ appVersion: "0.1.0", userDataDirectory: root }),
      selectArchivePath: async () => selectedPath,
    })

    await expect(service.list()).resolves.toEqual([expect.objectContaining({ selected: true, source: "builtin" })])
    await expect(service.install()).resolves.toMatchObject({
      id: "service-test-pack",
      selected: false,
      source: "installed",
    })
    await expect(service.list()).resolves.toHaveLength(2)
    await expect(service.remove({ id: "service-test-pack", version: "1.0.0" })).resolves.toBe(true)
    expect(confirmRemoval).toHaveBeenCalledOnce()
    await expect(service.list()).resolves.toHaveLength(1)
  })

  it("does nothing when the picker is cancelled or the target is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const service = new ContentPackServiceImpl({
      confirmRemoval: async () => false,
      confirmSelection: async () => false,
      runtimeManager: new ContentPackRuntimeManager({ appVersion: "0.1.0", userDataDirectory: root }),
      selectArchivePath: async () => undefined,
    })
    await expect(service.install()).resolves.toBeNull()
    await expect(service.remove({ id: "missing-pack", version: "1.0.0" })).resolves.toBe(false)
  })

  it("returns the serializable built-in runtime fleet snapshot with no selected packs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const service = new ContentPackServiceImpl({
      confirmRemoval: async () => true,
      confirmSelection: async () => true,
      runtimeManager: new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root }),
      selectArchivePath: async () => undefined,
    })

    const snapshot = await service.runtimeFleet()

    expect(snapshot.crews.some((crew) => crew.id === "watchtide")).toBe(true)
    expect(snapshot.sources.crews.watchtide).toEqual({
      kind: "builtin",
      packId: "xingchao-original-fleet",
      packVersion: "1.0.0",
    })
    const wire = JSON.stringify(snapshot)
    expect(wire).not.toMatch(/content-packs|checksums|allowedTools|evaluations|persona|voice|localId/i)
  })

  it("persists one selected installed version and builds the runtime catalog from it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const archivePaths = [await createArchivePath(root, "1.0.0"), await createArchivePath(root, "2.0.0")]
    const confirmSelection = vi.fn(async () => true)
    const runtimeManager = new ContentPackRuntimeManager({ appVersion: "2.0.0", userDataDirectory: root })
    const service = new ContentPackServiceImpl({
      confirmRemoval: async () => true,
      confirmSelection,
      runtimeManager,
      selectArchivePath: async () => archivePaths.shift(),
    })
    await service.install()
    await service.install()

    await expect(service.setSelection({ id: "service-test-pack", selected: true, version: "1.0.0" })).resolves.toBe(
      true,
    )
    await expect(service.setSelection({ id: "service-test-pack", selected: true, version: "2.0.0" })).resolves.toBe(
      true,
    )

    const restartedRuntimeManager = new ContentPackRuntimeManager({
      appVersion: "2.0.0",
      userDataDirectory: root,
    })
    const restartedService = new ContentPackServiceImpl({
      confirmRemoval: async () => true,
      confirmSelection: async () => true,
      runtimeManager: restartedRuntimeManager,
      selectArchivePath: async () => undefined,
    })
    const summaries = await restartedService.list()
    expect(summaries).toContainEqual(expect.objectContaining({ selected: true, source: "builtin" }))
    expect(summaries).toContainEqual(
      expect.objectContaining({ id: "service-test-pack", selected: false, version: "1.0.0" }),
    )
    expect(summaries).toContainEqual(
      expect.objectContaining({ id: "service-test-pack", selected: true, version: "2.0.0" }),
    )
    const snapshot = await restartedService.runtimeFleet()
    expect(snapshot.crews.some((crew) => crew.id === "service-test-pack--watchtide")).toBe(true)
    expect(snapshot.sources.crews["service-test-pack--watchtide"]).toEqual({
      kind: "installed",
      packId: "service-test-pack",
      packVersion: "2.0.0",
    })
    const wire = JSON.stringify(snapshot)
    expect(wire).not.toMatch(/content-packs|checksums|allowedTools|evaluations|persona|voice|localId/i)
    expect(confirmSelection).toHaveBeenCalledTimes(2)
  })

  it("propagates runtime fleet projection failures without returning a partial snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const runtimeManager = new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root })
    const catalog = await runtimeManager.runtimeCatalog()
    vi.spyOn(runtimeManager, "runtimeCatalog").mockResolvedValue({
      ...catalog,
      crews: Array.from({ length: 101 }, () => catalog.crews[0]),
    })
    const service = new ContentPackServiceImpl({
      confirmRemoval: async () => true,
      confirmSelection: async () => true,
      runtimeManager,
      selectArchivePath: async () => undefined,
    })

    await expect(service.runtimeFleet()).rejects.toThrow(/runtime fleet exceeds 100 crews/i)
  })

  it("does not change selection when confirmation is cancelled and rejects missing packs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const selectedPath = await createArchivePath(root)
    const service = new ContentPackServiceImpl({
      confirmRemoval: async () => true,
      confirmSelection: async () => false,
      runtimeManager: new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root }),
      selectArchivePath: async () => selectedPath,
    })
    await service.install()

    await expect(service.setSelection({ id: "service-test-pack", selected: true, version: "1.0.0" })).resolves.toBe(
      false,
    )
    await expect(service.list()).resolves.toContainEqual(
      expect.objectContaining({ id: "service-test-pack", selected: false }),
    )
    await expect(service.setSelection({ id: "missing-pack", selected: true, version: "1.0.0" })).rejects.toThrow(
      /not installed/i,
    )
    await expect(
      service.setSelection({ id: originalFleetPack.id, selected: false, version: originalFleetPack.version }),
    ).rejects.toThrow(/built-in/i)
  })

  it("rejects a non-boolean selection value at the main-process boundary", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const selectedPath = await createArchivePath(root)
    const confirmSelection = vi.fn(async () => true)
    const service = new ContentPackServiceImpl({
      confirmRemoval: async () => true,
      confirmSelection,
      runtimeManager: new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root }),
      selectArchivePath: async () => selectedPath,
    })
    await service.install()

    await expect(
      service.setSelection({
        id: "service-test-pack",
        selected: "yes" as unknown as boolean,
        version: "1.0.0",
      }),
    ).rejects.toThrow(/invalid content pack selection request/i)
    expect(confirmSelection).not.toHaveBeenCalled()
    await expect(new ContentPackSelectionStore(root).read()).resolves.toEqual(new Map())
  })

  it("clears a selected version after deselection or removal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-service-"))
    temporaryDirectories.push(root)
    const selectedPath = await createArchivePath(root)
    const service = new ContentPackServiceImpl({
      confirmRemoval: async () => true,
      confirmSelection: async () => true,
      runtimeManager: new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root }),
      selectArchivePath: async () => selectedPath,
    })
    await service.install()
    await service.setSelection({ id: "service-test-pack", selected: true, version: "1.0.0" })

    await expect(service.setSelection({ id: "service-test-pack", selected: false, version: "1.0.0" })).resolves.toBe(
      true,
    )
    await expect(new ContentPackSelectionStore(root).read()).resolves.toEqual(new Map())

    await service.setSelection({ id: "service-test-pack", selected: true, version: "1.0.0" })
    await expect(service.remove({ id: "service-test-pack", version: "1.0.0" })).resolves.toBe(true)
    await expect(new ContentPackSelectionStore(root).read()).resolves.toEqual(new Map())
  })
})
