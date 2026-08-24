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
  subscribeCount = 0

  public constructor(
    private readonly onSubscribe?: (listener: (event: CaptainLifecycleEvent) => void, subscription: number) => void,
  ) {}

  subscribe(listener: (event: CaptainLifecycleEvent) => void): () => void {
    this.subscribeCount += 1
    this.listeners.add(listener)
    this.retiredListeners.push(listener)
    this.onSubscribe?.(listener, this.subscribeCount)
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

  emitMany(events: readonly CaptainLifecycleEvent[]): void {
    act(() => {
      for (const event of events) {
        for (const listener of this.listeners) listener(event)
      }
    })
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
  readonly strictMode: boolean
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
    strictMode: false,
    ...initial,
  }

  function draw(layoutEmitter?: React.ReactNode) {
    const input = { ...appInput(state.activeSessionId, state.displayedStatus), route: state.route }
    const tree = (
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
      </I18nProvider>
    )
    act(() => root.render(state.strictMode ? <React.StrictMode>{tree}</React.StrictMode> : tree))
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
  it("preserves one host node across real main, settings, billing, and archived route/layout changes", () => {
    const source = new TypedLifecycleSource()
    const view = renderSurface(source)
    const host = view.container.querySelector("[data-captain-host]")

    for (const [child, route, mode] of [
      ["settings", "settings", "compact"],
      ["billing", "billing", "compact"],
      ["archived", "archived", "compact"],
      ["main", "chat", "companion"],
    ] as const) {
      view.update({ child, route })
      expect(view.container.querySelector("[data-captain-host]")).toBe(host)
      expect(view.container.querySelector("[data-route-child]")?.getAttribute("data-route-child")).toBe(child)
      expect(view.container.querySelector("[data-captain-host]")?.getAttribute("data-captain-mode")).toBe(mode)
    }
  })

  it("replays a one-shot insertion event into the replacement StrictMode lease exactly once", () => {
    let emitted = false
    const source = new TypedLifecycleSource((listener) => {
      if (emitted) return
      emitted = true
      listener({ kind: "tool.started", sessionId: "active", callId: "strict-call", partId: "strict-part" })
    })
    const view = renderSurface(source, { strictMode: true })
    const probe = view.container.querySelector("output")

    expect(probe?.dataset.state).toBe("executing")
    expect(Number(probe?.dataset.epoch)).toBeGreaterThan(0)
    expect(source.subscribeCount).toBe(1)
    expect(view.container.innerHTML).not.toContain("strict-call")
    source.emit({ kind: "tool.result", sessionId: "active", callId: "strict-call", partId: "strict-part" })
    expect(probe?.dataset.state).toBe("idle")
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

  it("ignores late tools and opposite terminals until quiescence proves a new turn, then permits reused IDs", () => {
    const cancel = vi.fn()
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel, speak: vi.fn(), getVoices: () => [] },
    })
    const source = new TypedLifecycleSource()
    const view = renderSurface(source, { displayedStatus: "streaming" })
    const probe = view.container.querySelector("output")
    source.emit({ kind: "turn.completed", sessionId: "active" })
    expect(probe?.textContent).toBe("captain.success")

    const cancellationsAfterCompletion = cancel.mock.calls.length
    source.emit({ kind: "tool.result", sessionId: "active", callId: "reused", partId: "part" })
    source.emit({ kind: "tool.started", sessionId: "active", callId: "reused", partId: "part" })
    view.update({ child: "settings", route: "settings" })
    source.emit({ kind: "turn.stopped", sessionId: "active" })
    expect(probe?.textContent).toBe("captain.success")
    expect(cancel.mock.calls.length).toBe(cancellationsAfterCompletion)

    view.update({ displayedStatus: "ready" })
    view.update({ child: "main", displayedStatus: "submitted", route: "chat" })
    source.emit({ kind: "tool.started", sessionId: "active", callId: "reused", partId: "part" })
    view.update({ displayedStatus: "ready" })
    expect(probe?.dataset.eventId).toContain("-tool-")
    source.emit({ kind: "turn.stopped", sessionId: "active" })
    expect(probe?.textContent).not.toBe("captain.success")
    expect(cancel.mock.calls.length).toBeGreaterThan(cancellationsAfterCompletion)
  })

  it("bounds the pre-lease queue at 64 events and fails closed until terminal reset", () => {
    const queuedEvents = Array.from(
      { length: 65 },
      (_, index): CaptainLifecycleEvent => ({
        kind: "tool.result",
        sessionId: "active",
        callId: `queued-${index}`,
        partId: "part",
      }),
    )
    const source = new TypedLifecycleSource((listener) => {
      for (const event of queuedEvents) listener(event)
    })
    const view = renderSurface(source)
    const probe = view.container.querySelector("output")
    expect(probe?.dataset.state).toBe("executing")
    source.emit({ kind: "turn.stopped", sessionId: "active" })
    expect(probe?.dataset.state).toBe("idle")
  })

  it("bounds each opaque ID at 256 characters and its exact composite key", () => {
    const source = new TypedLifecycleSource()
    const view = renderSurface(source)
    const probe = view.container.querySelector("output")
    const boundedCall = "c".repeat(256)
    const boundedPart = "p".repeat(256)
    source.emit({ kind: "tool.started", sessionId: "active", callId: boundedCall, partId: boundedPart })
    expect(probe?.dataset.state).toBe("executing")
    source.emit({ kind: "tool.result", sessionId: "active", callId: boundedCall, partId: boundedPart })
    expect(probe?.dataset.state).toBe("idle")

    source.emit({ kind: "tool.result", sessionId: "active", callId: "x".repeat(257), partId: "part" })
    expect(probe?.dataset.state).toBe("executing")
    source.emit({ kind: "tool.result", sessionId: "active", callId: "x".repeat(257), partId: "part" })
    expect(probe?.dataset.state).toBe("executing")
    source.emit({ kind: "turn.stopped", sessionId: "active" })
    expect(probe?.dataset.state).toBe("idle")
  })

  it("bounds active and retired identities at 128 without evicting ambiguous identities", () => {
    const activeSource = new TypedLifecycleSource()
    const activeView = renderSurface(activeSource)
    const activeProbe = activeView.container.querySelector("output")
    const starts = Array.from(
      { length: 129 },
      (_, index): CaptainLifecycleEvent => ({
        kind: "tool.started",
        sessionId: "active",
        callId: `active-${index}`,
        partId: "part",
      }),
    )
    activeSource.emitMany(starts)
    activeSource.emitMany(
      Array.from(
        { length: 129 },
        (_, index): CaptainLifecycleEvent => ({
          kind: "tool.result",
          sessionId: "active",
          callId: `active-${index}`,
          partId: "part",
        }),
      ),
    )
    expect(activeProbe?.dataset.state).toBe("executing")
    activeSource.emit({ kind: "turn.stopped", sessionId: "active" })
    expect(activeProbe?.dataset.state).toBe("idle")

    const retiredSource = new TypedLifecycleSource()
    const retiredView = renderSurface(retiredSource)
    const retiredProbe = retiredView.container.querySelector("output")
    retiredSource.emitMany(
      Array.from(
        { length: 129 },
        (_, index): CaptainLifecycleEvent => ({
          kind: "tool.result",
          sessionId: "active",
          callId: `retired-${index}`,
          partId: "part",
        }),
      ),
    )
    expect(retiredProbe?.dataset.state).toBe("executing")
    retiredSource.emit({ kind: "tool.result", sessionId: "active", callId: "retired-0", partId: "part" })
    expect(retiredProbe?.dataset.state).toBe("executing")
    retiredSource.emit({ kind: "turn.stopped", sessionId: "active" })
    expect(retiredProbe?.dataset.state).toBe("idle")
  })

  it("recomputes a stage slot from captured ResizeObserver callbacks and retargets replacements", async () => {
    const callbacks: ResizeObserverCallback[] = []
    const observed: Element[] = []
    class TestResizeObserver {
      public constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
      }
      public disconnect() {}
      public observe(element: Element) {
        observed.push(element)
      }
      public unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver)
    let slotWidth = 500
    let slotLeft = 900
    let controlRect = { bottom: 690, left: 120, right: 480, top: 110 }
    const control = document.createElement("button")
    control.setAttribute("data-captain-safe-control", "")
    control.getBoundingClientRect = () => ({
      ...controlRect,
      height: controlRect.bottom - controlRect.top,
      width: controlRect.right - controlRect.left,
      x: controlRect.left,
      y: controlRect.top,
      toJSON: () => ({}),
    })
    const slot = document.createElement("div")
    slot.setAttribute("data-captain-host-slot", "")
    slot.getBoundingClientRect = () => ({
      bottom: 700,
      height: 600,
      left: slotLeft,
      right: slotLeft + slotWidth,
      top: 100,
      width: slotWidth,
      x: slotLeft,
      y: 100,
      toJSON: () => ({}),
    })
    document.body.append(slot, control)
    const source = new TypedLifecycleSource()
    const view = renderSurface(source, { activeSessionId: null, chatIsEmpty: true, route: "fleet" })
    const host = view.container.querySelector<HTMLElement>("[data-captain-host]")
    if (!host) throw new Error("captain host missing")
    host.getBoundingClientRect = slot.getBoundingClientRect
    expect(observed).toContain(slot)
    expect(host.style.width).toBe("500px")

    slotWidth = 400
    act(() => callbacks[0]?.([], {} as ResizeObserver))
    expect(host.style.width).toBe("400px")

    slotLeft = 100
    act(() => callbacks[0]?.([], {} as ResizeObserver))
    await vi.waitFor(() => expect(host.dataset.captainMode).toBe("compact"))
    expect(host.style.width).toBe("")

    const replacement = slot.cloneNode() as HTMLElement
    replacement.getBoundingClientRect = () => ({
      bottom: 700,
      height: 600,
      left: 920,
      right: 1280,
      top: 100,
      width: 360,
      x: 920,
      y: 100,
      toJSON: () => ({}),
    })
    controlRect = { bottom: 100, left: 0, right: 50, top: 50 }
    act(() => slot.replaceWith(replacement))
    await vi.waitFor(() => expect(observed).toContain(replacement))
    host.getBoundingClientRect = replacement.getBoundingClientRect
    act(() => callbacks[0]?.([], {} as ResizeObserver))
    await vi.waitFor(() => expect(host.dataset.captainMode).toBe("stage"))
    expect(host.style.width).toBe("360px")
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
