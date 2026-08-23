import type { BuiltinCrewId } from "../domain/xingchao/types.ts"
import type { FleetSkinManifest, FleetSkinSurfaceMaterial } from "./fleet-skin-schema.ts"
import type { DeepReadonly } from "./fleet-skins.ts"

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

function visualStructureParts(skin: DeepReadonly<FleetSkinManifest>) {
  const surfaces = Object.fromEntries(
    Object.entries(skin.surfaces).map(([role, surface]) => [
      role,
      {
        material: surface.material,
        opacity: surface.opacity,
        border: surface.border,
        shadow: surface.shadow,
        radius: surface.radius,
      },
    ]),
  )
  const captainCompositions = {
    stage: skin.captain.stage,
    companion: skin.captain.companion,
    compact: skin.captain.compact,
  }

  return {
    surfaces: JSON.stringify(surfaces),
    typography: JSON.stringify(skin.typography),
    navigation: JSON.stringify(skin.navigation),
    captainCompositions: JSON.stringify(captainCompositions),
    motion: JSON.stringify(skin.motion),
  }
}

function visualStructureSignature(skin: DeepReadonly<FleetSkinManifest>): string {
  return JSON.stringify(visualStructureParts(skin))
}

function expectDeepFrozen(value: unknown, path = "registry"): void {
  if (value === null || typeof value !== "object") return
  expect(Object.isFrozen(value), path).toBe(true)
  for (const [key, nestedValue] of Object.entries(value)) expectDeepFrozen(nestedValue, `${path}.${key}`)
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

    const parts = manifests.map(visualStructureParts)
    expect(new Set(parts.map((part) => part.surfaces)).size).toBe(10)
    expect(new Set(parts.map((part) => part.typography)).size).toBe(10)
    expect(new Set(parts.map((part) => part.navigation)).size).toBeGreaterThanOrEqual(7)
    expect(new Set(parts.map((part) => part.captainCompositions)).size).toBe(10)
    expect(new Set(parts.map((part) => part.motion)).size).toBe(10)

    const structuralSignatures = manifests.map(visualStructureSignature)
    expect(new Set(structuralSignatures).size).toBe(10)
  })

  it("does not let asset IDs, motion labels, or audio cues disguise a structural alias", () => {
    const original = structuredClone(builtinFleetSkins.watchtide) as FleetSkinManifest
    const alias = structuredClone(original)
    alias.identity.crewId = "ink-sail"
    alias.identity.crest = "ink-sail.crest"
    alias.scene.backdrop = "ink-sail.scene.backdrop"
    alias.scene.foreground = "ink-sail.scene.foreground"
    alias.captain.layers = ["ink-sail.captain.base", "ink-sail.captain.uniform"]
    alias.captain.staticFallback = "ink-sail.captain.static"
    alias.captain.motionStyle = "editorial"
    alias.audio.cue = "paper"

    expect(visualStructureSignature(alias)).toBe(visualStructureSignature(original))
  })

  it("deep-freezes the canonical registry and every resolved nested value", () => {
    const skin = resolveFleetSkin("watchtide")
    expect(skin).not.toBeNull()
    expectDeepFrozen(builtinFleetSkins)

    const mutableView = skin as unknown as FleetSkinManifest
    expect(() => {
      mutableView.scene.backdrop = "ink-sail.scene.backdrop"
    }).toThrow(TypeError)
    expect(() => {
      mutableView.surfaces.card.opacity = 0
    }).toThrow(TypeError)
    expect(() => {
      mutableView.captain.layers.push("ink-sail.captain.base")
    }).toThrow(TypeError)
    expect(() => {
      mutableView.identity.name = "polluted"
    }).toThrow(TypeError)

    const resolvedAgain = resolveFleetSkin("watchtide")
    expect(resolvedAgain).toBe(skin)
    expect(() => validateFleetSkinManifest(resolvedAgain)).not.toThrow()
    expect(resolvedAgain?.scene.backdrop).toBe("watchtide.scene.backdrop")

    const typed: DeepReadonly<FleetSkinManifest> | null = resolveFleetSkin("watchtide")
    expect(typed).toBe(skin)
  })

  it("meets high-contrast text and non-text ratios using literal token values", () => {
    for (const crewId of BUILTIN_CREW_IDS) {
      const tokens = builtinFleetSkins[crewId].accessibility.highContrast
      for (const background of [tokens.canvas, tokens.panel, tokens.elevated]) {
        expect(contrastRatio(tokens.text, background), `${crewId} text on ${background}`).toBeGreaterThanOrEqual(4.5)
        expect(
          contrastRatio(tokens.mutedText, background),
          `${crewId} muted text on ${background}`,
        ).toBeGreaterThanOrEqual(4.5)
        for (const tokenName of ["primary", "secondary", "accent", "success", "warning", "danger", "focus"] as const) {
          expect(
            contrastRatio(tokens[tokenName], background),
            `${crewId} ${tokenName} on ${background}`,
          ).toBeGreaterThanOrEqual(3)
        }
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
