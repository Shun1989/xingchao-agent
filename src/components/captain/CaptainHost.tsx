import type { CaptainDisplayMode, CaptainRendererEvent } from "@/captain/captain-types.ts"
import type { AppShellRoute } from "@/components/app-shell/app-shell-types.ts"
import type { MessageKey } from "@/i18n"
import type { CSSProperties } from "react"

import { BookOpen, ChevronDown, ChevronUp, MousePointerClick, RotateCcw, Volume2, VolumeX } from "lucide-react"
import * as React from "react"
import { useCaptain } from "./captain-context.ts"
import { CaptainBoundary } from "./CaptainBoundary.tsx"
import { LayeredCaptainRenderer } from "./LayeredCaptainRenderer.tsx"
import { useFleetSkin } from "@/components/fleet-skin-context.ts"
import { useT } from "@/i18n"

/* oxlint-disable react/only-export-components -- Task 10 keeps the tested adaptive layout contracts beside their sole DOM consumer. */

export interface CaptainHostProps {
  readonly route: AppShellRoute
  readonly activeSessionId: string | null
  readonly chatIsEmpty?: boolean
  readonly activeProject?: boolean
  readonly activeTask?: boolean
  readonly modalOpen?: boolean
  /** Deterministic integration-test override; production follows window.innerWidth. */
  readonly viewportWidth?: number
}

export interface CaptainLayout {
  readonly mode: CaptainDisplayMode
  readonly minWidth: number
  readonly maxWidth: number
}

interface CaptainLayoutInput extends CaptainHostProps {
  readonly viewportWidth: number
}

