import type { CaptainLayoutDecision } from "@/captain/captain-layout.ts"
import type { CaptainDisplayMode, CaptainRendererEvent } from "@/captain/captain-types.ts"
import type { MessageKey } from "@/i18n"
import type { CSSProperties } from "react"

import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  MousePointerClick,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react"
import * as React from "react"
import { useCaptain } from "./captain-context.ts"
import { CaptainBoundary } from "./CaptainBoundary.tsx"
import { LayeredCaptainRenderer } from "./LayeredCaptainRenderer.tsx"
import { useFleetSkin } from "@/components/fleet-skin-context.ts"
import { useT } from "@/i18n"

/* oxlint-disable react/only-export-components -- Task 10 keeps the tested adaptive layout contracts beside their sole DOM consumer. */

export interface CaptainHostProps {
  readonly decision: CaptainLayoutDecision
}

interface RectEdges {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

const compactLayout = Object.freeze({ displayMode: "compact", minWidth: 0, maxWidth: 72 })
const companionLayout = Object.freeze({ displayMode: "companion", minWidth: 240, maxWidth: 300 })
const safeControlSelector = [
  ".oo-composer",
  ".oo-main-titlebar",
  '[role="dialog"]',
  '[role="alertdialog"]',
  "button",
  "input",
  "select",
  "textarea",
  '[role="button"]',
].join(",")

function horizontalOverlap(left: RectEdges, right: RectEdges): boolean {
  return left.left < right.right && left.right > right.left
}

function verticalOverlap(left: RectEdges, right: RectEdges, gap: number): boolean {
  return left.top < right.bottom + gap && left.bottom > right.top - gap
}

export interface CaptainPlacement {
  readonly possible: boolean
  readonly shift: number
}

/** Deterministic placement from untransformed geometry, clamped inside the viewport. */
export function safeCaptainPlacement(
  host: RectEdges,
  controls: readonly RectEdges[],
  viewportHeight: number,
  gap = 12,
): CaptainPlacement {
  let shift = 0
  const relevant = controls.filter((control) => horizontalOverlap(host, control)).sort((a, b) => b.top - a.top)
  for (const control of relevant) {
    const shifted = { ...host, top: host.top + shift, bottom: host.bottom + shift }
    if (verticalOverlap(shifted, control, gap)) shift += control.top - gap - shifted.bottom
  }
  const minimumShift = Math.min(0, -host.top)
  const viewportShift = Number.isFinite(viewportHeight) ? Math.min(0, viewportHeight - host.bottom) : 0
  const boundedShift = Math.max(minimumShift, Math.min(0, shift + viewportShift))
  const shifted = { ...host, top: host.top + boundedShift, bottom: host.bottom + boundedShift }
  const insideViewport = !Number.isFinite(viewportHeight) || (shifted.top >= 0 && shifted.bottom <= viewportHeight)
  const possible = insideViewport && relevant.every((control) => !verticalOverlap(shifted, control, gap))
  return Object.freeze({ possible, shift: possible ? boundedShift : 0 })
}

function translatedParams(params: Readonly<Record<string, number | boolean>>): Record<string, number> {
  const safe: Record<string, number> = Object.create(null) as Record<string, number>
  for (const [key, value] of Object.entries(params)) safe[key] = typeof value === "boolean" ? Number(value) : value
  return safe
}

function stageSlotStyle(mode: CaptainDisplayMode): CSSProperties | undefined {
  if (mode !== "stage") return undefined
  const slot = document.querySelector<HTMLElement>("[data-captain-host-slot]")
  if (!slot) return undefined
  const rect = slot.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return undefined
  const boundedWidth = Math.min(560, Math.max(360, rect.width))
  return { left: rect.right - boundedWidth, top: rect.top, width: boundedWidth, height: rect.height }
}

function stageContentStyle(mode: CaptainDisplayMode): CSSProperties | undefined {
  if (mode !== "stage") return undefined
  const content = document.querySelector<HTMLElement>("[data-captain-content]")
  if (!content) return undefined
  const rect = content.getBoundingClientRect()
  if (rect.width <= 0) return undefined
  const boundedWidth = Math.min(560, Math.max(360, rect.width * 0.35))
  return { width: boundedWidth }
}

export function CaptainHost({ decision }: CaptainHostProps) {
  const captain = useCaptain()
  const fleetSkin = useFleetSkin()
  const t = useT()
  const [detectedModalOpen, setDetectedModalOpen] = React.useState(false)
  const layout = detectedModalOpen ? compactLayout : decision
  const [expanded, setExpanded] = React.useState(false)
  const [rendererFailed, setRendererFailed] = React.useState(false)
  const [recoveryKey, setRecoveryKey] = React.useState(0)
  const [safeShift, setSafeShift] = React.useState(0)
  const safeShiftRef = React.useRef(0)
  const [collisionCompact, setCollisionCompact] = React.useState(false)
  const collisionCompactRef = React.useRef(false)
  const desiredRectRef = React.useRef<RectEdges | null>(null)
  const [slotStyle, setSlotStyle] = React.useState<CSSProperties | undefined>(() => stageSlotStyle(layout.displayMode))
  const manualSequence = React.useRef(0)
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const desiredLayout = expanded && layout.displayMode === "compact" && !detectedModalOpen ? companionLayout : layout
  const effectiveLayout = collisionCompact && desiredLayout.displayMode !== "compact" ? compactLayout : desiredLayout
  const mode = effectiveLayout.displayMode
  const [controlsOpen, setControlsOpen] = React.useState(false)
  const controlsTrigger = React.useRef<HTMLButtonElement>(null)
  const panelId = React.useId()

  React.useEffect(() => {
    setControlsOpen(false)
  }, [decision.displayMode, mode])

  React.useEffect(() => {
    if (!controlsOpen) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !hostRef.current?.contains(event.target)) setControlsOpen(false)
    }
    document.addEventListener("pointerdown", dismiss)
    return () => document.removeEventListener("pointerdown", dismiss)
  }, [controlsOpen])

  const updatePlacement = React.useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const transformed = host.getBoundingClientRect()
    const measuredRect = {
      top: transformed.top - safeShiftRef.current,
      bottom: transformed.bottom - safeShiftRef.current,
      left: transformed.left,
      right: transformed.right,
    }
    const hostRect = collisionCompactRef.current && desiredRectRef.current ? desiredRectRef.current : measuredRect
    if (!collisionCompactRef.current) desiredRectRef.current = measuredRect
    const controls = [...document.querySelectorAll<HTMLElement>("[data-captain-safe-control]")]
      .filter((control) => !host.contains(control))
      .map((control) => control.getBoundingClientRect())
    const placement = safeCaptainPlacement(hostRect, controls, window.innerHeight)
    const mustCompact = desiredLayout.displayMode !== "compact" && !placement.possible
    collisionCompactRef.current = mustCompact
    setCollisionCompact(mustCompact)
    const nextShift = mustCompact ? 0 : placement.shift
    safeShiftRef.current = nextShift
    setSafeShift(nextShift)
    setSlotStyle(
      mustCompact
        ? undefined
        : (stageSlotStyle(desiredLayout.displayMode) ?? stageContentStyle(desiredLayout.displayMode)),
    )
  }, [desiredLayout.displayMode])

  React.useLayoutEffect(() => {
    collisionCompactRef.current = false
    desiredRectRef.current = null
    safeShiftRef.current = 0
    setCollisionCompact(false)
    setSafeShift(0)
    setSlotStyle(stageSlotStyle(desiredLayout.displayMode) ?? stageContentStyle(desiredLayout.displayMode))
  }, [desiredLayout.displayMode, desiredLayout.maxWidth, desiredLayout.minWidth])

  React.useLayoutEffect(() => {
    const host = hostRef.current
    const ownedMarkers = new Set<HTMLElement>()
    const observed = new Set<Element>()
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(updatePlacement) : null
    const markObserveAndPlace = () => {
      for (const control of document.querySelectorAll<HTMLElement>(safeControlSelector)) {
        if (host?.contains(control)) continue
        if (!control.hasAttribute("data-captain-safe-control")) {
          control.setAttribute("data-captain-safe-control", "")
          ownedMarkers.add(control)
        }
      }
      const nextTargets = new Set<Element>()
      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-captain-safe-control], [data-captain-content], [data-captain-host-slot]",
      )) {
        if (!host?.contains(element)) nextTargets.add(element)
      }
      for (const element of observed) {
        if (nextTargets.has(element)) continue
        resizeObserver?.unobserve(element)
        observed.delete(element)
      }
      for (const element of nextTargets) {
        if (observed.has(element)) continue
        observed.add(element)
        resizeObserver?.observe(element)
      }
      updatePlacement()
    }
    markObserveAndPlace()
    window.addEventListener("resize", updatePlacement)
    window.addEventListener("scroll", updatePlacement, true)
    const observer = typeof MutationObserver === "function" ? new MutationObserver(markObserveAndPlace) : null
    observer?.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer?.disconnect()
      resizeObserver?.disconnect()
      observed.clear()
      window.removeEventListener("resize", updatePlacement)
      window.removeEventListener("scroll", updatePlacement, true)
      for (const control of ownedMarkers) {
        if (control.isConnected) control.removeAttribute("data-captain-safe-control")
      }
    }
  }, [updatePlacement])

  React.useEffect(() => {
    const detect = () => setDetectedModalOpen(document.querySelector('[role="dialog"], [role="alertdialog"]') !== null)
    detect()
    const observer = typeof MutationObserver === "function" ? new MutationObserver(detect) : null
    observer?.observe(document.body, { childList: true, subtree: true })
    return () => observer?.disconnect()
  }, [])

  React.useLayoutEffect(() => {
    const content = document.querySelector<HTMLElement>("[data-captain-content]")
    if (!content) return
    if (mode === "companion") {
      content.setAttribute("data-captain-reserved", "true")
      content.style.setProperty("--captain-reserved-width", "clamp(240px, 19vw, 300px)")
    } else {
      content.setAttribute("data-captain-reserved", "false")
      content.style.removeProperty("--captain-reserved-width")
    }
    return () => {
      content.setAttribute("data-captain-reserved", "false")
      content.style.removeProperty("--captain-reserved-width")
    }
  }, [mode])

  const onRendererEvent = React.useCallback((event: CaptainRendererEvent) => {
    if (event.type === "renderer.error") setRendererFailed(true)
  }, [])

  const requestManualRead = React.useCallback(() => {
    if (manualSequence.current >= Number.MAX_SAFE_INTEGER) return
    manualSequence.current += 1
    captain.speech.request({
      id: `captain-manual-${manualSequence.current}`,
      category: "manual",
      messageKey: "captain.voice.manual",
      params: {},
    })
  }, [captain.speech])

  const recoverRenderer = React.useCallback(() => {
    setRecoveryKey((key) => (key >= Number.MAX_SAFE_INTEGER ? key : key + 1))
    setRendererFailed(false)
  }, [])

  const style = {
    ...slotStyle,
    "--captain-safe-shift-y": `${safeShift}px`,
    "--captain-host-text": "var(--foreground)",
    "--captain-host-surface": "var(--card)",
    "--captain-host-focus": "var(--ring)",
  } as CSSProperties
  const skin = fleetSkin.skin

  return (
    <aside
      ref={hostRef}
      className={`captain-host captain-host--${mode} pointer-events-none`}
      data-captain-host
      data-captain-mode={mode}
      data-captain-min-width={effectiveLayout.minWidth}
      data-captain-max-width={effectiveLayout.maxWidth}
      data-captain-avoids-safe-controls="true"
      style={style}
      aria-label={t("captain.host.label")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && mode === "compact" && controlsOpen) {
          event.stopPropagation()
          setControlsOpen(false)
          controlsTrigger.current?.focus()
        }
      }}
    >
      <div className="captain-host__decorative pointer-events-none" data-captain-decorative aria-hidden="true">
        {skin ? (
          <CaptainBoundary
            snapshot={captain.snapshot}
            skin={skin}
            mode={mode}
            reducedMotion={false}
            recoveryKey={recoveryKey}
            onRendererEvent={onRendererEvent}
          >
            <LayeredCaptainRenderer
              snapshot={captain.snapshot}
              skin={skin}
              mode={mode}
              reducedMotion={false}
              onRendererEvent={onRendererEvent}
            />
          </CaptainBoundary>
        ) : null}
      </div>

      {mode === "compact" ? (
        <div className="captain-host__controls pointer-events-auto">
          <button
            ref={controlsTrigger}
            type="button"
            aria-label={t("captain.host.controls")}
            title={t("captain.host.controls")}
            aria-expanded={controlsOpen}
            aria-controls={panelId}
            onClick={() => setControlsOpen((value) => !value)}
          >
            <SlidersHorizontal aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div id={panelId} data-captain-panel className="captain-host__panel" hidden={mode === "compact" && !controlsOpen}>
        <div className="captain-host__caption pointer-events-none" aria-live="polite" aria-atomic="true">
          {t(captain.snapshot.captionKey as MessageKey, translatedParams(captain.snapshot.captionParams))}
        </div>

        <div className="captain-host__controls pointer-events-auto" data-captain-controls>
          <button
            type="button"
            data-captain-safe-control
            aria-pressed={captain.speech.settings.enabled}
            aria-label={t(captain.speech.settings.enabled ? "captain.voice.disable" : "captain.voice.enable")}
            onClick={() => captain.speech.setEnabled(!captain.speech.settings.enabled)}
          >
            {captain.speech.settings.enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>
          <button
            type="button"
            data-captain-safe-control
            aria-label={t("captain.voice.mute")}
            onClick={captain.speech.mute}
          >
            <VolumeX aria-hidden="true" />
          </button>
          <button
            type="button"
            data-captain-safe-control
            aria-pressed={captain.speech.settings.clickOnly}
            aria-label={t("captain.voice.clickOnly")}
            onClick={() => captain.speech.setClickOnly(!captain.speech.settings.clickOnly)}
          >
            <MousePointerClick aria-hidden="true" />
          </button>
          <label className="captain-host__voice-slider">
            <span>{t("captain.voice.volume")}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={captain.speech.settings.volume}
              aria-label={t("captain.voice.volume")}
              data-captain-safe-control
              onChange={(event) => captain.speech.setVolume(event.currentTarget.valueAsNumber)}
            />
          </label>
          <label className="captain-host__voice-slider">
            <span>{t("captain.voice.rate")}</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={captain.speech.settings.rate}
              aria-label={t("captain.voice.rate")}
              data-captain-safe-control
              onChange={(event) => captain.speech.setRate(event.currentTarget.valueAsNumber)}
            />
          </label>
          <button
            type="button"
            data-captain-safe-control
            aria-label={t("captain.voice.manualRead")}
            onClick={requestManualRead}
          >
            <BookOpen aria-hidden="true" />
          </button>
          <button
            type="button"
            data-captain-safe-control
            aria-expanded={expanded}
            aria-label={t(expanded ? "captain.host.collapse" : "captain.host.expand")}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </button>
          {rendererFailed ? (
            <button
              type="button"
              data-captain-safe-control
              aria-label={t("captain.host.retryRenderer")}
              onClick={recoverRenderer}
            >
              <RotateCcw aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
