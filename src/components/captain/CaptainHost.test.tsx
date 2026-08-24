// @vitest-environment happy-dom

import type { FleetSkinContextValue } from "@/components/fleet-skin-context.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import { CaptainHost, resolveCaptainLayout, safeCaptainVerticalShift } from "./CaptainHost.tsx"
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
    ["fleet", null, 1280, false, "stage", 360, 520],
    ["voyage", null, 1600, false, "stage", 360, 520],
    ["chat", null, 1280, false, "stage", 360, 520],
    ["chat", "active", 1180, false, "companion", 240, 300],
    ["skills", null, 1180, false, "companion", 240, 300],
    ["connections", null, 1440, false, "companion", 240, 300],
    ["settings", null, 1600, false, "compact", 0, 72],
    ["fleet", null, 1279, false, "compact", 0, 72],
    ["chat", "active", 1179, false, "compact", 0, 72],
    ["chat", "active", 1440, true, "compact", 0, 72],
  ] as const)(
    "maps %s at %i px to exact %s bounds",
    (route, activeSessionId, viewportWidth, modalOpen, mode, minWidth, maxWidth) => {
      expect(resolveCaptainLayout({ activeSessionId, modalOpen, route, viewportWidth })).toEqual({
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

  it("moves the decorative host clear of marked safe controls", () => {
    const shift = safeCaptainVerticalShift(
      { bottom: 700, left: 1080, right: 1360, top: 300 },
      [
        { bottom: 680, left: 1100, right: 1320, top: 620 },
        { bottom: 710, left: 40, right: 240, top: 650 },
      ],
      12,
    )

    expect(shift).toBe(-92)
    expect(700 + shift).toBeLessThanOrEqual(620 - 12)
  })
})
