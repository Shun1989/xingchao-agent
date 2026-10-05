import JSZip from "jszip"
import { readFile } from "node:fs/promises"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { installContentPackArchive, listInstalledContentPacks } from "../electron/xingchao/content-pack-installer.ts"
import { ContentPackRuntimeManager } from "../electron/xingchao/runtime-manager.ts"

async function builder() {
  const module = await import("./build-actuator-legion-pack.ts").catch(() => null)
  expect(module, "The reproducible content-pack builder must exist").not.toBeNull()
  return module!
}

describe("Actuator Design Legion release packaging", () => {
  it("creates a deterministic manifest-only archive that the real installer can reopen", async () => {
    const { buildActuatorLegionArchive } = await builder()
    const input: unknown = JSON.parse(
      await readFile(new URL("../content-packs/actuator-design-legion/manifest.json", import.meta.url), "utf8"),
    )
    const archive = await buildActuatorLegionArchive(input)
    expect(archive.equals(await buildActuatorLegionArchive(input))).toBe(true)
    const zip = await JSZip.loadAsync(archive)
    expect(Object.keys(zip.files)).toEqual(["manifest.json"])
    const directory = await mkdtemp(path.join(tmpdir(), "xingchao-legion-pack-"))
    try {
      const appVersion = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version
      const installed = await installContentPackArchive(archive, directory, { currentAppVersion: appVersion })
      expect(installed.id).toBe("actuator-design-legion")
      expect(installed.manifest.crews).toHaveLength(1)
      expect(installed.manifest.agents).toHaveLength(6)
      expect((await listInstalledContentPacks(directory)).map(({ id, version }) => ({ id, version }))).toEqual([
        { id: "actuator-design-legion", version: "1.0.1" },
      ])
      const manager = new ContentPackRuntimeManager({ appVersion, userDataDirectory: directory })
      expect((await manager.runtimeCatalog()).crews).toHaveLength(10)
      let confirmed = false
      await expect(
        manager.setSelection(
          { id: installed.id, version: installed.version, selected: true },
          async (pack, selected) => {
            expect(pack.id).toBe("actuator-design-legion")
            expect(pack.selected).toBe(false)
            expect(selected).toBe(true)
            confirmed = true
            return true
          },
        ),
      ).resolves.toBe(true)
      expect(confirmed).toBe(true)
      const reopened = new ContentPackRuntimeManager({ appVersion, userDataDirectory: directory })
      expect((await reopened.list()).find((pack) => pack.id === installed.id)?.selected).toBe(true)
      const catalog = await reopened.runtimeCatalog()
      expect(catalog.crews).toHaveLength(11)
      expect(catalog.agents).toHaveLength(66)
      expect(catalog.crews.some((crew) => crew.id === "actuator-design-legion--actuator-legion")).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("rejects executable or invalid manifests before creating release bytes", async () => {
    const { buildActuatorLegionArchive } = await builder()
    const input = JSON.parse(
      await readFile(new URL("../content-packs/actuator-design-legion/manifest.json", import.meta.url), "utf8"),
    )
    await expect(buildActuatorLegionArchive({ ...input, executableCode: true })).rejects.toThrow()
    await expect(
      buildActuatorLegionArchive({ ...input, checksums: { "private.pdf": "a".repeat(64) } }),
    ).rejects.toThrow(/manifest-only/i)
  })
})
