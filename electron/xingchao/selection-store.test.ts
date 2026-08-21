import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ContentPackSelectionStore, normalizeContentPackSelections } from "./selection-store.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xingchao-pack-selection-"))
  temporaryDirectories.push(directory)
  return directory
}

describe("content pack selection state", () => {
  it("keeps only safe pack IDs and semantic versions from the current schema", () => {
    expect([
      ...normalizeContentPackSelections({
        selections: {
          "aurora-pack": "2.1.0",
          "bad/id": "1.0.0",
          "harbor-pack": "latest",
        },
        version: 1,
      }),
    ]).toEqual([["aurora-pack", "2.1.0"]])
    expect(normalizeContentPackSelections({ selections: { "aurora-pack": "2.1.0" }, version: 2 })).toEqual(new Map())
  })

  it("round-trips selections atomically without leaving temporary files", async () => {
    const directory = await temporaryDirectory()
    const store = new ContentPackSelectionStore(directory)

    await store.write(new Map([["aurora-pack", "2.1.0"]]))

    await expect(store.read()).resolves.toEqual(new Map([["aurora-pack", "2.1.0"]]))
    await expect(readdir(directory)).resolves.toEqual(["content-pack-selections.json"])
  })

  it("falls back to an empty selection when persisted JSON is corrupt", async () => {
    const directory = await temporaryDirectory()
    await writeFile(path.join(directory, "content-pack-selections.json"), "{broken", "utf8")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    await expect(new ContentPackSelectionStore(directory).read()).resolves.toEqual(new Map())
  })

  it("propagates operational read failures instead of treating unknown state as empty", async () => {
    const directory = await temporaryDirectory()
    const failure = Object.assign(new Error("access denied"), { code: "EACCES" })
    const writeText = vi.fn(async () => undefined)
    const store = new ContentPackSelectionStore(directory, {
      readText: async () => Promise.reject(failure),
      writeText,
    })

    await expect(store.read()).rejects.toBe(failure)
    expect(writeText).not.toHaveBeenCalled()
  })
})
