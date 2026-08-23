import type { FleetSkinManifest } from "./fleet-skin-schema.ts"

import { describe, expect, it } from "vitest"
import {
  FLEET_SKIN_ASSET_IDS,
  fleetSkinManifestSchema,
  requiredAssetIds,
  validateFleetSkinManifest,
} from "./fleet-skin-schema.ts"

const systemFont = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const palette = {
  canvas: "#0B1220",
  panel: "#121E33",
  elevated: "#1A2B46",
  primary: "#1F6FEB",
  secondary: "#4F8CC9",
  accent: "#F2B84B",
  text: "#F7FAFC",
  mutedText: "#B9C6D8",
  success: "#3FB950",
  warning: "#D29922",
  danger: "#F85149",
  focus: "#79C0FF",
}

const surface = {
  material: "solid",
  opacity: 1,
  border: "#4F8CC9",
  shadow: "none",
  radius: 8,
} as const

const highContrast = {
  canvas: "#000000",
  panel: "#111111",
  elevated: "#222222",
  primary: "#FFFFFF",
  secondary: "#EEEEEE",
  accent: "#FFFF00",
  text: "#FFFFFF",
  mutedText: "#EEEEEE",
  success: "#00FF00",
  warning: "#FFFF00",
  danger: "#FF6666",
  focus: "#00FFFF",
}

const validManifest = {
  schemaVersion: "1.0.0",
  identity: {
    crewId: "watchtide",
    name: "Watchtide",
    version: "1.0.0",
    description: "A deep-water command skin for the built-in watchtide crew.",
    crest: "watchtide.crest",
  },
  palette,
  surfaces: {
    sidebar: surface,
    titlebar: surface,
    content: surface,
    card: surface,
    dialog: surface,
    input: surface,
    overlay: surface,
  },
  typography: {
    heading: { family: systemFont, weight: 700, tracking: 0 },
    body: { family: systemFont, weight: 400, tracking: 0 },
    numeric: { family: systemFont, weight: 600, tracking: 0 },
    label: { family: systemFont, weight: 500, tracking: 0.02 },
  },
  scene: {
    backdrop: "watchtide.scene.backdrop",
    foreground: "watchtide.scene.foreground",
    scrim: "color-mix(in oklab, #000000 40%, #FFFFFF 60%)",
    focalPoint: "50% 50%",
  },
  navigation: {
    selectedShape: "pill",
    divider: "line",
  },
  captain: {
    layers: ["watchtide.captain.base", "watchtide.captain.uniform"],
    stage: {
      stageWidthPercent: 36,
      focalPosition: "50% 52%",
      alignment: "center",
      safeCaptionPosition: "bottom",
    },
    companion: {
      companionWidthPx: 270,
      focalPosition: "56% 50%",
      alignment: "right",
      safeCaptionPosition: "bottom",
    },
    compact: {
      compactSizePx: 48,
      focalPosition: "50% 50%",
      alignment: "center",
      safeCaptionPosition: "bottom",
    },
    staticFallback: "watchtide.captain.static",
    motionStyle: "command",
  },
  motion: {
    switchMs: 320,
    parallaxPx: 12,
    particleDensity: 35,
    feedbackMs: 160,
  },
  audio: {
    cue: "bell",
    ambient: "none",
  },
  accessibility: {
    highContrast,
    reducedMotion: {
      switchMs: 0,
      parallaxPx: 0,
      particleDensity: 0,
    },
  },
} satisfies FleetSkinManifest

const cloneManifest = (): FleetSkinManifest => structuredClone(validManifest)

