import type { BuiltinCrewId } from "../domain/xingchao/types.ts"

import { z } from "zod"
import { BUILTIN_CREW_IDS } from "../domain/xingchao/types.ts"

export const FLEET_SKIN_SCHEMA_VERSION = "1.0.0" as const

export const FLEET_SKIN_ASSET_ROLES = [
  "scene.backdrop",
  "scene.foreground",
  "captain.base",
  "captain.uniform",
  "captain.static",
  "crest",
] as const

export type FleetSkinAssetRole = (typeof FLEET_SKIN_ASSET_ROLES)[number]
export type FleetSkinAssetId = `${BuiltinCrewId}.${FleetSkinAssetRole}`

export const FLEET_SKIN_ASSET_IDS = BUILTIN_CREW_IDS.flatMap((crewId) =>
  FLEET_SKIN_ASSET_ROLES.map((role) => `${crewId}.${role}` as FleetSkinAssetId),
)

const fleetSkinAssetIdSet = new Set<string>(FLEET_SKIN_ASSET_IDS)

const assetIdSchema = z.custom<FleetSkinAssetId>(
  (value) => typeof value === "string" && fleetSkinAssetIdSet.has(value),
  "Unknown fleet skin asset ID",
)

export const FLEET_SKIN_FONT_FAMILIES = [
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "ui-sans-serif, system-ui, sans-serif",
  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  "Arial, Helvetica, sans-serif",
] as const

export type FleetSkinFontFamily = (typeof FLEET_SKIN_FONT_FAMILIES)[number]

export const FLEET_SKIN_SURFACE_MATERIALS = [
  "solid",
  "glass",
  "paper",
  "wood",
  "metal",
  "mist",
  "grid",
  "ink",
  "fabric",
  "ceramic",
] as const

export type FleetSkinSurfaceMaterial = (typeof FLEET_SKIN_SURFACE_MATERIALS)[number]

export const FLEET_SKIN_SURFACE_SHADOWS = ["none", "soft", "medium", "strong", "inset"] as const
export type FleetSkinSurfaceShadow = (typeof FLEET_SKIN_SURFACE_SHADOWS)[number]

export interface FleetSkinTokens {
  canvas: string
  panel: string
  elevated: string
  primary: string
  secondary: string
  accent: string
  text: string
  mutedText: string
  success: string
  warning: string
  danger: string
  focus: string
}

export interface SurfaceToken {
  material: FleetSkinSurfaceMaterial
  opacity: number
  border: string
  shadow: FleetSkinSurfaceShadow
  radius: number
}

export interface FontToken {
  family: FleetSkinFontFamily
  weight: number
  tracking: number
}

export type CaptainAlignment = "left" | "center" | "right"
export type SafeCaptionPosition =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "outside"

export interface CaptainComposition {
  stageWidthPercent?: number
  companionWidthPx?: number
  compactSizePx?: number
  focalPosition: string
  alignment: CaptainAlignment
  safeCaptionPosition: SafeCaptionPosition
}

export interface FleetSkinManifest {
  schemaVersion: typeof FLEET_SKIN_SCHEMA_VERSION
  identity: {
    crewId: BuiltinCrewId
    name: string
    version: string
    description: string
    crest: FleetSkinAssetId
  }
  palette: FleetSkinTokens
  surfaces: {
    sidebar: SurfaceToken
    titlebar: SurfaceToken
    content: SurfaceToken
    card: SurfaceToken
    dialog: SurfaceToken
    input: SurfaceToken
    overlay: SurfaceToken
  }
  typography: {
    heading: FontToken
    body: FontToken
    numeric: FontToken
    label: FontToken
  }
  scene: {
    backdrop: FleetSkinAssetId
    foreground: FleetSkinAssetId
    scrim: string
    focalPoint: string
  }
  navigation: {
    selectedShape: "pill" | "ticket" | "frame" | "underline"
    divider: "line" | "notch" | "nodes" | "none"
  }
  captain: {
    layers: FleetSkinAssetId[]
    stage: CaptainComposition
    companion: CaptainComposition
    compact: CaptainComposition
    staticFallback: FleetSkinAssetId
    motionStyle:
      | "command"
      | "editorial"
      | "studio"
      | "engineering"
      | "precision"
      | "operations"
      | "tribunal"
      | "mentor"
      | "media"
      | "lifestyle"
  }
  motion: {
    switchMs: number
    parallaxPx: number
    particleDensity: number
    feedbackMs: number
  }
  audio: {
    cue: "bell" | "paper" | "glass" | "relay" | "scale" | "stamp" | "gavel" | "beacon" | "wave" | "breeze"
    ambient: "none"
  }
  accessibility: {
    highContrast: FleetSkinTokens
    reducedMotion: {
      switchMs: 0
      parallaxPx: 0
      particleDensity: 0
    }
  }
}

const numericPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/

