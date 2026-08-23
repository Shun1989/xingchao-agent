import type { BuiltinCrewId } from "../domain/xingchao/types.ts"
import type { FleetSkinManifest, FleetSkinSurfaceMaterial } from "./fleet-skin-schema.ts"

import { describe, expect, it } from "vitest"
import { BUILTIN_CREW_IDS } from "../domain/xingchao/types.ts"
import { validateFleetSkinManifest } from "./fleet-skin-schema.ts"
import { builtinFleetSkins, isBuiltinFleetSkinId, resolveFleetSkin } from "./fleet-skins.ts"

const systemSans = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const uiSans = "ui-sans-serif, system-ui, sans-serif"
const uiSerif = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
const uiMono = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
const arialSans = "Arial, Helvetica, sans-serif"

const expectedDirections = {
  watchtide: { materials: ["glass", "glass"], heading: uiSerif, shape: "frame", motion: "command", cue: "bell" },
  "ink-sail": {
    materials: ["paper", "paper"],
    heading: uiSerif,
    shape: "ticket",
    motion: "editorial",
    cue: "paper",
  },
  "brocade-harbor": {
    materials: ["glass", "glass"],
    heading: uiSans,
    shape: "pill",
    motion: "studio",
    cue: "glass",
  },
  "forge-vessel": {
    materials: ["metal", "grid"],
    heading: uiMono,
    shape: "frame",
    motion: "engineering",
    cue: "relay",
  },
  "golden-scale": {
    materials: ["metal", "solid"],
    heading: uiSerif,
    shape: "underline",
    motion: "precision",
    cue: "scale",
  },
  "helm-order": {
    materials: ["paper", "paper"],
    heading: systemSans,
    shape: "ticket",
    motion: "operations",
    cue: "stamp",
  },
  "iron-code": {
    materials: ["paper", "solid"],
    heading: uiSerif,
    shape: "frame",
    motion: "tribunal",
    cue: "gavel",
  },
  lighthouse: {
    materials: ["fabric", "paper"],
    heading: uiSerif,
    shape: "underline",
    motion: "mentor",
    cue: "beacon",
  },
  "phantom-wave": {
    materials: ["glass", "glass"],
    heading: arialSans,
    shape: "pill",
    motion: "media",
    cue: "wave",
  },
  "rest-harbor": {
    materials: ["fabric", "paper"],
    heading: uiSerif,
    shape: "pill",
    motion: "lifestyle",
    cue: "breeze",
  },
} as const satisfies Record<
  BuiltinCrewId,
  {
    materials: readonly [FleetSkinSurfaceMaterial, FleetSkinSurfaceMaterial]
    heading: FleetSkinManifest["typography"]["heading"]["family"]
    shape: FleetSkinManifest["navigation"]["selectedShape"]
    motion: FleetSkinManifest["captain"]["motionStyle"]
    cue: FleetSkinManifest["audio"]["cue"]
  }
>

function channelToLinear(channel: number): number {
  const srgb = channel / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex)
  if (!match) throw new Error(`contrast test requires a six-digit hex color, received ${hex}`)
  const [red, green, blue] = match.slice(1).map((value) => channelToLinear(Number.parseInt(value!, 16)))
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

function contrastRatio(first: string, second: string): number {
  const brighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (brighter + 0.05) / (darker + 0.05)
}

describe("built-in fleet skin manifests", () => {
  it("has one complete and valid manifest for every built-in crew", () => {
    expect(Object.keys(builtinFleetSkins).sort()).toEqual([...BUILTIN_CREW_IDS].sort())

    for (const crewId of BUILTIN_CREW_IDS) {
      const skin = validateFleetSkinManifest(builtinFleetSkins[crewId])
      expect(skin.identity.crewId).toBe(crewId)
      expect(skin.identity.crest).toBe(`${crewId}.crest`)
      expect(skin.scene.backdrop).toBe(`${crewId}.scene.backdrop`)
      expect(skin.scene.foreground).toBe(`${crewId}.scene.foreground`)
      expect(skin.captain.layers).toEqual([`${crewId}.captain.base`, `${crewId}.captain.uniform`])
      expect(skin.captain.staticFallback).toBe(`${crewId}.captain.static`)
    }
  })

  it("declares the approved structural direction for every crew", () => {
    for (const crewId of BUILTIN_CREW_IDS) {
      const skin = builtinFleetSkins[crewId]
      const expected = expectedDirections[crewId]
      expect([skin.surfaces.sidebar.material, skin.surfaces.content.material], crewId).toEqual(expected.materials)
      expect(skin.typography.heading.family, crewId).toBe(expected.heading)
      expect(skin.navigation.selectedShape, crewId).toBe(expected.shape)
      expect(skin.captain.motionStyle, crewId).toBe(expected.motion)
      expect(skin.audio.cue, crewId).toBe(expected.cue)
    }

    expect(builtinFleetSkins["rest-harbor"].navigation.divider).toBe("nodes")
  })

  it("is visually distinct beyond palette changes", () => {
    const manifests = BUILTIN_CREW_IDS.map((crewId) => builtinFleetSkins[crewId])
    expect(new Set(manifests.map((skin) => skin.scene.backdrop)).size).toBe(10)
    expect(new Set(manifests.map((skin) => skin.captain.layers.join("|"))).size).toBe(10)
    expect(new Set(manifests.map((skin) => skin.typography.heading.family)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(manifests.map((skin) => skin.navigation.selectedShape)).size).toBeGreaterThanOrEqual(4)

    const structuralSignatures = manifests.map((skin) =>
      JSON.stringify({
        surfaces: skin.surfaces,
        typography: skin.typography,
        navigation: skin.navigation,
        stage: skin.captain.stage,
        motionStyle: skin.captain.motionStyle,
        motion: skin.motion,
        cue: skin.audio.cue,
      }),
    )
    expect(new Set(structuralSignatures).size).toBe(10)
  })

  it("meets high-contrast text and focus ratios using literal token values", () => {
    for (const crewId of BUILTIN_CREW_IDS) {
      const tokens = builtinFleetSkins[crewId].accessibility.highContrast
      for (const background of [tokens.canvas, tokens.panel, tokens.elevated]) {
        expect(contrastRatio(tokens.text, background), `${crewId} text on ${background}`).toBeGreaterThanOrEqual(4.5)
        expect(
          contrastRatio(tokens.mutedText, background),
          `${crewId} muted text on ${background}`,
        ).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(tokens.focus, background), `${crewId} focus on ${background}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it("resolves only exact built-in IDs and refuses imported content", () => {
    for (const crewId of BUILTIN_CREW_IDS) {
      expect(isBuiltinFleetSkinId(crewId)).toBe(true)
      expect(resolveFleetSkin(crewId)).toBe(builtinFleetSkins[crewId])
    }

    expect(isBuiltinFleetSkinId("aurora-pack--watchtide")).toBe(false)
    expect(resolveFleetSkin("aurora-pack--watchtide")).toBeNull()
    expect(resolveFleetSkin("watchtide-copy")).toBeNull()
    expect(resolveFleetSkin("")).toBeNull()
  })
})