describe("fleet skin closed contract", () => {
  it("accepts a complete built-in manifest", () => {
    expect(validateFleetSkinManifest(validManifest)).toEqual(validManifest)
  })

  it.each(["https://example.com/a.png", "../secrets.png", "C:\\secret.png", "data:text/html,x"])(
    "rejects an arbitrary asset reference: %s",
    (asset) => {
      const input = cloneManifest()
      input.scene.backdrop = asset as FleetSkinManifest["scene"]["backdrop"]
      expect(() => validateFleetSkinManifest(input)).toThrow(/asset/i)
    },
  )

  it("requires all three captain compositions and accessibility overrides", () => {
    const input = cloneManifest() as unknown as Record<string, unknown>
    delete (input.captain as Record<string, unknown>).compact
    expect(() => validateFleetSkinManifest(input)).toThrow(/compact/i)

    const withoutAccessibility = cloneManifest() as unknown as Record<string, unknown>
    delete withoutAccessibility.accessibility
    expect(() => validateFleetSkinManifest(withoutAccessibility)).toThrow(/accessibility/i)
  })

  it("does not permit an imported crew ID", () => {
    const input = cloneManifest()
    input.identity.crewId = "pack--crew" as FleetSkinManifest["identity"]["crewId"]
    expect(() => validateFleetSkinManifest(input)).toThrow(/crewId/i)
  })

  it.each(["url(#secret)", "var(--secret)", "#112233; color: red", "#112233}", "\u0000#112233", "x".repeat(241)])(
    "rejects unsafe color token %s",
    (color) => {
      const input = cloneManifest()
      input.palette.canvas = color
      expect(() => validateFleetSkinManifest(input)).toThrow(/color/i)
    },
  )

  it("rejects URL and arbitrary font-family values", () => {
    const input = cloneManifest()
    input.typography.heading.family =
      "url(https://example.com/font.woff2)" as FleetSkinManifest["typography"]["heading"]["family"]
    expect(() => validateFleetSkinManifest(input)).toThrow(/font|family/i)
  })

  it.each([
    ["palette", (input: Record<string, unknown>) => delete input.palette],
    ["surfaces", (input: Record<string, unknown>) => delete input.surfaces],
    ["typography", (input: Record<string, unknown>) => delete input.typography],
  ])("requires the %s token section", (_section, remove) => {
    const input = cloneManifest() as unknown as Record<string, unknown>
    remove(input)
    expect(() => validateFleetSkinManifest(input)).toThrow(/palette|surface|typography/i)
  })

  it("enforces bounded motion and composition values", () => {
    const tooFast = cloneManifest()
    tooFast.motion.switchMs = 249
    expect(() => validateFleetSkinManifest(tooFast)).toThrow(/switchMs/i)

    const tooWideStage = cloneManifest()
    tooWideStage.captain.stage.stageWidthPercent = 39
    expect(() => validateFleetSkinManifest(tooWideStage)).toThrow(/stageWidthPercent/i)

    const tooWideCompanion = cloneManifest()
    tooWideCompanion.captain.companion.companionWidthPx = 301
    expect(() => validateFleetSkinManifest(tooWideCompanion)).toThrow(/companionWidthPx/i)

    const tooLargeCompact = cloneManifest()
    tooLargeCompact.captain.compact.compactSizePx = 73
    expect(() => validateFleetSkinManifest(tooLargeCompact)).toThrow(/compactSizePx/i)
  })

  it("requires exact reduced-motion zero values", () => {
    const input = cloneManifest()
    ;(input.accessibility.reducedMotion as unknown as Record<string, unknown>).parallaxPx = 1
    expect(() => validateFleetSkinManifest(input)).toThrow(/reducedMotion|parallaxPx/i)
  })

  it.each([
    [
      "scene backdrop",
      (input: FleetSkinManifest) =>
        (input.scene.backdrop = "watchtide.scene.foreground" as FleetSkinManifest["scene"]["backdrop"]),
    ],
    [
      "scene foreground",
      (input: FleetSkinManifest) =>
        (input.scene.foreground = "watchtide.crest" as FleetSkinManifest["scene"]["foreground"]),
    ],
    [
      "crest",
      (input: FleetSkinManifest) =>
        (input.identity.crest = "watchtide.captain.static" as FleetSkinManifest["identity"]["crest"]),
    ],
    [
      "static fallback",
      (input: FleetSkinManifest) =>
        (input.captain.staticFallback = "watchtide.scene.backdrop" as FleetSkinManifest["captain"]["staticFallback"]),
    ],
  ])("rejects a wrong asset role for %s", (_label, mutate) => {
    const input = cloneManifest()
    mutate(input)
    expect(() => validateFleetSkinManifest(input)).toThrow(/role|asset/i)
  })

  it("rejects cross-crew asset references", () => {
    const input = cloneManifest()
    input.scene.backdrop = "ink-sail.scene.backdrop" as FleetSkinManifest["scene"]["backdrop"]
    expect(() => validateFleetSkinManifest(input)).toThrow(/crew|asset/i)
  })

  it.each([
    ["cross-crew", "ink-sail.scene.backdrop"],
    ["wrong-role", "watchtide.scene.foreground"],
  ])("keeps the public schema closed for %s asset bindings", (_label, backdrop) => {
    const input = cloneManifest()
    input.scene.backdrop = backdrop as FleetSkinManifest["scene"]["backdrop"]
    expect(fleetSkinManifestSchema.safeParse(input).success).toBe(false)
  })

  it("requires both same-crew captain base and uniform layers", () => {
    const missingUniform = cloneManifest()
    missingUniform.captain.layers = ["watchtide.captain.base"]
    expect(() => validateFleetSkinManifest(missingUniform)).toThrow(/uniform/i)

    const wrongRole = cloneManifest()
    wrongRole.captain.layers = [
      "watchtide.captain.base",
      "watchtide.scene.foreground",
    ] as FleetSkinManifest["captain"]["layers"]
    expect(() => validateFleetSkinManifest(wrongRole)).toThrow(/role|layer|uniform/i)
  })

  it("builds exactly the closed ten-crew by six-role asset set", () => {
    expect(FLEET_SKIN_ASSET_IDS).toHaveLength(60)
    expect(new Set(FLEET_SKIN_ASSET_IDS).size).toBe(60)
    expect(FLEET_SKIN_ASSET_IDS).toContain("watchtide.scene.backdrop")
    expect(FLEET_SKIN_ASSET_IDS).toContain("rest-harbor.crest")
    expect(FLEET_SKIN_ASSET_IDS).not.toContain("pack--crew.scene.backdrop")
  })

  it("returns unique required assets and excludes the optional foreground", () => {
    const manifest = cloneManifest()
    manifest.captain.layers = ["watchtide.captain.base", "watchtide.captain.uniform", "watchtide.captain.base"]
    const required = requiredAssetIds(manifest)
    expect(new Set(required).size).toBe(required.length)
    expect(required).toContain("watchtide.scene.backdrop")
    expect(required).toContain("watchtide.captain.base")
    expect(required).toContain("watchtide.captain.uniform")
    expect(required).toContain("watchtide.captain.static")
    expect(required).toContain("watchtide.crest")
    expect(required).not.toContain("watchtide.scene.foreground")
  })
})
