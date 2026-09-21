import type { BuiltinCrewId, CrewId } from "@/domain/xingchao/types.ts"
import type { FleetSkinAssetId, FleetSkinTokens } from "@/skins/fleet-skin-schema.ts"
import type { FleetSkinResourceId } from "@/skins/fleet-skin-switch.ts"
import type { ReadonlyFleetSkinManifest } from "@/skins/fleet-skins.ts"

import * as React from "react"
import { storageKey } from "../../electron/branding.ts"
import { FleetSkinContext } from "./fleet-skin-context.ts"
import { useRuntimeFleet } from "./runtime-fleet-context.ts"
import { fleetSkinAssetUrl } from "@/skins/fleet-skin-assets.ts"
import { beginFleetSkinSwitch, createFleetSkinSwitchState, fleetSkinSwitchReducer } from "@/skins/fleet-skin-switch.ts"
import { isBuiltinFleetSkinId, resolveFleetSkin } from "@/skins/fleet-skins.ts"

/* oxlint-disable react/only-export-components -- Task 6 keeps the authoritative pure CSS mapper beside its sole DOM consumer. */

const activeCrewStorageKey = storageKey("activeCrew")
const ownedVariablePrefixes = ["--fleet-"] as const

export type FleetSkinAssetLoader = (url: string) => Promise<void>

export interface FleetSkinProviderProps {
  children: React.ReactNode
  loadAsset?: FleetSkinAssetLoader
}

interface FleetSkinBootGate {
  crewId: BuiltinCrewId
  generation: number | null
}

function defaultLoadAsset(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("Fleet skin image could not be decoded"))
    image.src = url
  })
}

function cssUrl(url: string): string {
  return `url("${url.replaceAll('"', "%22")}")`
}

function paletteVariables(palette: Readonly<FleetSkinTokens>): Record<string, string> {
  return {
    "--fleet-color-canvas": palette.canvas,
    "--fleet-color-panel": palette.panel,
    "--fleet-color-elevated": palette.elevated,
    "--fleet-color-primary": palette.primary,
    "--fleet-color-secondary": palette.secondary,
    "--fleet-color-accent": palette.accent,
    "--fleet-color-text": palette.text,
    "--fleet-color-muted-text": palette.mutedText,
    "--fleet-color-success": palette.success,
    "--fleet-color-warning": palette.warning,
    "--fleet-color-danger": palette.danger,
    "--fleet-color-focus": palette.focus,
  }
}

function highContrastPaletteVariables(palette: Readonly<FleetSkinTokens>): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const [name, value] of Object.entries(paletteVariables(palette))) {
    variables[name.replace("--fleet-color-", "--fleet-a11y-high-contrast-")] = value
  }
  for (const role of ["primary", "secondary", "accent"] as const) {
    variables[`--fleet-a11y-high-contrast-${role}-foreground`] = accessibleForeground(
      palette[role],
      palette.canvas,
      palette.text,
    )
  }
  return variables
}

const surfaceShadowValues = {
  none: "none",
  soft: "0 12px 32px color-mix(in oklab, var(--foreground) 8%, transparent)",
  medium: "0 18px 46px color-mix(in oklab, var(--foreground) 12%, transparent)",
  strong: "0 24px 64px color-mix(in oklab, var(--foreground) 18%, transparent)",
  inset: "inset 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent)",
} as const

function surfaceColor(color: string, opacity: number): string {
  return opacity === 1 ? color : `color-mix(in oklab, ${color} ${Math.round(opacity * 100)}%, transparent)`
}

function surfaceFill(material: string, color: string, opacity: number): string {
  const base = surfaceColor(color, opacity)
  const motif = {
    solid: "linear-gradient(180deg, transparent, transparent)",
    glass: "linear-gradient(145deg, color-mix(in oklab, white 10%, transparent), transparent 58%)",
    paper:
      "repeating-linear-gradient(0deg, color-mix(in oklab, var(--foreground) 1%, transparent) 0 1px, transparent 1px 8px)",
    wood: "repeating-linear-gradient(98deg, color-mix(in oklab, var(--foreground) 2%, transparent) 0 1px, transparent 1px 20px)",
    metal:
      "linear-gradient(120deg, color-mix(in oklab, white 8%, transparent), transparent 36%, color-mix(in oklab, black 7%, transparent))",
    mist: "radial-gradient(circle at 80% 10%, color-mix(in oklab, white 12%, transparent), transparent 58%)",
    grid: "linear-gradient(color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px)",
    ink: "radial-gradient(ellipse at 12% 0%, color-mix(in oklab, var(--foreground) 9%, transparent), transparent 52%)",
    fabric:
      "repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 1%, transparent) 0 1px, transparent 1px 6px)",
    ceramic: "linear-gradient(160deg, color-mix(in oklab, white 9%, transparent), transparent 42%)",
  }[material]
  return `${motif ?? "linear-gradient(180deg, transparent, transparent)"}, ${base}`
}

