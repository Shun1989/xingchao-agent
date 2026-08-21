import type { ContentPackManifest } from "./types.ts"

import { describe, expect, it } from "vitest"
import { originalFleetPack, validateContentPack } from "./content-pack.ts"

function packFixture(): ContentPackManifest {
  return structuredClone({
    ...originalFleetPack,
    id: "validation-test-pack",
    name: "Validation test pack",
    visibility: "private-local" as const,
  })
}

describe("content pack runtime contract", () => {
  it.each([
    ["crew", (pack: ContentPackManifest) => pack.crews.push(structuredClone(pack.crews[0]!))],
    ["agent", (pack: ContentPackManifest) => pack.agents.push(structuredClone(pack.agents[0]!))],
    ["theme", (pack: ContentPackManifest) => pack.themes.push(structuredClone(pack.themes[0]!))],
  ])("rejects duplicate %s IDs before runtime activation", (_kind, duplicate) => {
    const pack = packFixture()
    duplicate(pack)

    expect(() => validateContentPack(pack)).toThrow()
  })

  it("rejects agents assigned to an unknown crew", () => {
    const pack = packFixture()
    pack.agents[0]!.crewId = "missing-crew" as ContentPackManifest["agents"][number]["crewId"]

    expect(() => validateContentPack(pack)).toThrow()
  })

  it("rejects crews whose runtime theme is absent from the theme inventory", () => {
    const pack = packFixture()
    pack.themes = pack.themes.filter((theme) => theme.id !== pack.crews[0]!.theme.id)

    expect(() => validateContentPack(pack)).toThrow()
  })

  it("rejects partial agent profiles that cannot execute at runtime", () => {
    const pack = packFixture()
    pack.agents[0] = {
      id: pack.agents[0]!.id,
      crewId: pack.agents[0]!.crewId,
      name: pack.agents[0]!.name,
      title: pack.agents[0]!.title,
    } as ContentPackManifest["agents"][number]

    expect(() => validateContentPack(pack)).toThrow()
  })
})
