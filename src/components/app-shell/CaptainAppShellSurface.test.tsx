// @vitest-environment happy-dom

import type { CaptainAppEventInput } from "./app-shell-types.ts"
import type { CaptainLifecycleEvent, CaptainLifecycleSource } from "./useCaptainAppEvents.ts"
import type { FleetSkinContextValue } from "@/components/fleet-skin-context.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CaptainAppShellSurface } from "./CaptainAppShellSurface.tsx"
import { useCaptain } from "@/components/captain/captain-context.ts"
import { CaptainOrchestrator } from "@/components/captain/CaptainOrchestrator.tsx"
import { FleetSkinContext } from "@/components/fleet-skin-context.ts"
import { I18nProvider } from "@/i18n/I18nProvider.tsx"
import { resolveFleetSkin } from "@/skins/fleet-skins.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []
const fleetSkin: FleetSkinContextValue = {
  activeCrewId: "watchtide",
  skin: resolveFleetSkin("watchtide"),
  requestCrew: () => undefined,
  phase: "idle",
  pendingCrewId: null,
  error: null,
  retry: () => undefined,
  preloadCrew: () => undefined,
}

class TypedLifecycleSource implements CaptainLifecycleSource {
  readonly listeners = new Set<(event: CaptainLifecycleEvent) => void>()
  readonly retiredListeners: Array<(event: CaptainLifecycleEvent) => void> = []
  unsubscribeCount = 0

  subscribe(listener: (event: CaptainLifecycleEvent) => void): () => void {
    this.listeners.add(listener)
    this.retiredListeners.push(listener)
    return () => {
      this.listeners.delete(listener)
      this.unsubscribeCount += 1
    }
  }

  emit(event: CaptainLifecycleEvent): void {
    act(() => {
      for (const listener of this.listeners) listener(event)
    })
  }