function hexRelativeLuminance(color: string): number | null {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null
  const channels = color
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function accessibleForeground(background: string, ...preferred: string[]): string {
  const backgroundLuminance = hexRelativeLuminance(background)
  if (backgroundLuminance === null) return preferred[0]!

  return [...preferred, "#000000", "#FFFFFF"].reduce((best, candidate) => {
    const candidateLuminance = hexRelativeLuminance(candidate)
    const bestLuminance = hexRelativeLuminance(best)
    if (candidateLuminance === null || bestLuminance === null) return best
    const candidateContrast =
      (Math.max(backgroundLuminance, candidateLuminance) + 0.05) /
      (Math.min(backgroundLuminance, candidateLuminance) + 0.05)
    const bestContrast =
      (Math.max(backgroundLuminance, bestLuminance) + 0.05) / (Math.min(backgroundLuminance, bestLuminance) + 0.05)
    return candidateContrast > bestContrast ? candidate : best
  }, preferred[0]!)
}

export function manifestToFleetSkinVariables(
  manifest: ReadonlyFleetSkinManifest,
  degradedOptional: readonly FleetSkinAssetId[],
): Record<string, string> {
  const cardSurface = manifest.surfaces.card
  const dialogSurface = manifest.surfaces.dialog
  const inputSurface = manifest.surfaces.input
  const variables: Record<string, string> = {
    ...paletteVariables(manifest.palette),
    ...highContrastPaletteVariables(manifest.accessibility.highContrast),
    "--background": manifest.palette.canvas,
    "--foreground": manifest.palette.text,
    "--card": surfaceColor(manifest.palette.elevated, cardSurface.opacity),
    "--card-foreground": manifest.palette.text,
    "--popover": surfaceColor(manifest.palette.elevated, dialogSurface.opacity),
    "--popover-foreground": manifest.palette.text,
    "--primary": manifest.palette.primary,
    "--primary-foreground": accessibleForeground(
      manifest.palette.primary,
      manifest.palette.canvas,
      manifest.palette.text,
    ),
    "--secondary": manifest.palette.secondary,
    "--secondary-foreground": accessibleForeground(
      manifest.palette.secondary,
      manifest.palette.canvas,
      manifest.palette.text,
    ),
    "--muted": manifest.palette.panel,
    "--muted-foreground": manifest.palette.mutedText,
    "--accent": manifest.palette.accent,
    "--accent-foreground": accessibleForeground(
      manifest.palette.accent,
      manifest.palette.canvas,
      manifest.palette.text,
    ),
    "--destructive": manifest.palette.danger,
    "--success": manifest.palette.success,
    "--warning": manifest.palette.warning,
    "--info": manifest.palette.accent,
    "--border": cardSurface.border,
    "--input": inputSurface.border,
    "--ring": manifest.palette.focus,
    "--oo-content-surface": surfaceColor(manifest.palette.panel, manifest.surfaces.content.opacity),
    "--oo-sidebar": surfaceColor(manifest.palette.panel, manifest.surfaces.sidebar.opacity),
    "--oo-toolbar": surfaceColor(manifest.palette.panel, manifest.surfaces.titlebar.opacity),
    "--oo-surface": surfaceColor(manifest.palette.elevated, cardSurface.opacity),
    "--oo-overlay-border": manifest.surfaces.overlay.border,
    "--oo-overlay-shadow": surfaceShadowValues[manifest.surfaces.overlay.shadow],
    "--sidebar": surfaceColor(manifest.palette.panel, manifest.surfaces.sidebar.opacity),
    "--sidebar-foreground": manifest.palette.text,
    "--sidebar-muted-foreground": manifest.palette.mutedText,
    "--sidebar-accent": surfaceColor(manifest.palette.accent, 0.18),
    "--sidebar-accent-foreground": manifest.palette.text,
    "--sidebar-border": manifest.surfaces.sidebar.border,
    "--sidebar-ring": manifest.palette.focus,
    "--radius": `${inputSurface.radius}px`,
    "--oo-radius-shell": `${manifest.surfaces.content.radius}px`,
    "--oo-radius-panel": `${cardSurface.radius}px`,
    "--oo-radius-control": `${inputSurface.radius}px`,
    "--fleet-scene-backdrop": cssUrl(fleetSkinAssetUrl(manifest.scene.backdrop)),
    "--fleet-scene-midground": cssUrl(fleetSkinAssetUrl(manifest.scene.midground)),
    "--fleet-scene-scrim": manifest.scene.scrim,
    "--fleet-scene-focal-point": manifest.scene.focalPoint,
    "--fleet-crest": cssUrl(fleetSkinAssetUrl(manifest.identity.crest)),
    "--fleet-captain-base": cssUrl(fleetSkinAssetUrl(manifest.captain.layers[0]!)),
    "--fleet-captain-uniform": cssUrl(fleetSkinAssetUrl(manifest.captain.layers[1]!)),
    "--fleet-captain-static": cssUrl(fleetSkinAssetUrl(manifest.captain.staticFallback)),
    "--fleet-captain-motion-style": manifest.captain.motionStyle,
    "--fleet-navigation-selected-shape": manifest.navigation.selectedShape,
    "--fleet-navigation-divider": manifest.navigation.divider,
    "--fleet-navigation-selected-radius": {
      pill: "999px",
      ticket: "6px 14px 6px 14px",
      frame: "2px",
      underline: "6px 6px 2px 2px",
    }[manifest.navigation.selectedShape],
    "--fleet-motion-switch-ms": `${manifest.motion.switchMs}ms`,
    "--fleet-motion-parallax-px": `${manifest.motion.parallaxPx}px`,
    "--fleet-motion-particle-density": String(manifest.motion.particleDensity),
    "--fleet-motion-feedback-ms": `${manifest.motion.feedbackMs}ms`,
    "--fleet-audio-cue": manifest.audio.cue,
    "--fleet-audio-ambient": manifest.audio.ambient,
    "--fleet-a11y-reduced-switch-ms": `${manifest.accessibility.reducedMotion.switchMs}ms`,
    "--fleet-a11y-reduced-parallax-px": `${manifest.accessibility.reducedMotion.parallaxPx}px`,
    "--fleet-a11y-reduced-particle-density": String(manifest.accessibility.reducedMotion.particleDensity),
  }
  if (!degradedOptional.includes(manifest.scene.light)) {
    variables["--fleet-scene-light"] = cssUrl(fleetSkinAssetUrl(manifest.scene.light))
  }
  if (!degradedOptional.includes(manifest.scene.foreground)) {
    variables["--fleet-scene-foreground"] = cssUrl(fleetSkinAssetUrl(manifest.scene.foreground))
  }

  for (const [surfaceName, surface] of Object.entries(manifest.surfaces)) {
    variables[`--fleet-surface-${surfaceName}-material`] = surface.material
    variables[`--fleet-surface-${surfaceName}-opacity`] = String(surface.opacity)
    variables[`--fleet-surface-${surfaceName}-border`] = surface.border
    variables[`--fleet-surface-${surfaceName}-shadow`] = surface.shadow
    variables[`--fleet-surface-${surfaceName}-radius`] = `${surface.radius}px`
    const color =
      surfaceName === "card" || surfaceName === "dialog" || surfaceName === "overlay"
        ? manifest.palette.elevated
        : manifest.palette.panel
    variables[`--fleet-surface-${surfaceName}-fill`] = surfaceFill(surface.material, color, surface.opacity)
    variables[`--fleet-surface-${surfaceName}-shadow-value`] = surfaceShadowValues[surface.shadow]
  }

  for (const [role, typography] of Object.entries(manifest.typography)) {
    variables[`--fleet-type-${role}-family`] = typography.family
    variables[`--fleet-type-${role}-weight`] = String(typography.weight)
    variables[`--fleet-type-${role}-tracking`] = `${typography.tracking}px`
  }

  for (const [mode, composition] of Object.entries({
    stage: manifest.captain.stage,
    companion: manifest.captain.companion,
    compact: manifest.captain.compact,
  })) {
    variables[`--fleet-captain-${mode}-focal-position`] = composition.focalPosition
    variables[`--fleet-captain-${mode}-alignment`] = composition.alignment
    variables[`--fleet-captain-${mode}-safe-caption-position`] = composition.safeCaptionPosition
  }
  variables["--fleet-captain-stage-width"] = `${manifest.captain.stage.stageWidthPercent}%`
  variables["--fleet-captain-companion-width"] = `${manifest.captain.companion.companionWidthPx}px`
  variables["--fleet-captain-compact-size"] = `${manifest.captain.compact.compactSizePx}px`

  return variables
}

export function safeFleetThemeVariables(theme: {
  primary: string
  secondary: string
  accent: string
  surface: string
  foreground: string
}): Record<string, string> {
  const border = `color-mix(in oklab, ${theme.foreground} 24%, transparent)`
  const panel = `color-mix(in oklab, ${theme.surface} 92%, transparent)`
  const surfaceLuminance = hexRelativeLuminance(theme.surface)
  const highContrastCanvas = surfaceLuminance !== null && surfaceLuminance < 0.5 ? "#000000" : "#FFFFFF"
  const highContrastText = highContrastCanvas === "#000000" ? "#FFFFFF" : "#000000"
  const highContrast: FleetSkinTokens = {
    canvas: highContrastCanvas,
    panel: highContrastCanvas,
    elevated: highContrastCanvas,
    primary: highContrastText,
    secondary: highContrastText,
    accent: highContrastText,
    text: highContrastText,
    mutedText: highContrastText,
    success: highContrastText,
    warning: highContrastText,
    danger: highContrastText,
    focus: highContrastText,
  }
  const variables: Record<string, string> = {
    ...highContrastPaletteVariables(highContrast),
    "--background": theme.surface,
    "--foreground": theme.foreground,
    "--card": panel,
    "--card-foreground": theme.foreground,
    "--popover": theme.surface,
    "--popover-foreground": theme.foreground,
    "--primary": theme.primary,
    "--primary-foreground": accessibleForeground(theme.primary, theme.surface, theme.foreground),
    "--secondary": theme.secondary,
    "--secondary-foreground": accessibleForeground(theme.secondary, theme.surface, theme.foreground),
    "--muted": panel,
    "--muted-foreground": `color-mix(in oklab, ${theme.foreground} 70%, ${theme.surface})`,
    "--accent": theme.accent,
    "--accent-foreground": accessibleForeground(theme.accent, theme.surface, theme.foreground),
    "--destructive": "#B42318",
    "--success": "#16794A",
    "--warning": "#8A5700",
    "--info": theme.accent,
    "--border": border,
    "--input": border,
    "--ring": theme.accent,
    "--oo-content-surface": panel,
    "--oo-sidebar": panel,
    "--oo-toolbar": panel,
    "--oo-surface": panel,
    "--oo-overlay-border": border,
    "--oo-overlay-shadow": `0 18px 46px color-mix(in oklab, ${theme.foreground} 14%, transparent)`,
    "--sidebar": panel,
    "--sidebar-foreground": theme.foreground,
    "--sidebar-muted-foreground": `color-mix(in oklab, ${theme.foreground} 70%, ${theme.surface})`,
    "--sidebar-accent": `color-mix(in oklab, ${theme.accent} 18%, ${theme.surface})`,
    "--sidebar-accent-foreground": theme.foreground,
    "--sidebar-border": border,
    "--sidebar-ring": theme.accent,
    "--radius": "10px",
    "--oo-radius-shell": "16px",
    "--oo-radius-panel": "14px",
    "--oo-radius-control": "10px",
    "--fleet-type-heading-family": 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    "--fleet-type-heading-weight": "650",
    "--fleet-type-heading-tracking": "-0.25px",
    "--fleet-type-body-family": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    "--fleet-type-body-weight": "400",
    "--fleet-type-body-tracking": "0px",
    "--fleet-type-numeric-family":
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    "--fleet-type-numeric-weight": "600",
    "--fleet-type-numeric-tracking": "0px",
    "--fleet-type-label-family": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    "--fleet-type-label-weight": "600",
    "--fleet-type-label-tracking": "0.2px",
    "--fleet-color-primary": theme.primary,
    "--fleet-color-secondary": theme.secondary,
    "--fleet-color-accent": theme.accent,
    "--fleet-color-panel": theme.surface,
    "--fleet-color-text": theme.foreground,
  }

  for (const surface of ["sidebar", "titlebar", "content", "card", "dialog", "input", "overlay"] as const) {
    const elevated = surface === "card" || surface === "dialog" || surface === "overlay"
    const radius = surface === "content" ? "16px" : surface === "input" ? "10px" : "14px"
    variables[`--fleet-surface-${surface}-material`] = "solid"
    variables[`--fleet-surface-${surface}-opacity`] = "1"
    variables[`--fleet-surface-${surface}-fill`] = elevated ? panel : theme.surface
    variables[`--fleet-surface-${surface}-border`] = border
    variables[`--fleet-surface-${surface}-shadow`] = "none"
    variables[`--fleet-surface-${surface}-shadow-value`] = "none"
    variables[`--fleet-surface-${surface}-radius`] = radius
  }
  return variables
}

function commitVariables(root: HTMLElement, crewId: CrewId, skinId: string, variables: Record<string, string>): void {
  const retained: string[] = []
  for (let index = 0; index < root.style.length; index += 1) {
    const name = root.style.item(index)
    if (ownedVariablePrefixes.some((prefix) => name.startsWith(prefix))) continue
    const value = root.style.getPropertyValue(name)
    const priority = root.style.getPropertyPriority(name)
    retained.push(`${name}:${value}${priority ? ` !${priority}` : ""}`)
  }
  const nextStyle = [...retained, ...Object.entries(variables).map(([name, value]) => `${name}:${value}`)].join(";")
  root.style.cssText = nextStyle
  root.dataset.crew = crewId
  root.dataset.fleetSkin = skinId
  const appChrome = root.ownerDocument.querySelector<HTMLElement>(".oo-app-chrome")
  if (appChrome) appChrome.dataset.fleetSkin = skinId
}

function errorMessage(code: "invalid-resource-set" | "required-asset-failed" | "unknown-crew" | null): string | null {
  if (code === "required-asset-failed") return "皮肤资源加载失败，已保留当前舰队。请重试。"
  if (code === "invalid-resource-set") return "皮肤资源清单无效，已保留当前舰队。请重试。"
  if (code === "unknown-crew") return "无法启用未知舰队皮肤，已保留当前舰队。"
  return null
}

export function FleetSkinProvider({ children, loadAsset = defaultLoadAsset }: FleetSkinProviderProps) {
  const runtimeFleet = useRuntimeFleet()
  const initialStoredValueRef = React.useRef<string | null>(
    globalThis.localStorage?.getItem(activeCrewStorageKey) ?? null,
  )
  const initialStoredValue = initialStoredValueRef.current
  const [switchState, dispatch] = React.useReducer(fleetSkinSwitchReducer, undefined, createFleetSkinSwitchState)
  const [bootGate, setBootGate] = React.useState<FleetSkinBootGate | null>(() =>
    initialStoredValue && isBuiltinFleetSkinId(initialStoredValue)
      ? { crewId: initialStoredValue, generation: null }
      : null,
  )
  const [importedCrewId, setImportedCrewId] = React.useState<CrewId | null>(() => {
    if (!initialStoredValue || isBuiltinFleetSkinId(initialStoredValue)) return null
    return runtimeFleet.index.crewById.has(initialStoredValue) ? initialStoredValue : null
  })
  const generationRef = React.useRef(switchState.generation)
  const lastRequestedCrewIdRef = React.useRef<CrewId | null>(null)
  const resourcePromisesRef = React.useRef(new Map<FleetSkinResourceId, Promise<void>>())
  const mountedRef = React.useRef(true)
  const bootGateRef = React.useRef(bootGate)
  bootGateRef.current = bootGate

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadResource = React.useCallback(
    (resourceId: FleetSkinResourceId): Promise<void> => {
      const existing = resourcePromisesRef.current.get(resourceId)
      if (existing) return existing

      let promise: Promise<void>
      if (resourceId.startsWith("font:")) {
        const family = resourceId.slice("font:".length)
        promise = document.fonts?.load ? document.fonts.load(`12px ${family}`).then(() => undefined) : Promise.resolve()
      } else {
        promise = loadAsset(fleetSkinAssetUrl(resourceId as FleetSkinAssetId))
      }
      const cached = promise.catch((cause: unknown) => {
        resourcePromisesRef.current.delete(resourceId)
        throw cause
      })
      resourcePromisesRef.current.set(resourceId, cached)
      return cached
    },
    [loadAsset],
  )

  const requestBuiltInCrew = React.useCallback((crewId: BuiltinCrewId, gated: boolean) => {
    const generation = ++generationRef.current
    lastRequestedCrewIdRef.current = crewId
    if (gated) {
      const nextBootGate = { crewId, generation }
      bootGateRef.current = nextBootGate
      setBootGate(nextBootGate)
    }
    dispatch(beginFleetSkinSwitch(crewId, generation))
  }, [])

  const requestCrew = React.useCallback(
    (crewId: CrewId) => {
      if (!runtimeFleet.index.crewById.has(crewId)) return
      const currentBootGate = bootGateRef.current
      if (isBuiltinFleetSkinId(crewId)) {
        requestBuiltInCrew(crewId, currentBootGate !== null)
      } else {
        generationRef.current += 1
        lastRequestedCrewIdRef.current = crewId
        if (currentBootGate !== null) {
          bootGateRef.current = null
          setBootGate(null)
        }
        setImportedCrewId(crewId)
      }
    },
    [requestBuiltInCrew, runtimeFleet.index],
  )

  const preloadCrew = React.useCallback(
    (crewId: CrewId) => {
      if (!isBuiltinFleetSkinId(crewId) || resolveFleetSkin(crewId) === null) return
      const request = beginFleetSkinSwitch(crewId, generationRef.current + 1)
      for (const resourceId of [...request.required, ...request.optional]) {
        void loadResource(resourceId).catch(() => undefined)
      }
    },
    [loadResource],
  )

  const retry = React.useCallback(() => {
    const crewId = lastRequestedCrewIdRef.current
    if (crewId !== null) requestCrew(crewId)
  }, [requestCrew])

  React.useEffect(() => {
    if (bootGate === null || bootGate.generation !== null) return
    requestCrew(bootGate.crewId)
  }, [bootGate, requestCrew])

  React.useEffect(() => {
    if (runtimeFleet.status === "loading") return
    const storedValue = initialStoredValueRef.current
    if (!storedValue || isBuiltinFleetSkinId(storedValue)) return
    if (runtimeFleet.index.crewById.has(storedValue)) {
      initialStoredValueRef.current = null
      setImportedCrewId(storedValue)
    } else {
      if (importedCrewId === storedValue) return
      if (globalThis.localStorage?.getItem(activeCrewStorageKey) === storedValue) {
        globalThis.localStorage.removeItem(activeCrewStorageKey)
      }
      initialStoredValueRef.current = null
    }
  }, [importedCrewId, runtimeFleet.index, runtimeFleet.status])

  React.useEffect(() => {
    if (
      importedCrewId === null ||
      runtimeFleet.status === "loading" ||
      runtimeFleet.index.crewById.has(importedCrewId)
    ) {
      return
    }
    const fallbackCrewId = switchState.committedCrewId
    setImportedCrewId(null)
    requestBuiltInCrew(fallbackCrewId, true)
  }, [
    importedCrewId,
    requestBuiltInCrew,
    runtimeFleet.index,
    runtimeFleet.snapshot.revision,
    runtimeFleet.status,
    switchState.committedCrewId,
  ])

  React.useEffect(() => {
    const effect = switchState.effect
    if (effect === null) return
    const version = switchState.effectVersion

    if (effect.type === "preload-resources") {
      if (effect.generation !== generationRef.current) {
        dispatch({ type: "effect.consumed", version })
        return
      }
      for (const resourceId of effect.optional) {
        void loadResource(resourceId).then(
          () => {
            if (mountedRef.current && effect.generation === generationRef.current) {
              dispatch({ type: "asset.ready", generation: effect.generation, assetId: resourceId, required: false })
            }
          },
          () => {
            if (mountedRef.current && effect.generation === generationRef.current) {
              dispatch({ type: "asset.failed", generation: effect.generation, assetId: resourceId, required: false })
            }
          },
        )
      }
      for (const resourceId of effect.required) {
        void loadResource(resourceId).then(
          () => {
            if (mountedRef.current && effect.generation === generationRef.current) {
              dispatch({ type: "asset.ready", generation: effect.generation, assetId: resourceId, required: true })
            }
          },
          () => {
            if (mountedRef.current && effect.generation === generationRef.current) {
              dispatch({ type: "asset.failed", generation: effect.generation, assetId: resourceId, required: true })
            }
          },
        )
      }
    } else if (effect.type === "persist-crew" && isBuiltinFleetSkinId(lastRequestedCrewIdRef.current ?? "")) {
      globalThis.localStorage?.setItem(activeCrewStorageKey, effect.crewId)
      setImportedCrewId(null)
      if (bootGate !== null && bootGate.crewId === effect.crewId && bootGate.generation === switchState.generation) {
        bootGateRef.current = null
        setBootGate(null)
      }
    }
    dispatch({ type: "effect.consumed", version })
  }, [bootGate, loadResource, switchState.effect, switchState.effectVersion, switchState.generation])

  const builtInJustCommitted = switchState.phase === "committed" && switchState.effect?.type === "persist-crew"
  const bootJustCommitted =
    bootGate !== null &&
    bootGate.generation !== null &&
    builtInJustCommitted &&
    switchState.generation === bootGate.generation &&
    switchState.committedCrewId === bootGate.crewId &&
    switchState.effect?.type === "persist-crew" &&
    switchState.effect.crewId === bootGate.crewId
  const bootWaiting = bootGate !== null && !bootJustCommitted
  const activeCrewId = bootWaiting
    ? switchState.committedCrewId
    : builtInJustCommitted
      ? switchState.committedCrewId
      : (importedCrewId ?? switchState.committedCrewId)
  const skin = bootWaiting || (importedCrewId !== null && !builtInJustCommitted) ? null : switchState.committedManifest
  const activeImportedCrew =
    skin === null && importedCrewId !== null ? runtimeFleet.index.crewById.get(activeCrewId) : null
  const activeImportedTheme = activeImportedCrew
    ? (runtimeFleet.index.themeById.get(activeImportedCrew.themeId) ?? null)
    : null
  const importedSelectionSettled =
    skin === null &&
    importedCrewId !== null &&
    lastRequestedCrewIdRef.current === importedCrewId &&
    !isBuiltinFleetSkinId(importedCrewId)

  React.useLayoutEffect(() => {
    const root = document.documentElement
    if (skin !== null) {
      commitVariables(
        root,
        activeCrewId,
        skin.identity.crewId,
        manifestToFleetSkinVariables(skin, switchState.degradedOptional),
      )
      return
    }
    if (activeImportedTheme !== null) {
      commitVariables(root, activeCrewId, "legacy-imported", safeFleetThemeVariables(activeImportedTheme))
      globalThis.localStorage?.setItem(activeCrewStorageKey, activeCrewId)
    }
  }, [activeCrewId, activeImportedTheme, skin, switchState.degradedOptional])

  const value = React.useMemo(
    () => ({
      activeCrewId,
      skin,
      requestCrew,
      phase: importedSelectionSettled
        ? ("idle" as const)
        : bootWaiting && switchState.phase === "idle"
          ? ("loading" as const)
          : switchState.phase === "committed" && switchState.effect === null
            ? ("idle" as const)
            : switchState.phase,
      pendingCrewId: importedSelectionSettled
        ? null
        : bootWaiting && switchState.phase === "idle"
          ? bootGate.crewId
          : (switchState.pending?.crewId ?? null),
      error: importedSelectionSettled ? null : errorMessage(switchState.error),
      retry,
      preloadCrew,
    }),
    [
      activeCrewId,
      bootGate,
      bootWaiting,
      importedSelectionSettled,
      preloadCrew,
      requestCrew,
      retry,
      skin,
      switchState.error,
      switchState.effect,
      switchState.pending,
      switchState.phase,
    ],
  )

  return <FleetSkinContext.Provider value={value}>{children}</FleetSkinContext.Provider>
}
