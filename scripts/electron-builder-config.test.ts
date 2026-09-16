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
})
