// @vitest-environment happy-dom

import type { FleetSkinContextValue } from "@/components/fleet-skin-context.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CaptainHost, resolveCaptainLayout, safeCaptainPlacement } from "./CaptainHost.tsx"
import { CaptainOrchestrator } from "./CaptainOrchestrator.tsx"
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

function TestTree({
  activeSessionId,
  activeProject,
  activeTask,
  chatIsEmpty,
  modalOpen = false,
  route,
  viewportWidth,
}: React.ComponentProps<typeof CaptainHost>) {
  return (
    <I18nProvider>
      <FleetSkinContext.Provider value={fleetSkin}>
        <CaptainOrchestrator>
          <CaptainHost
            activeSessionId={activeSessionId}
            activeProject={activeProject}
            activeTask={activeTask}
            chatIsEmpty={chatIsEmpty}
            modalOpen={modalOpen}
            route={route}
            viewportWidth={viewportWidth}
          />
        </CaptainOrchestrator>
      </FleetSkinContext.Provider>
    </I18nProvider>
  )
}

function renderCaptain(props: React.ComponentProps<typeof CaptainHost>) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<TestTree {...props} />))
  return {
    container,
    rerender(next: React.ComponentProps<typeof CaptainHost>) {
      act(() => root.render(<TestTree {...next} />))
    },
  }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  localStorage.clear()
})

