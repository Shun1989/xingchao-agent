import type { ContentPackManifest } from "../../src/domain/xingchao/types.ts"
import type { ContentPackSelectionPersistence } from "./selection-store.ts"

import JSZip from "jszip"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { originalFleetPack } from "../../src/domain/xingchao/content-pack.ts"
import { ContentPackRuntimeManager } from "./runtime-manager.ts"
import { ContentPackSelectionStore } from "./selection-store.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-runtime-"))
  temporaryDirectories.push(directory)
  return directory
}

async function archive(id: string, version = "1.0.0", minimumAppVersion = "0.1.0"): Promise<Uint8Array> {
  const manifest: ContentPackManifest = structuredClone({
    ...originalFleetPack,
    id,
    minimumAppVersion,
    version,
    visibility: "private-local" as const,
  })
  const zip = new JSZip()
  zip.file("manifest.json", JSON.stringify(manifest))
  return zip.generateAsync({ type: "uint8array" })
}

describe("ContentPackRuntimeManager", () => {
  it("serializes concurrent selections without losing either pack", async () => {
    const root = await temporaryDirectory()
    const manager = new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root })
    await manager.install(await archive("aurora-pack"))
    await manager.install(await archive("harbor-pack"))

    await Promise.all([
      manager.setSelection({ id: "aurora-pack", selected: true, version: "1.0.0" }, async () => true),
      manager.setSelection({ id: "harbor-pack", selected: true, version: "1.0.0" }, async () => true),
    ])

    await expect(new ContentPackSelectionStore(root).read()).resolves.toEqual(
      new Map([
        ["aurora-pack", "1.0.0"],
        ["harbor-pack", "1.0.0"],
      ]),
    )
  })

  it("serializes selection and removal so a removed version cannot remain selected", async () => {
    const root = await temporaryDirectory()
    const manager = new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root })
    await manager.install(await archive("aurora-pack"))
    let releaseConfirmation!: () => void
    let confirmationStarted!: () => void
    const confirmationGate = new Promise<void>((resolve) => (releaseConfirmation = resolve))
    const confirmationEntered = new Promise<void>((resolve) => (confirmationStarted = resolve))

    const selecting = manager.setSelection({ id: "aurora-pack", selected: true, version: "1.0.0" }, async () => {
      confirmationStarted()
      await confirmationGate
      return true
    })
    await confirmationEntered
    const removing = manager.remove({ id: "aurora-pack", version: "1.0.0" }, async () => true)
    releaseConfirmation()

    await expect(Promise.all([selecting, removing])).resolves.toEqual([true, true])
    await expect(manager.list()).resolves.toEqual([])
    await expect(new ContentPackSelectionStore(root).read()).resolves.toEqual(new Map())
  })

  it("aborts removal when durable selection cleanup cannot be written", async () => {
    const root = await temporaryDirectory()
    const durableStore = new ContentPackSelectionStore(root)
    let rejectWrites = false
    const selectionStore: ContentPackSelectionPersistence = {
      read: () => durableStore.read(),
      write: (selections) =>
        rejectWrites ? Promise.reject(new Error("selection storage unavailable")) : durableStore.write(selections),
    }
    const manager = new ContentPackRuntimeManager({
      appVersion: "1.0.0",
      selectionStore,
      userDataDirectory: root,
    })
    await manager.install(await archive("aurora-pack"))
    await manager.setSelection({ id: "aurora-pack", selected: true, version: "1.0.0" }, async () => true)
    rejectWrites = true

    await expect(manager.remove({ id: "aurora-pack", version: "1.0.0" }, async () => true)).rejects.toThrow(
      /selection storage unavailable/i,
    )
    await expect(manager.list()).resolves.toContainEqual(expect.objectContaining({ id: "aurora-pack", selected: true }))
  })

  it("does not overwrite selection state after an operational read failure", async () => {
    const root = await temporaryDirectory()
    const write = vi.fn(async () => undefined)
    const selectionStore: ContentPackSelectionPersistence = {
      read: async () => Promise.reject(Object.assign(new Error("access denied"), { code: "EACCES" })),
      write,
    }
    const manager = new ContentPackRuntimeManager({
      appVersion: "1.0.0",
      selectionStore,
      userDataDirectory: root,
    })
    await manager.install(await archive("aurora-pack"))

    await expect(
      manager.setSelection({ id: "aurora-pack", selected: true, version: "1.0.0" }, async () => true),
    ).rejects.toThrow(/access denied/i)
    expect(write).not.toHaveBeenCalled()
  })

  it("ignores and repairs a selection that no longer points to an installed version", async () => {
    const root = await temporaryDirectory()
    const store = new ContentPackSelectionStore(root)
    await store.write(new Map([["missing-pack", "1.0.0"]]))
    const manager = new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root })

    const catalog = await manager.runtimeCatalog()

    expect(catalog.crews).toHaveLength(originalFleetPack.crews.length)
    await expect(store.read()).resolves.toEqual(new Map())
  })

  it("repairs selected packs that are incompatible after an application downgrade", async () => {
    const root = await temporaryDirectory()
    const current = new ContentPackRuntimeManager({ appVersion: "2.0.0", userDataDirectory: root })
    await current.install(await archive("aurora-pack", "1.0.0", "2.0.0"))
    await current.setSelection({ id: "aurora-pack", selected: true, version: "1.0.0" }, async () => true)

    const downgraded = new ContentPackRuntimeManager({ appVersion: "1.0.0", userDataDirectory: root })
    await expect(downgraded.list()).resolves.toContainEqual(
      expect.objectContaining({ id: "aurora-pack", selected: false }),
    )
    const catalog = await downgraded.runtimeCatalog()
    expect(catalog.sources.crews.has("aurora-pack--watchtide")).toBe(false)
    await expect(new ContentPackSelectionStore(root).read()).resolves.toEqual(new Map())
    await expect(
      downgraded.setSelection({ id: "aurora-pack", selected: true, version: "1.0.0" }, async () => true),
    ).rejects.toThrow(/requires app version 2\.0\.0/i)
  })
})