  emitDuringReactEffect(event: CaptainLifecycleEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

function appInput(activeSessionId: string | null, displayedStatus: CaptainAppEventInput["displayedStatus"] = "ready") {
  return {
    route: "chat" as const,
    activeSessionId,
    displayedStatus,
    agentStatus: { status: "ready" as const },
    pendingPermissions: [],
    activity: null,
    error: null,
  }
}

function Probe() {
  const captain = useCaptain()
  return (
    <output
      data-epoch={captain.epoch}
      data-event-id={captain.snapshot.activeEventId ?? ""}
      data-state={captain.snapshot.state}
    >
      {captain.snapshot.captionKey}
    </output>
  )
}

interface ViewState {
  readonly activeSessionId: string | null
  readonly child: "archived" | "billing" | "main" | "settings"
  readonly chatIsEmpty: boolean
  readonly displayedStatus: CaptainAppEventInput["displayedStatus"]
  readonly route: CaptainAppEventInput["route"]
  readonly surfaceKey: number
}

function renderSurface(source: TypedLifecycleSource, initial: Partial<ViewState> = {}) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  let state: ViewState = {
    activeSessionId: "active",
    child: "main",
    chatIsEmpty: false,
    displayedStatus: "ready",
    route: "chat",
    surfaceKey: 1,
    ...initial,
  }

  function draw(layoutEmitter?: React.ReactNode) {
    const input = { ...appInput(state.activeSessionId, state.displayedStatus), route: state.route }
    act(() =>
      root.render(
        <I18nProvider>
          <FleetSkinContext.Provider value={fleetSkin}>
            <CaptainOrchestrator>
              <CaptainAppShellSurface
                key={state.surfaceKey}
                activeProject={false}
                activeSessionId={state.activeSessionId}
                activeTask={false}
                chatIsEmpty={state.chatIsEmpty}
                eventInput={input}
                lifecycleSource={source}
                modalOpen={false}
                route={state.route}
                viewportWidth={1440}
              >
                <main data-captain-content data-route-child={state.child}>
                  {layoutEmitter}
                </main>
                <Probe />
              </CaptainAppShellSurface>
            </CaptainOrchestrator>
          </FleetSkinContext.Provider>
        </I18nProvider>,
      ),
    )
  }
  draw()
  return {
    container,
    update(next: Partial<ViewState>, layoutEmitter?: React.ReactNode) {
      state = { ...state, ...next }
      draw(layoutEmitter)
    },
  }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("CaptainAppShellSurface production seam", () => {
  it("preserves one host node across main, settings, billing, and archived child changes", () => {
    const source = new TypedLifecycleSource()
    const view = renderSurface(source)
    const host = view.container.querySelector("[data-captain-host]")

    for (const child of ["settings", "billing", "archived", "main"] as const) {
      view.update({ child })
      expect(view.container.querySelector("[data-captain-host]")).toBe(host)
      expect(view.container.querySelector("[data-route-child]")?.getAttribute("data-route-child")).toBe(child)
    }
  })

  it("deduplicates translator-shaped starts/results and tracks parallel tools exactly", () => {
    const source = new TypedLifecycleSource()
    const view = renderSurface(source)
    const probe = view.container.querySelector("output")
    const startA: CaptainLifecycleEvent = {
      kind: "tool.started",
      sessionId: "active",
      callId: "opaque-call-a",
      partId: "opaque-part-a",
    }

    source.emit(startA)
    source.emit(startA) // pending -> running duplicate
    expect(probe?.dataset.state).toBe("executing")
    source.emit({ kind: "tool.started", sessionId: "active", callId: "opaque-call-b", partId: "opaque-part-b" })
    source.emit({ kind: "tool.result", sessionId: "active", callId: "opaque-call-a", partId: "opaque-part-a" })
    expect(probe?.dataset.state).toBe("executing")
    source.emit({ kind: "tool.result", sessionId: "active", callId: "opaque-call-b", partId: "opaque-part-b" })
    expect(probe?.dataset.state).toBe("idle")
    source.emit({ kind: "tool.result", sessionId: "active", callId: "opaque-call-b", partId: "opaque-part-b" })
    expect(probe?.dataset.state).toBe("idle")

    source.emit({ kind: "tool.result", sessionId: "active", callId: "opaque-call-c", partId: "opaque-part-c" })
    source.emit({ kind: "tool.started", sessionId: "active", callId: "opaque-call-c", partId: "opaque-part-c" })
    expect(probe?.dataset.state).toBe("idle")
    expect(view.container.innerHTML).not.toContain("opaque-call")
    expect(view.container.innerHTML).not.toContain("opaque-part")
  })

  it("switches subscription generation before a new-session layout event and rejects the old callback", () => {
    const source = new TypedLifecycleSource()
    const view = renderSurface(source, { activeSessionId: "old" })
    const oldListener = source.retiredListeners[0]
    function EmitOnLayout() {
      React.useLayoutEffect(() => {
        source.emitDuringReactEffect({
          kind: "tool.started",
          sessionId: "new",
          callId: "new-call",
          partId: "new-part",
        })
      }, [])
      return null
    }

    view.update({ activeSessionId: "new" }, <EmitOnLayout />)
    const probe = view.container.querySelector("output")
    expect(probe?.dataset.state).toBe("executing")
    const epoch = Number(probe?.dataset.epoch)
    act(() => oldListener?.({ kind: "tool.started", sessionId: "new", callId: "stale", partId: "stale" }))
    expect(Number(probe?.dataset.epoch)).toBe(epoch)
    expect(source.unsubscribeCount).toBeGreaterThanOrEqual(1)
  })

  it("resets the producer epoch on seam remount and first terminal wins until a new run", () => {
    const source = new TypedLifecycleSource()
    const view = renderSurface(source, { displayedStatus: "streaming" })
    const probe = view.container.querySelector("output")
    source.emit({ kind: "turn.completed", sessionId: "active" })
    expect(probe?.textContent).toBe("captain.success")
    source.emit({ kind: "turn.stopped", sessionId: "active" })
    expect(probe?.textContent).toBe("captain.success")
    source.emit({ kind: "turn.completed", sessionId: "active" })
    expect(probe?.textContent).toBe("captain.success")

    view.update({ displayedStatus: "ready" })
    view.update({ displayedStatus: "submitted" })
    source.emit({ kind: "turn.stopped", sessionId: "active" })
    expect(probe?.textContent).not.toBe("captain.success")
    const epoch = Number(probe?.dataset.epoch)
    view.update({ surfaceKey: 2 })
    const nextProbe = view.container.querySelector("output")
    expect(Number(nextProbe?.dataset.epoch)).toBeGreaterThan(epoch)
  })

  it("reserves companion content and reports effective compact bounds after stage collision", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 })
    const source = new TypedLifecycleSource()
    const view = renderSurface(source)
    const content = view.container.querySelector<HTMLElement>("[data-captain-content]")
    expect(content?.dataset.captainReserved).toBe("true")

    const control = document.createElement("button")
    control.setAttribute("data-captain-safe-control", "")
    control.getBoundingClientRect = () => ({
      bottom: 740,
      height: 680,
      left: 920,
      right: 1380,
      top: 60,
      width: 460,
      x: 920,
      y: 60,
      toJSON: () => ({}),
    })
    document.body.append(control)
    view.update({ activeSessionId: null, chatIsEmpty: true, route: "fleet" })
    const host = view.container.querySelector<HTMLElement>("[data-captain-host]")
    if (!host) throw new Error("captain host missing")
    host.getBoundingClientRect = () => ({
      bottom: 760,
      height: 700,
      left: 900,
      right: 1400,
      top: 60,
      width: 500,
      x: 900,
      y: 60,
      toJSON: () => ({}),
    })
    act(() => window.dispatchEvent(new Event("scroll")))
    await vi.waitFor(() => expect(host.dataset.captainMode).toBe("compact"))
    expect(host.dataset.captainMaxWidth).toBe("72")
    expect(host.style.width).toBe("")
  })
})
