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

const activeCrewStorageKey = storageKey("activeCrew")
const ownedVariablePrefixes = ["--fleet-", "--xingchao-"] as const

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

function manifestVariables(
  manifest: ReadonlyFleetSkinManifest,
  degradedOptional: readonly FleetSkinAssetId[],
): Record<string, string> {
  const variables: Record<string, string> = {
    ...paletteVariables(manifest.palette),
    "--xingchao-primary": manifest.palette.primary,
    "--xingchao-secondary": manifest.palette.secondary,
    "--xingchao-accent": manifest.palette.accent,
    "--xingchao-surface": manifest.palette.panel,
    "--xingchao-foreground": manifest.palette.text,
    "--fleet-scene-backdrop": cssUrl(fleetSkinAssetUrl(manifest.scene.backdrop)),
    "--fleet-scene-scrim": manifest.scene.scrim,
    "--fleet-scene-focal-point": manifest.scene.focalPoint,
    "--fleet-crest": cssUrl(fleetSkinAssetUrl(manifest.identity.crest)),
    "--fleet-captain-base": cssUrl(fleetSkinAssetUrl(manifest.captain.layers[0]!)),
    "--fleet-captain-uniform": cssUrl(fleetSkinAssetUrl(manifest.captain.layers[1]!)),
    "--fleet-captain-static": cssUrl(fleetSkinAssetUrl(manifest.captain.staticFallback)),
    "--fleet-captain-motion-style": manifest.captain.motionStyle,
    "--fleet-navigation-selected-shape": manifest.navigation.selectedShape,
    "--fleet-navigation-divider": manifest.navigation.divider,
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
  if (!degradedOptional.includes(manifest.scene.foreground)) {
    variables["--fleet-scene-foreground"] = cssUrl(fleetSkinAssetUrl(manifest.scene.foreground))
  }

  for (const [surfaceName, surface] of Object.entries(manifest.surfaces)) {
    variables[`--fleet-surface-${surfaceName}-material`] = surface.material
    variables[`--fleet-surface-${surfaceName}-opacity`] = String(surface.opacity)
    variables[`--fleet-surface-${surfaceName}-border`] = surface.border
    variables[`--fleet-surface-${surfaceName}-shadow`] = surface.shadow
    variables[`--fleet-surface-${surfaceName}-radius`] = `${surface.radius}px`
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

  for (const [name, value] of Object.entries(paletteVariables(manifest.accessibility.highContrast))) {
    variables[name.replace("--fleet-color-", "--fleet-a11y-high-contrast-")] = value
  }
  return variables
}

function legacyThemeVariables(theme: {
  primary: string
  secondary: string
  accent: string
  surface: string
  foreground: string
}): Record<string, string> {
  return {
    "--xingchao-primary": theme.primary,
    "--xingchao-secondary": theme.secondary,
    "--xingchao-accent": theme.accent,
    "--xingchao-surface": theme.surface,
    "--xingchao-foreground": theme.foreground,
    "--fleet-color-primary": theme.primary,
    "--fleet-color-secondary": theme.secondary,
    "--fleet-color-accent": theme.accent,
    "--fleet-color-panel": theme.surface,
    "--fleet-color-text": theme.foreground,
  }
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

  const requestCrew = React.useCallback(
    (crewId: CrewId) => {
      if (!runtimeFleet.index.crewById.has(crewId)) return
      const generation = ++generationRef.current
      lastRequestedCrewIdRef.current = crewId
      const currentBootGate = bootGateRef.current
      if (isBuiltinFleetSkinId(crewId)) {
        if (currentBootGate !== null) {
          const nextBootGate = { crewId, generation }
          bootGateRef.current = nextBootGate
          setBootGate(nextBootGate)
        }
        dispatch(beginFleetSkinSwitch(crewId, generation))
      } else {
        if (currentBootGate !== null) {
          bootGateRef.current = null
          setBootGate(null)
        }
        setImportedCrewId(crewId)
      }
    },
    [runtimeFleet.index],
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
      setImportedCrewId(storedValue)
    } else {
      if (globalThis.localStorage?.getItem(activeCrewStorageKey) === storedValue) {
        globalThis.localStorage.removeItem(activeCrewStorageKey)
      }
      initialStoredValueRef.current = null
    }
  }, [runtimeFleet.index, runtimeFleet.status])

  React.useEffect(() => {
    if (importedCrewId === null || runtimeFleet.index.crewById.has(importedCrewId)) return
    setImportedCrewId(null)
    if (globalThis.localStorage?.getItem(activeCrewStorageKey) === importedCrewId) {
      globalThis.localStorage.removeItem(activeCrewStorageKey)
    }
  }, [importedCrewId, runtimeFleet.index, runtimeFleet.snapshot.revision])

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
      commitVariables(root, activeCrewId, skin.identity.crewId, manifestVariables(skin, switchState.degradedOptional))
      return
    }
    if (activeImportedTheme !== null) {
      commitVariables(root, activeCrewId, "legacy-imported", legacyThemeVariables(activeImportedTheme))
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
      switchState.pending,
      switchState.phase,
    ],
  )

  return <FleetSkinContext.Provider value={value}>{children}</FleetSkinContext.Provider>
}