describe("CaptainHost adaptive layout", () => {
  it.each([
    ["fleet", null, false, false, false, 1280, false, "stage", 360, 520],
    ["voyage", null, false, false, false, 1600, false, "stage", 360, 520],
    ["chat", null, true, false, false, 1280, false, "stage", 360, 520],
    ["chat", "loaded-empty", true, false, false, 1280, false, "stage", 360, 520],
    ["chat", "active", false, false, false, 1180, false, "companion", 240, 300],
    ["chat", "project", true, true, false, 1280, false, "companion", 240, 300],
    ["chat", "task", false, false, true, 1280, false, "companion", 240, 300],
    ["skills", null, false, false, false, 1180, false, "companion", 240, 300],
    ["connections", null, false, false, false, 1440, false, "companion", 240, 300],
    ["archived", null, false, false, false, 1600, false, "compact", 0, 72],
    ["knowledge", null, false, false, false, 1600, false, "compact", 0, 72],
    ["settings", null, false, false, false, 1600, false, "compact", 0, 72],
    ["fleet", null, false, false, false, 1279, false, "compact", 0, 72],
    ["chat", "active", false, false, false, 1179, false, "compact", 0, 72],
    ["chat", "active", false, false, false, 1440, true, "compact", 0, 72],
  ] as const)(
    "maps %s at %i px to exact %s bounds",
    (
      route,
      activeSessionId,
      chatIsEmpty,
      activeProject,
      activeTask,
      viewportWidth,
      modalOpen,
      mode,
      minWidth,
      maxWidth,
    ) => {
      expect(
        resolveCaptainLayout({
          activeProject,
          activeSessionId,
          activeTask,
          chatIsEmpty,
          modalOpen,
          route,
          viewportWidth,
        }),
      ).toEqual({
        mode,
        minWidth,
        maxWidth,
      })
    },
  )

  it("keeps one host instance across route changes and limits pointer events to safe controls", () => {
    const view = renderCaptain({ activeSessionId: null, route: "fleet", viewportWidth: 1440 })
    const initialHost = view.container.querySelector("[data-captain-host]")

    expect(initialHost?.getAttribute("data-captain-mode")).toBe("stage")
    expect(initialHost?.getAttribute("data-captain-min-width")).toBe("360")
    expect(initialHost?.getAttribute("data-captain-max-width")).toBe("520")
    expect(initialHost?.querySelector("[data-captain-decorative]")?.className).toContain("pointer-events-none")
    expect(initialHost?.querySelector("[data-captain-controls]")?.className).toContain("pointer-events-auto")
    expect(initialHost?.querySelectorAll("[data-captain-safe-control]").length).toBeGreaterThanOrEqual(4)

    view.rerender({ activeSessionId: "active", route: "chat", viewportWidth: 1440 })
    const rerenderedHost = view.container.querySelector("[data-captain-host]")
    expect(rerenderedHost).toBe(initialHost)
    expect(rerenderedHost?.getAttribute("data-captain-mode")).toBe("companion")

    view.rerender({ activeSessionId: "active", modalOpen: true, route: "chat", viewportWidth: 1440 })
    expect(view.container.querySelector("[data-captain-host]")?.getAttribute("data-captain-mode")).toBe("compact")
  })

  it("uses unshifted geometry, clamps to the viewport, and reports impossible clearance", () => {
    const placement = safeCaptainPlacement(
      { bottom: 700, left: 1080, right: 1360, top: 300 },
      [
        { bottom: 680, left: 1100, right: 1320, top: 620 },
        { bottom: 710, left: 40, right: 240, top: 650 },
      ],
      800,
      12,
    )

    expect(placement).toEqual({ possible: true, shift: -92 })
    expect(700 + placement.shift).toBeLessThanOrEqual(620 - 12)
    expect(
      safeCaptainPlacement(
        { bottom: 700, left: 1080, right: 1360, top: 20 },
        [{ bottom: 680, left: 1100, right: 1320, top: 40 }],
        720,
        12,
      ),
    ).toEqual({ possible: false, shift: 0 })
  })

  it("reserves real content width in companion mode and releases it in compact mode", () => {
    const content = document.createElement("main")
    content.setAttribute("data-captain-content", "")
    document.body.append(content)
    const view = renderCaptain({ activeSessionId: "active", chatIsEmpty: false, route: "chat", viewportWidth: 1440 })

    expect(content.getAttribute("data-captain-reserved")).toBe("true")
    expect(content.style.getPropertyValue("--captain-reserved-width")).toContain("clamp(240px")

    view.rerender({ activeSessionId: "active", chatIsEmpty: false, route: "settings", viewportWidth: 1440 })
    expect(content.hasAttribute("data-captain-reserved")).toBe(false)
  })

  it("sizes stage to 35% of available content within bounds", () => {
    const content = document.createElement("main")
    content.setAttribute("data-captain-content", "")
    content.getBoundingClientRect = () => ({
      bottom: 800,
      height: 800,
      left: 200,
      right: 1400,
      top: 0,
      width: 1200,
      x: 200,
      y: 0,
      toJSON: () => ({}),
    })
    document.body.append(content)
    const view = renderCaptain({ activeSessionId: null, chatIsEmpty: true, route: "chat", viewportWidth: 1600 })

    expect(view.container.querySelector<HTMLElement>("[data-captain-host]")?.style.width).toBe("420px")
  })

  it("recomputes unshifted geometry on scroll and recovers from offscreen fallback", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 })
    const control = document.createElement("button")
    control.setAttribute("data-captain-safe-control", "")
    let controlRect = { bottom: 100, left: 0, right: 100, top: 50 }
    control.getBoundingClientRect = () => ({
      ...controlRect,
      height: controlRect.bottom - controlRect.top,
      width: controlRect.right - controlRect.left,
      x: controlRect.left,
      y: controlRect.top,
      toJSON: () => ({}),
    })
    document.body.append(control)
    const view = renderCaptain({ activeSessionId: "active", chatIsEmpty: false, route: "chat", viewportWidth: 1440 })
    const host = view.container.querySelector<HTMLElement>("[data-captain-host]")
    if (!host) throw new Error("captain host missing")
    host.getBoundingClientRect = () => ({
      bottom: 700,
      height: 680,
      left: 1080,
      right: 1360,
      top: 20,
      width: 280,
      x: 1080,
      y: 20,
      toJSON: () => ({}),
    })

    controlRect = { bottom: 680, left: 1100, right: 1320, top: 40 }
    act(() => window.dispatchEvent(new Event("scroll")))
    await vi.waitFor(() => expect(host.dataset.captainMode).toBe("compact"))

    controlRect = { bottom: 100, left: 0, right: 100, top: 50 }
    act(() => window.dispatchEvent(new Event("scroll")))
    await vi.waitFor(() => expect(host.dataset.captainMode).toBe("companion"))
  })

  it("detects alert dialogs and returns to the approved layout after they close", async () => {
    const view = renderCaptain({ activeSessionId: "active", chatIsEmpty: false, route: "chat", viewportWidth: 1440 })
    const alertDialog = document.createElement("div")
    alertDialog.setAttribute("role", "alertdialog")
    act(() => document.body.append(alertDialog))
    await vi.waitFor(() =>
      expect(view.container.querySelector("[data-captain-host]")?.getAttribute("data-captain-mode")).toBe("compact"),
    )

    act(() => alertDialog.remove())
    await vi.waitFor(() =>
      expect(view.container.querySelector("[data-captain-host]")?.getAttribute("data-captain-mode")).toBe("companion"),
    )
  })

  it("exposes click-only, volume, and rate controls without requesting microphone access", () => {
    const getUserMedia = vi.fn()
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    })
    const view = renderCaptain({ activeSessionId: null, chatIsEmpty: true, route: "fleet", viewportWidth: 1440 })
    const clickOnly = view.container.querySelector<HTMLButtonElement>('[aria-label="Only speak when clicked"]')
    const volume = view.container.querySelector<HTMLInputElement>('[aria-label="Captain voice volume"]')
    const rate = view.container.querySelector<HTMLInputElement>('[aria-label="Captain voice rate"]')

    expect(clickOnly).not.toBeNull()
    expect(volume).toMatchObject({ max: "1", min: "0", type: "range" })
    expect(rate).toMatchObject({ max: "2", min: "0.5", type: "range" })
    act(() => clickOnly?.click())
    expect(clickOnly?.getAttribute("aria-pressed")).toBe("true")
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it("binds host text, surfaces, and focus to high-contrast semantic tokens", () => {
    document.documentElement.dataset.fleetContrast = "high"
    const view = renderCaptain({ activeSessionId: null, chatIsEmpty: true, route: "fleet", viewportWidth: 1440 })
    const host = view.container.querySelector<HTMLElement>("[data-captain-host]")

    expect(host?.style.getPropertyValue("--captain-host-text")).toBe("var(--foreground)")
    expect(host?.style.getPropertyValue("--captain-host-surface")).toBe("var(--card)")
    expect(host?.style.getPropertyValue("--captain-host-focus")).toBe("var(--ring)")
  })
})
