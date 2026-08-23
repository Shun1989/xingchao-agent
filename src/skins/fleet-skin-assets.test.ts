import type { FleetSkinAssetId, FleetSkinAssetRole } from "./fleet-skin-schema.ts"

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { BUILTIN_CREW_IDS } from "../domain/xingchao/types.ts"
import { fleetSkinAssetRegistry, fleetSkinAssetUrl } from "./fleet-skin-assets.ts"
import { FLEET_SKIN_ASSET_IDS, FLEET_SKIN_ASSET_ROLES } from "./fleet-skin-schema.ts"

const roleFiles = {
  "scene.backdrop": "scene-backdrop.webp",
  "scene.foreground": "scene-foreground.webp",
  "captain.base": "captain-base.webp",
  "captain.uniform": "captain-uniform.webp",
  "captain.static": "captain-static.webp",
  crest: "crest.svg",
} as const satisfies Record<FleetSkinAssetRole, string>

const expectedRasterDimensions = {
  "scene.backdrop": { width: 1920, height: 1080, alpha: false },
  "scene.foreground": { width: 1920, height: 1080, alpha: true },
  "captain.base": { width: 1600, height: 2200, alpha: true },
  "captain.uniform": { width: 1600, height: 2200, alpha: true },
  "captain.static": { width: 1200, height: 1600, alpha: false },
} as const

function sourceFile(crewId: string, role: FleetSkinAssetRole): URL {
  return new URL(`../../resources/xingchao/skins/${crewId}/${roleFiles[role]}`, import.meta.url)
}

function readUint24LE(bytes: Buffer, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

function inspectWebP(bytes: Buffer): { width: number; height: number; alpha: boolean } {
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF")
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP")

  let offset = 12
  let alphaChunk = false
  let result: { width: number; height: number; alpha: boolean } | undefined

  while (offset + 8 <= bytes.length) {
    const fourCC = bytes.subarray(offset, offset + 4).toString("ascii")
    const chunkSize = bytes.readUInt32LE(offset + 4)
    const dataOffset = offset + 8

    if (fourCC === "ALPH") alphaChunk = true
    if (fourCC === "VP8X" && chunkSize >= 10) {
      result = {
        width: readUint24LE(bytes, dataOffset + 4) + 1,
        height: readUint24LE(bytes, dataOffset + 7) + 1,
        alpha: (bytes[dataOffset]! & 0x10) !== 0,
      }
    }
    if (fourCC === "VP8L" && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
      const bits = bytes.readUInt32LE(dataOffset + 1)
      result = {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
        alpha: ((bits >>> 28) & 1) === 1,
      }
    }
    if (fourCC === "VP8 " && chunkSize >= 10) {
      result ??= {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
        alpha: alphaChunk,
      }
    }

    offset = dataOffset + chunkSize + (chunkSize % 2)
  }

  expect(result, "WebP must contain a supported VP8 chunk").toBeDefined()
  return { ...result!, alpha: result!.alpha || alphaChunk }
}

describe("fleet skin asset registry", () => {
  it("is total, static, and contains only safe local URLs", () => {
    expect(Object.keys(fleetSkinAssetRegistry).sort()).toEqual([...FLEET_SKIN_ASSET_IDS].sort())

    for (const assetId of FLEET_SKIN_ASSET_IDS) {
      const url = fleetSkinAssetUrl(assetId)
      expect(url).toBe(fleetSkinAssetRegistry[assetId])
      expect(url).not.toMatch(/(?:https?:|data:|\.\.)/i)
      expect(url.length).toBeGreaterThan(0)
    }
  })

  it("contains the exact 60-file source inventory with valid binaries", async () => {
    const inventory: string[] = []
    const uniqueBackdrops = new Set<string>()
    const uniqueCaptainBases = new Set<string>()

    for (const crewId of BUILTIN_CREW_IDS) {
      for (const role of FLEET_SKIN_ASSET_ROLES) {
        const assetId = `${crewId}.${role}` as FleetSkinAssetId
        const file = sourceFile(crewId, role)
        const bytes = await readFile(file)
        inventory.push(fileURLToPath(file))
        expect(bytes.byteLength, assetId).toBeGreaterThan(0)

        if (role === "crest") {
          const svg = bytes.toString("utf8")
          expect(svg).toMatch(/^<svg\b/)
          expect(svg).toMatch(/viewBox=["']0 0 128 128["']/)
          expect(svg).not.toMatch(/<(?:script|image|text|metadata|foreignObject)\b/i)
          expect(svg).not.toMatch(/(?:href|src)\s*=|url\s*\(/i)
        } else {
          const inspection = inspectWebP(bytes)
          const expected = expectedRasterDimensions[role]
          expect(inspection.width, assetId).toBe(expected.width)
          expect(inspection.height, assetId).toBe(expected.height)
          expect(Math.max(inspection.width, inspection.height), assetId).toBeLessThanOrEqual(4096)
          if (expected.alpha) expect(inspection.alpha, assetId).toBe(true)
        }

        const digest = createHash("sha256").update(bytes).digest("hex")
        if (role === "scene.backdrop") uniqueBackdrops.add(digest)
        if (role === "captain.base") uniqueCaptainBases.add(digest)
      }
    }

    expect(inventory).toHaveLength(60)
    expect(new Set(inventory).size).toBe(60)
    expect(uniqueBackdrops.size).toBe(10)
    expect(uniqueCaptainBases.size).toBe(10)
  })
})
