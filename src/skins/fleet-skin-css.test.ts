import type { ReadonlyFleetSkinManifest } from "./fleet-skins.ts"

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { builtinFleetSkins } from "./fleet-skins.ts"
import * as fleetSkinProvider from "@/components/FleetSkinProvider.tsx"

type ManifestVariableMapper = (
  manifest: ReadonlyFleetSkinManifest,
  degradedOptional: readonly string[],
) => Record<string, string>

type SafeThemeVariableMapper = (theme: {
  primary: string
  secondary: string
  accent: string
  surface: string
  foreground: string
}) => Record<string, string>

const requiredSemanticVariables = [
  "--background",
  "--foreground",
  "--card",
  "--popover",
  "--border",
  "--input",
  "--ring",
  "--oo-content-surface",
  "--oo-sidebar",
  "--oo-toolbar",
  "--oo-surface",
  "--oo-overlay-shadow",
  "--fleet-scene-backdrop",
  "--fleet-scene-scrim",
  "--fleet-scene-foreground",
  "--fleet-type-heading-family",
  "--fleet-type-heading-weight",
  "--fleet-type-heading-tracking",
  "--fleet-type-body-family",
  "--fleet-type-body-weight",
  "--fleet-type-body-tracking",
  "--fleet-type-numeric-family",
  "--fleet-type-numeric-weight",
  "--fleet-type-numeric-tracking",
  "--fleet-type-label-family",
  "--fleet-type-label-weight",
  "--fleet-type-label-tracking",
  "--radius",
  "--oo-radius-shell",
  "--oo-radius-panel",
  "--oo-radius-control",
] as const

const highContrastVariables = [
  "canvas",
  "panel",
  "elevated",
  "primary",
  "secondary",
  "accent",
  "text",
  "muted-text",
  "success",
  "warning",
  "danger",
  "focus",
].map((name) => `--fleet-a11y-high-contrast-${name}`)

function manifestMapper(): ManifestVariableMapper {
  const mapper = (fleetSkinProvider as unknown as Record<string, unknown>).manifestToFleetSkinVariables
  expect(typeof mapper).toBe("function")
  return mapper as ManifestVariableMapper
}

function safeThemeMapper(): SafeThemeVariableMapper {
  const mapper = (fleetSkinProvider as unknown as Record<string, unknown>).safeFleetThemeVariables
  expect(typeof mapper).toBe("function")
  return mapper as SafeThemeVariableMapper
}

function productionSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return productionSourceFiles(path)
    if (!/\.(?:css|ts|tsx)$/.test(entry.name) || /\.test\.[^.]+$/.test(entry.name)) return []
    return [path]
  })
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05)
}

describe("fleet skin semantic CSS contract", () => {
  it.each(Object.values(builtinFleetSkins))(
    "maps $identity.crewId to the complete desktop semantic contract",
    (manifest) => {
      const variables = manifestMapper()(manifest, [])

      for (const name of [...requiredSemanticVariables, ...highContrastVariables]) {
        expect(variables[name], `${manifest.identity.crewId} is missing ${name}`).toBeTruthy()
      }
      expect(variables["--background"]).toBe(manifest.palette.canvas)
      expect(variables["--foreground"]).toBe(manifest.palette.text)
      expect(variables["--ring"]).toBe(manifest.palette.focus)
      expect(contrastRatio(variables["--primary"], variables["--primary-foreground"])).toBeGreaterThanOrEqual(4.5)
      expect(variables["--fleet-a11y-high-contrast-canvas"]).toBe(manifest.accessibility.highContrast.canvas)
      expect(variables["--fleet-a11y-high-contrast-focus"]).toBe(manifest.accessibility.highContrast.focus)
    },
  )

  it("omits only a degraded optional scene foreground", () => {
    const manifest = builtinFleetSkins.watchtide
    const variables = manifestMapper()(manifest, [manifest.scene.foreground])

    expect(variables["--fleet-scene-backdrop"]).toContain("scene-backdrop.webp")
    expect(variables["--fleet-scene-foreground"]).toBeUndefined()
  })

  it("maps imported themes to a complete asset-free semantic fallback", () => {
    const variables = safeThemeMapper()({
      primary: "#123456",
      secondary: "#654321",
      accent: "#247C8C",
      surface: "#F2EBDD",
      foreground: "#18242C",
    })

    for (const name of requiredSemanticVariables.filter((name) => !name.startsWith("--fleet-scene-"))) {
      expect(variables[name], `safe fallback is missing ${name}`).toBeTruthy()
    }
    expect(Object.keys(variables).some((name) => name.startsWith("--fleet-scene-"))).toBe(false)
  })

  it("ships the shared scene, contrast, and reduced-motion stylesheet", () => {
    const stylesheetPath = join(process.cwd(), "src", "styles", "fleet-skins.css")
    expect(existsSync(stylesheetPath)).toBe(true)
    const css = readFileSync(stylesheetPath, "utf8")

    expect(css).toContain(".oo-fleet-scene")
    expect(css).toContain('[data-fleet-contrast="high"]')
    expect(css).toContain("prefers-reduced-motion: reduce")
    expect(css).toContain("pointer-events: none")
  })

  it("removes the legacy palette API from production sources", () => {
    const sourceRoot = join(process.cwd(), "src")
    const offenders = productionSourceFiles(sourceRoot)
      .filter((path) => readFileSync(path, "utf8").includes("--xingchao-"))
      .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"))

    expect(offenders).toEqual([])
  })
})
