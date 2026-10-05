import { cp, mkdtemp, mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("electron-builder release configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("generates GitHub update metadata for the Xingchao repository", async () => {
    const { default: config } = await import("../electron-builder.ts")

    expect(config.publish).toEqual({
      provider: "github",
      owner: "Shun1989",
      repo: "xingchao-agent",
      releaseType: "release",
    })
  })

  it("forces code signing when the signed candidate pipeline requests it", async () => {
    vi.stubEnv("XINGCHAO_REQUIRE_CODE_SIGNING", "true")

    const { default: config } = await import("../electron-builder.ts")

    expect(config.forceCodeSigning).toBe(true)
  })

  it("maps the complete public knowledge bundle to the production reader without private or executable assets", async () => {
    const { default: config } = await import("../electron-builder.ts")
    const mapping = config.extraResources.find((resource) => resource.to === "knowledge/actuator-design-legion/1.0.0")
    expect(mapping, "The packaged application must include the fixed knowledge bundle").toBeDefined()
    const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-knowledge-package-"))
    try {
      const target = path.join(root, mapping!.to)
      await mkdir(target, { recursive: true })
      for (const filename of (mapping as { filter: string[] }).filter) {
        await cp(path.join(mapping!.from, filename), path.join(target, filename))
      }
      const { loadActuatorLegionKnowledge } = await import("../electron/xingchao/actuator-knowledge.ts")
      const bundle = await loadActuatorLegionKnowledge(target)
      expect(bundle.sourceIds).toHaveLength(14)
      expect(bundle.documents.map((document) => document.name)).toEqual([
        "knowledge.md",
        "cases.json",
        "acceptance.md",
        "sources.json",
        "design-input.json",
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