interface RectEdges {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

const stageRoutes = new Set<AppShellRoute>(["fleet", "voyage"])
const companionRoutes = new Set<AppShellRoute>(["connections", "skills"])
const compactLayout = Object.freeze({ mode: "compact", minWidth: 0, maxWidth: 72 } satisfies CaptainLayout)
const companionLayout = Object.freeze({ mode: "companion", minWidth: 240, maxWidth: 300 } satisfies CaptainLayout)
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

export function resolveCaptainLayout({
  activeProject = false,
  activeSessionId,
  activeTask = false,
  chatIsEmpty = activeSessionId === null,
  modalOpen = false,
  route,
  viewportWidth,
}: CaptainLayoutInput): CaptainLayout {
  if (modalOpen || route === "settings") return Object.freeze({ mode: "compact", minWidth: 0, maxWidth: 72 })
  const activeChatContext = route === "chat" && (activeProject || activeTask || !chatIsEmpty)
  const stage = stageRoutes.has(route) || (route === "chat" && chatIsEmpty && !activeProject && !activeTask)
  if (stage && viewportWidth >= 1280) return Object.freeze({ mode: "stage", minWidth: 360, maxWidth: 520 })
  const companion = companionRoutes.has(route) || activeChatContext
  if (companion && viewportWidth >= 1180) {
    return Object.freeze({ mode: "companion", minWidth: 240, maxWidth: 300 })
  }
  return Object.freeze({ mode: "compact", minWidth: 0, maxWidth: 72 })
}

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

function useViewportWidth(override: number | undefined): number {
  const [width, setWidth] = React.useState(() => override ?? globalThis.window?.innerWidth ?? 1024)
  React.useEffect(() => {
    if (override !== undefined) {
      setWidth(override)
      return
    }
    const update = () => setWidth(window.innerWidth)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [override])
  return width
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
  const boundedWidth = Math.min(520, Math.max(360, rect.width))
  return { left: rect.right - boundedWidth, top: rect.top, width: boundedWidth, height: rect.height }
}

function stageContentStyle(mode: CaptainDisplayMode): CSSProperties | undefined {
  if (mode !== "stage") return undefined
  const content = document.querySelector<HTMLElement>("[data-captain-content]")
  if (!content) return undefined
  const rect = content.getBoundingClientRect()
  if (rect.width <= 0) return undefined
  const boundedWidth = Math.min(520, Math.max(360, rect.width * 0.35))
  return { width: boundedWidth }
}

export function CaptainHost({
  activeProject = false,
  activeSessionId,
  activeTask = false,
  chatIsEmpty = activeSessionId === null,
  modalOpen = false,
  route,
  viewportWidth,
}: CaptainHostProps) {
  const captain = useCaptain()
  const fleetSkin = useFleetSkin()
  const t = useT()
  const width = useViewportWidth(viewportWidth)
  const [detectedModalOpen, setDetectedModalOpen] = React.useState(false)
  const effectiveModalOpen = modalOpen || detectedModalOpen
  const layout = resolveCaptainLayout({
    activeProject,
    activeSessionId,
    activeTask,
    chatIsEmpty,
    modalOpen: effectiveModalOpen,
    route,
    viewportWidth: width,
  })
  const [expanded, setExpanded] = React.useState(false)
  const [rendererFailed, setRendererFailed] = React.useState(false)
  const [recoveryKey, setRecoveryKey] = React.useState(0)
  const [safeShift, setSafeShift] = React.useState(0)
  const safeShiftRef = React.useRef(0)
  const [collisionCompact, setCollisionCompact] = React.useState(false)
  const collisionCompactRef = React.useRef(false)
  const desiredRectRef = React.useRef<RectEdges | null>(null)
  const [slotStyle, setSlotStyle] = React.useState<CSSProperties | undefined>(() => stageSlotStyle(layout.mode))
  const manualSequence = React.useRef(0)
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const desiredLayout =
    expanded && layout.mode === "compact" && !effectiveModalOpen && width >= 1180 ? companionLayout : layout
  const effectiveLayout = collisionCompact && desiredLayout.mode !== "compact" ? compactLayout : desiredLayout
  const mode = effectiveLayout.mode

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
    const mustCompact = desiredLayout.mode !== "compact" && !placement.possible
    collisionCompactRef.current = mustCompact
    setCollisionCompact(mustCompact)
    const nextShift = mustCompact ? 0 : placement.shift
    safeShiftRef.current = nextShift
    setSafeShift(nextShift)
    setSlotStyle(
      mustCompact ? undefined : (stageSlotStyle(desiredLayout.mode) ?? stageContentStyle(desiredLayout.mode)),
    )
  }, [desiredLayout.mode])

  React.useLayoutEffect(() => {
    collisionCompactRef.current = false
    desiredRectRef.current = null
    safeShiftRef.current = 0
    setCollisionCompact(false)
    setSafeShift(0)
    setSlotStyle(stageSlotStyle(desiredLayout.mode) ?? stageContentStyle(desiredLayout.mode))
  }, [desiredLayout.maxWidth, desiredLayout.minWidth, desiredLayout.mode, effectiveModalOpen, route, width])

  React.useLayoutEffect(() => {
    const host = hostRef.current
    const ownedMarkers = new Set<HTMLElement>()
    const observed = new WeakSet<Element>()
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(updatePlacement) : null
    const observeExternal = (element: HTMLElement) => {
      if (host?.contains(element) || observed.has(element)) return
      observed.add(element)
      resizeObserver?.observe(element)
    }
    const markObserveAndPlace = () => {
      for (const control of document.querySelectorAll<HTMLElement>(safeControlSelector)) {
        if (host?.contains(control)) continue
        if (!control.hasAttribute("data-captain-safe-control")) {
          control.setAttribute("data-captain-safe-control", "")
          ownedMarkers.add(control)
        }
      }
      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-captain-safe-control], [data-captain-content], [data-captain-host-slot]",
      )) {
        observeExternal(element)
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
      content.removeAttribute("data-captain-reserved")
      content.style.removeProperty("--captain-reserved-width")
    }
    return () => {
      content.removeAttribute("data-captain-reserved")
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
    </aside>
  )
}
