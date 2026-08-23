// @vitest-environment happy-dom

import type { FleetSkinContextValue } from "./fleet-skin-context.ts"
import type { RuntimeFleetContextValue } from "./runtime-fleet-context.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { storageKey } from "../../electron/branding.ts"
import { FleetSkinContext } from "./fleet-skin-context.ts"
import { useFleetSkin } from "./fleet-skin-context.ts"
import { FleetSkinProvider } from "./FleetSkinProvider.tsx"
import { RuntimeFleetContext } from "./runtime-fleet-context.ts"
import { useXingchaoTheme } from "./xingchao-theme-context.ts"
import { XingchaoThemeProvider } from "./XingchaoThemeProvider.tsx"
import { originalFleetPack } from "@/domain/xingchao/content-pack.ts"
import { buildRuntimeContentCatalog } from "@/domain/xingchao/runtime-catalog.ts"
import {
  builtinRuntimeFleetIndex,
  builtinRuntimeFleetSnapshot,
  indexRuntimeFleet,
  projectRuntimeFleetCatalog,
} from "@/domain/xingchao/runtime-fleet.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []
const builtinRuntimeFleetContext: RuntimeFleetContextValue = {
  snapshot: builtinRuntimeFleetSnapshot,
  index: builtinRuntimeFleetIndex,
  status: "ready",
  error: null,
}

function importedRuntimeFleetContext(packId: string): RuntimeFleetContextValue {
  const pack = structuredClone({ ...originalFleetPack, id: packId, visibility: "private-local" as const })
  const watchtide = pack.crews[0]!
  watchtide.theme.primary = "#123456"
  pack.themes.find((theme) => theme.id === watchtide.theme.id)!.primary = "#123456"
  const snapshot = projectRuntimeFleetCatalog(buildRuntimeContentCatalog(originalFleetPack, [pack]))
  return { snapshot, index: indexRuntimeFleet(snapshot), status: "ready", error: null }
}

function Probe() {
  const theme = useXingchaoTheme()
  return <button onClick={() => theme.setActiveCrewId("aurora-pack--watchtide")}>{theme.activeCrewId}</button>
}

function BootAdapterProbe() {
  const fleetSkin = useFleetSkin()
  const theme = useXingchaoTheme()
  return (
    <output data-testid="boot-adapter">
      {fleetSkin.activeCrewId}:{theme.activeCrewId}:{theme.theme.id}:{fleetSkin.pendingCrewId ?? "none"}:
      {fleetSkin.skin?.identity.crewId ?? "none"}
    </output>
  )
}

async function renderThemeProbe(contextValue: RuntimeFleetContextValue) {
  const host = document.createElement("div")
  const root = createRoot(host)
  roots.push(root)
  const render = async (value: RuntimeFleetContextValue) => {
    await act(async () => {
      root.render(
        <RuntimeFleetContext.Provider value={value}>
          <FleetSkinProvider loadAsset={async () => undefined}>
            <XingchaoThemeProvider>
              <Probe />
            </XingchaoThemeProvider>
          </FleetSkinProvider>
        </RuntimeFleetContext.Provider>,
      )
    })
  }
  await render(contextValue)
  return { host, rerender: render }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  localStorage.clear()
  document.documentElement.removeAttribute("data-crew")
  document.documentElement.removeAttribute("data-fleet-skin")
  document.documentElement.removeAttribute("style")
})

describe("XingchaoThemeProvider", () => {
  it("keeps the adapter on the committed fallback until the stored skin transaction commits", async () => {
    localStorage.setItem(storageKey("activeCrew"), "phantom-wave")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    document.documentElement.style.setProperty("--xingchao-primary", "#abcdef")
    const resolvers: Array<() => void> = []
    const host = document.createElement("div")
    const root = createRoot(host)
    roots.push(root)

    await act(async () => {
      root.render(
        <RuntimeFleetContext.Provider value={builtinRuntimeFleetContext}>
          <FleetSkinProvider
            loadAsset={() =>
              new Promise<void>((resolve) => {
                resolvers.push(resolve)
              })
            }
          >
            <XingchaoThemeProvider>
              <BootAdapterProbe />
            </XingchaoThemeProvider>
          </FleetSkinProvider>
        </RuntimeFleetContext.Provider>,
      )
    })

    expect(host.textContent).toBe("watchtide:watchtide:watchtide:phantom-wave:none")
    expect(document.documentElement.dataset.fleetSkin).toBe("previous-shell")
    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#abcdef")

    await act(async () => {
      for (const resolve of resolvers) resolve()
    })

    expect(host.textContent).toBe("phantom-wave:phantom-wave:phantom-wave:none:phantom-wave")
    expect(document.documentElement.dataset.fleetSkin).toBe("phantom-wave")
  })

  it("adapts the fleet skin authority without owning selection, storage, or root mutation", async () => {
    const runtimeFleet = importedRuntimeFleetContext("aurora-pack")
    const requestCrew = vi.fn()
    const fleetSkinValue: FleetSkinContextValue = {
      activeCrewId: "aurora-pack--watchtide",
      skin: null,
      requestCrew,
      phase: "idle",
      pendingCrewId: null,
      error: null,
      retry: vi.fn(),
      preloadCrew: vi.fn(),
    }
    document.documentElement.dataset.crew = "provider-owned"
    document.documentElement.style.setProperty("--xingchao-primary", "#abcdef")
    const host = document.createElement("div")
    const root = createRoot(host)
    roots.push(root)

    await act(async () => {
      root.render(
        <RuntimeFleetContext.Provider value={runtimeFleet}>
          <FleetSkinContext.Provider value={fleetSkinValue}>
            <XingchaoThemeProvider>
              <Probe />
            </XingchaoThemeProvider>
          </FleetSkinContext.Provider>
        </RuntimeFleetContext.Provider>,
      )
    })

    expect(host.textContent).toBe("aurora-pack--watchtide")
    await act(async () => host.querySelector("button")!.click())
    expect(requestCrew).toHaveBeenCalledWith("aurora-pack--watchtide")
    expect(localStorage.getItem(storageKey("activeCrew"))).toBeNull()
    expect(document.documentElement.dataset.crew).toBe("provider-owned")
    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#abcdef")
  })

  it("applies an imported crew palette and commits the trusted fallback when the crew disappears", async () => {
    const { host, rerender } = await renderThemeProbe(importedRuntimeFleetContext("aurora-pack"))

    await act(async () => host.querySelector("button")!.click())

    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#123456")
    expect(localStorage.getItem(storageKey("activeCrew"))).toBe("aurora-pack--watchtide")

    await rerender(builtinRuntimeFleetContext)

    expect(localStorage.getItem(storageKey("activeCrew"))).toBe("watchtide")
    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(document.documentElement.dataset.crew).toBe("watchtide")
    expect(host.textContent).toBe("watchtide")
  })
})
