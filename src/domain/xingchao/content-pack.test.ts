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

  it("rejects a crew roster with fewer than six members", () => {
    const pack = packFixture()
    pack.crews[0]!.memberIds.pop()

    expect(() => validateContentPack(pack)).toThrow(/6|six|六/i)
  })

  it("rejects six roster entries that do not identify six different agents", () => {
    const pack = packFixture()
    pack.crews[0]!.memberIds[1] = pack.crews[0]!.memberIds[0]!

    expect(() => validateContentPack(pack)).toThrow(/member.*different|member.*unique|duplicate|成员.*不同|重复/i)
  })

  it("rejects a same-crew captain who is absent from the authoritative roster", () => {
    const pack = packFixture()
    const crew = pack.crews[0]!
    const replacement = structuredClone(pack.agents.find((agent) => agent.crewId === crew.id && agent.role === "crew")!)
    replacement.id = "extra-roster-member"
    pack.agents.push(replacement)
    crew.memberIds = crew.memberIds.map((memberId) => (memberId === crew.captainId ? replacement.id : memberId))

    expect(() => validateContentPack(pack)).toThrow(/captain.*roster|captain.*member|船长.*成员/i)
  })

  it("rejects a captain assigned to another crew", () => {
    const pack = packFixture()
    const crew = pack.crews[0]!
    const foreignCaptain = pack.agents.find((agent) => agent.crewId !== crew.id && agent.role === "captain")!
    crew.memberIds = crew.memberIds.map((memberId) => (memberId === crew.captainId ? foreignCaptain.id : memberId))
    crew.captainId = foreignCaptain.id

    expect(() => validateContentPack(pack)).toThrow(/captain.*belong|captain.*crew|船长.*航海团/i)
  })

  it("rejects a roster captain whose Agent role is not captain", () => {
    const pack = packFixture()
    const crew = pack.crews[0]!
    pack.agents.find((agent) => agent.id === crew.captainId)!.role = "crew"

    expect(() => validateContentPack(pack)).toThrow(/captain.*role|船长.*角色/i)
  })

  it("rejects a roster member assigned to another crew", () => {
    const pack = packFixture()
    const crew = pack.crews[0]!
    const memberIndex = crew.memberIds.findIndex((memberId) => memberId !== crew.captainId)
    const foreignMember = pack.agents.find((agent) => agent.crewId !== crew.id && agent.role === "crew")!
    crew.memberIds[memberIndex] = foreignMember.id

    expect(() => validateContentPack(pack)).toThrow(/member.*belong|member.*crew|成员.*航海团/i)
  })

  it("rejects prompt-bound crew text beyond the published maximum", () => {
    const pack = structuredClone(originalFleetPack)
    pack.crews[0]!.description = "x".repeat(1_001)

    expect(() => validateContentPack(pack)).toThrow(/too big|maximum|1000/i)
  })

  it("rejects control characters in runtime display text", () => {
    const pack = structuredClone(originalFleetPack)
    pack.agents[0]!.title = "trusted\u0000override"

    expect(() => validateContentPack(pack)).toThrow(/control/i)
  })

  it("rejects a pack inventory beyond its crew maximum", () => {
    const pack = structuredClone(originalFleetPack)
    pack.crews.push(
      ...Array.from({ length: 16 }, (_, index) => ({
        ...structuredClone(originalFleetPack.crews[0]!),
        id: `crew-${index}` as (typeof pack.crews)[number]["id"],
      })),
    )

    expect(() => validateContentPack(pack)).toThrow(/25|too big|maximum/i)
  })
})
