import type { CaptainDisplayMode, CaptainRendererEvent } from "@/captain/captain-types.ts"
import type { AppShellRoute } from "@/components/app-shell/app-shell-types.ts"
import type { MessageKey } from "@/i18n"
import type { CSSProperties } from "react"

import { BookOpen, ChevronDown, ChevronUp, RotateCcw, Volume2, VolumeX } from "lucide-react"
import * as React from "react"
import { CaptainBoundary } from "./CaptainBoundary.tsx"
import { LayeredCaptainRenderer } from "./LayeredCaptainRenderer.tsx"
import { useCaptain } from "./captain-context.ts"
import { useFleetSkin } from "@/components/fleet-skin-context.ts"
import { useT } from "@/i18n"

/* oxlint-disable react/only-export-components -- Task 10 keeps the tested adaptive layout contracts beside their sole DOM consumer. */

export interface CaptainHostProps {
  readonly route: AppShellRoute
  readonly activeSessionId: string | null
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
const companionRoutes = new Set<AppShellRoute>([
  "archived",
  "billing",
  "connections",
  "knowledge",
  "skills",
  "supply",
  "teams",
])
const safeControlSelector = [
  ".oo-composer",
  ".oo-main-titlebar",
  '[role="dialog"]',
  "button",
  "input",
  "select",
  "textarea",
  '[role="button"]',
].join(",")

export function resolveCaptainLayout({
  activeSessionId,
  modalOpen = false,
  route,
  viewportWidth,
}: CaptainLayoutInput): CaptainLayout {
  if (modalOpen || route === "settings") return Object.freeze({ mode: "compact", minWidth: 0, maxWidth: 72 })
  const stage = stageRoutes.has(route) || (route === "chat" && activeSessionId === null)
  if (stage && viewportWidth >= 1280) return Object.freeze({ mode: "stage", minWidth: 360, maxWidth: 520 })
  const companion = companionRoutes.has(route) || (route === "chat" && activeSessionId !== null)
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

/** Returns a non-positive translateY that clears every horizontally intersecting safe control. */
export function safeCaptainVerticalShift(host: RectEdges, controls: readonly RectEdges[], gap = 12): number {
  let shift = 0
  const relevant = controls.filter((control) => horizontalOverlap(host, control)).sort((a, b) => b.top - a.top)
  for (const control of relevant) {
    const shifted = { ...host, top: host.top + shift, bottom: host.bottom + shift }
    if (verticalOverlap(shifted, control, gap)) shift += control.top - gap - shifted.bottom
  }
  return Math.min(0, shift)
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

export function CaptainHost({ activeSessionId, modalOpen = false, route, viewportWidth }: CaptainHostProps) {
  const captain = useCaptain()
  const fleetSkin = useFleetSkin()
  const t = useT()
  const width = useViewportWidth(viewportWidth)
  const [detectedModalOpen, setDetectedModalOpen] = React.useState(false)
  const effectiveModalOpen = modalOpen || detectedModalOpen
  const layout = resolveCaptainLayout({ activeSessionId, modalOpen: effectiveModalOpen, route, viewportWidth: width })
  const [expanded, setExpanded] = React.useState(false)
  const [rendererFailed, setRendererFailed] = React.useState(false)
  const [recoveryKey, setRecoveryKey] = React.useState(0)
  const [safeShift, setSafeShift] = React.useState(0)
  const [slotStyle, setSlotStyle] = React.useState<CSSProperties | undefined>(() => stageSlotStyle(layout.mode))
  const manualSequence = React.useRef(0)
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const mode = expanded && layout.mode === "compact" && !effectiveModalOpen && width >= 1180 ? "companion" : layout.mode
  const bounds =
    mode === layout.mode
      ? layout
      : ({ mode: "companion", minWidth: 240, maxWidth: 300 } satisfies CaptainLayout)

  const updatePlacement = React.useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const hostRect = host.getBoundingClientRect()
    const controls = [...document.querySelectorAll<HTMLElement>("[data-captain-safe-control]")]
      .filter((control) => !host.contains(control))
      .map((control) => control.getBoundingClientRect())
    setSafeShift(safeCaptainVerticalShift(hostRect, controls))
    setSlotStyle(stageSlotStyle(mode))
  }, [mode])

  React.useLayoutEffect(() => {
    updatePlacement()
    window.addEventListener("resize", updatePlacement)
    const observer = typeof MutationObserver === "function" ? new MutationObserver(updatePlacement) : null
    observer?.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", updatePlacement)
    }
  }, [updatePlacement])

  React.useEffect(() => {
    const detect = () => setDetectedModalOpen(document.querySelector('[role="dialog"]') !== null)
    detect()
    const observer = typeof MutationObserver === "function" ? new MutationObserver(detect) : null
    observer?.observe(document.body, { childList: true, subtree: true })
    return () => observer?.disconnect()
  }, [])

  React.useEffect(() => {
    const host = hostRef.current
    const ownedMarkers = new Set<HTMLElement>()
    const markSafeControls = () => {
      for (const control of document.querySelectorAll<HTMLElement>(safeControlSelector)) {
        if (host?.contains(control) || control.hasAttribute("data-captain-safe-control")) continue
        control.setAttribute("data-captain-safe-control", "")
        ownedMarkers.add(control)
      }
      updatePlacement()
    }
    markSafeControls()
    const observer = typeof MutationObserver === "function" ? new MutationObserver(markSafeControls) : null
    observer?.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer?.disconnect()
      for (const control of ownedMarkers) {
        if (control.isConnected) control.removeAttribute("data-captain-safe-control")
      }
    }
  }, [updatePlacement])

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
  } as CSSProperties
  const skin = fleetSkin.skin

  return (
    <aside
      ref={hostRef}
      className={`captain-host captain-host--${mode} pointer-events-none`}
      data-captain-host
      data-captain-mode={mode}
      data-captain-min-width={bounds.minWidth}
      data-captain-max-width={bounds.maxWidth}
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