function parseBoundedNumber(token: string, minimum: number, maximum: number, percentAllowed = false): number | null {
  const isPercent = token.endsWith("%")
  if (isPercent && !percentAllowed) return null
  const numericToken = isPercent ? token.slice(0, -1) : token
  if (!numericPattern.test(numericToken)) return null
  const value = Number(numericToken)
  const normalized = isPercent ? value / 100 : value
  return Number.isFinite(normalized) && normalized >= minimum && normalized <= maximum ? normalized : null
}

function isOklchColor(value: string): boolean {
  const match = value.match(/^oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s/]+)(?:\s*\/\s*([^\s]+))?\s*\)$/i)
  if (!match) return false

  const lightness = parseBoundedNumber(match[1], 0, 1, true)
  const chroma = parseBoundedNumber(match[2], 0, 0.5, true)
  const hueToken = match[3].endsWith("deg") ? match[3].slice(0, -3) : match[3]
  const hue = parseBoundedNumber(hueToken, 0, 360)
  const alpha = match[4] === undefined ? 1 : parseBoundedNumber(match[4], 0, 1, true)
  return lightness !== null && chroma !== null && hue !== null && alpha !== null
}

function isColorMixComponent(value: string): boolean {
  const match = value.trim().match(/^(#[0-9a-f]{6}|oklch\(\s*[^)]*\))(?:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+)%))?$/i)
  if (!match) return false
  if (match[1].toLowerCase().startsWith("oklch") && !isOklchColor(match[1])) return false
  if (match[2] !== undefined && parseBoundedNumber(match[2], 0, 1, true) === null) return false
  return true
}

function isColorMix(value: string): boolean {
  const match = value.match(
    /^color-mix\(\s*in\s+(?:srgb|srgb-linear|oklab|oklch|lab|lch|hsl|hwb|xyz|xyz-d50|xyz-d65)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*\)$/i,
  )
  return match !== null && isColorMixComponent(match[1]) && isColorMixComponent(match[2])
}

function isSafeColorToken(value: string): boolean {
  if (value.length === 0 || value.length > 240) return false
  if (/[^\x20-\x7e]/.test(value)) return false
  if (/[;{}]/.test(value) || /(?:url|var)\s*\(/i.test(value)) return false
  if (/^#[0-9a-f]{6}$/i.test(value)) return true
  return isOklchColor(value) || isColorMix(value)
}

const colorTokenSchema = z.string().refine(isSafeColorToken, "Unsafe color token")

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

const safeTextSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => !containsControlCharacters(value), "Text contains control characters")
  .refine((value) => !/[<>]/.test(value), "Text cannot contain markup")
  .refine(
    (value) => !/(?:https?|file|javascript|data):/i.test(value) && !/url\s*\(/i.test(value),
    "Text cannot contain executable or URL content",
  )

const focalPointSchema = z.string().refine((value) => {
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 2) return false
  return parts.every((part) => part.endsWith("%") && parseBoundedNumber(part, 0, 1, true) !== null)
}, "Focal position must contain two bounded percentages")

const tokenSchema = z.strictObject({
  canvas: colorTokenSchema,
  panel: colorTokenSchema,
  elevated: colorTokenSchema,
  primary: colorTokenSchema,
  secondary: colorTokenSchema,
  accent: colorTokenSchema,
  text: colorTokenSchema,
  mutedText: colorTokenSchema,
  success: colorTokenSchema,
  warning: colorTokenSchema,
  danger: colorTokenSchema,
  focus: colorTokenSchema,
})

const surfaceSchema = z.strictObject({
  material: z.enum(FLEET_SKIN_SURFACE_MATERIALS),
  opacity: z.number().finite().min(0).max(1),
  border: colorTokenSchema,
  shadow: z.enum(FLEET_SKIN_SURFACE_SHADOWS),
  radius: z.number().finite().int().min(0).max(48),
})

const fontSchema = z.strictObject({
  family: z.enum(FLEET_SKIN_FONT_FAMILIES),
  weight: z.number().finite().int().min(100).max(900),
  tracking: z.number().finite().min(-4).max(4),
})

const compositionSchema = z
  .strictObject({
    stageWidthPercent: z.number().finite().min(32).max(38).optional(),
    companionWidthPx: z.number().finite().int().min(240).max(300).optional(),
    compactSizePx: z.number().finite().int().min(1).max(72).optional(),
    focalPosition: focalPointSchema,
    alignment: z.enum(["left", "center", "right"]),
    safeCaptionPosition: z.enum([
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "outside",
    ]),
  })
  .superRefine((composition, context) => {
    if (
      composition.stageWidthPercent === undefined &&
      composition.companionWidthPx === undefined &&
      composition.compactSizePx === undefined
    ) {
      context.addIssue({ code: "custom", path: ["stageWidthPercent"], message: "Composition requires a bounded size" })
    }
  })

const manifestSchema = z
  .strictObject({
    schemaVersion: z.literal(FLEET_SKIN_SCHEMA_VERSION),
    identity: z.strictObject({
      crewId: z.enum(BUILTIN_CREW_IDS),
      name: safeTextSchema,
      version: safeTextSchema,
      description: safeTextSchema,
      crest: assetIdSchema,
    }),
    palette: tokenSchema,
    surfaces: z.strictObject({
      sidebar: surfaceSchema,
      titlebar: surfaceSchema,
      content: surfaceSchema,
      card: surfaceSchema,
      dialog: surfaceSchema,
      input: surfaceSchema,
      overlay: surfaceSchema,
    }),
    typography: z.strictObject({
      heading: fontSchema,
      body: fontSchema,
      numeric: fontSchema,
      label: fontSchema,
    }),
    scene: z.strictObject({
      backdrop: assetIdSchema,
      foreground: assetIdSchema,
      scrim: colorTokenSchema,
      focalPoint: focalPointSchema,
    }),
    navigation: z.strictObject({
      selectedShape: z.enum(["pill", "ticket", "frame", "underline"]),
      divider: z.enum(["line", "notch", "nodes", "none"]),
    }),
    captain: z.strictObject({
      layers: z.array(assetIdSchema).max(6),
      stage: compositionSchema,
      companion: compositionSchema,
      compact: compositionSchema,
      staticFallback: assetIdSchema,
      motionStyle: z.enum([
        "command",
        "editorial",
        "studio",
        "engineering",
        "precision",
        "operations",
        "tribunal",
        "mentor",
        "media",
        "lifestyle",
      ]),
    }),
    motion: z.strictObject({
      switchMs: z.number().finite().int().min(250).max(450),
      parallaxPx: z.number().finite().min(0).max(64),
      particleDensity: z.number().finite().min(0).max(100),
      feedbackMs: z.number().finite().int().min(0).max(2_000),
    }),
    audio: z.strictObject({
      cue: z.enum(["bell", "paper", "glass", "relay", "scale", "stamp", "gavel", "beacon", "wave", "breeze"]),
      ambient: z.literal("none"),
    }),
    accessibility: z.strictObject({
      highContrast: tokenSchema,
      reducedMotion: z.strictObject({
        switchMs: z.literal(0),
        parallaxPx: z.literal(0),
        particleDensity: z.literal(0),
      }),
    }),
  })
  .superRefine((manifest, context) => {
    try {
      assertManifestBindings(manifest as unknown as FleetSkinManifest)
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid fleet skin asset binding",
      })
    }
  })

export const fleetSkinManifestSchema = manifestSchema

function assetParts(assetId: FleetSkinAssetId): { crewId: string; role: FleetSkinAssetRole } {
  const separator = assetId.indexOf(".")
  return {
    crewId: assetId.slice(0, separator),
    role: assetId.slice(separator + 1) as FleetSkinAssetRole,
  }
}

function assertAssetBinding(
  field: string,
  assetId: FleetSkinAssetId,
  crewId: BuiltinCrewId,
  expectedRole: FleetSkinAssetRole,
): void {
  const parts = assetParts(assetId)
  if (parts.crewId !== crewId) {
    throw new Error(`${field} asset crewId must match manifest crewId`)
  }
  if (parts.role !== expectedRole) {
    throw new Error(`${field} asset role must be ${expectedRole}`)
  }
}

function assertCompositionField(composition: CaptainComposition, field: keyof CaptainComposition, mode: string): void {
  if (composition[field] === undefined) {
    throw new Error(`${mode} composition requires ${String(field)}`)
  }
}

function assertManifestBindings(manifest: FleetSkinManifest): void {
  const crewId = manifest.identity.crewId
  assertAssetBinding("identity.crest", manifest.identity.crest, crewId, "crest")
  assertAssetBinding("scene.backdrop", manifest.scene.backdrop, crewId, "scene.backdrop")
  assertAssetBinding("scene.foreground", manifest.scene.foreground, crewId, "scene.foreground")
  assertAssetBinding("captain.staticFallback", manifest.captain.staticFallback, crewId, "captain.static")

  const layerRoles = new Set<FleetSkinAssetRole>()
  for (const layer of manifest.captain.layers) {
    const parts = assetParts(layer)
    if (parts.crewId !== crewId) {
      throw new Error("captain layer asset crewId must match manifest crewId")
    }
    if (parts.role !== "captain.base" && parts.role !== "captain.uniform") {
      throw new Error("captain layer asset role must be captain.base or captain.uniform")
    }
    layerRoles.add(parts.role)
  }
  if (!layerRoles.has("captain.base")) throw new Error("captain layers must include captain.base")
  if (!layerRoles.has("captain.uniform")) throw new Error("captain layers must include captain.uniform")

  assertCompositionField(manifest.captain.stage, "stageWidthPercent", "stage")
  assertCompositionField(manifest.captain.companion, "companionWidthPx", "companion")
  assertCompositionField(manifest.captain.compact, "compactSizePx", "compact")
}

export function validateFleetSkinManifest(input: unknown): FleetSkinManifest {
  const result = manifestSchema.safeParse(input)
  if (!result.success) throw result.error
  return result.data as FleetSkinManifest
}

export function requiredAssetIds(manifest: FleetSkinManifest): FleetSkinAssetId[] {
  const required = [
    manifest.scene.backdrop,
    ...manifest.captain.layers,
    manifest.captain.staticFallback,
    manifest.identity.crest,
  ]
  return [...new Set(required)]
}
