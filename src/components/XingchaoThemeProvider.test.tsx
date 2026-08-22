// @vitest-environment happy-dom

import type { RuntimeFleetContextValue } from "./runtime-fleet-context.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { storageKey } from "../../electron/branding.ts"
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

async function renderThemeProbe(contextValue: RuntimeFleetContextValue) {
  const host = document.createElement("div")
  const root = createRoot(host)
  roots.push(root)
  const render = async (value: RuntimeFleetContextValue) => {
    await act(async () => {
      root.render(
        <RuntimeFleetContext.Provider value={value}>
          <XingchaoThemeProvider>
            <Probe />
          </XingchaoThemeProvider>
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
  document.documentElement.style.removeProperty("--xingchao-primary")
  document.documentElement.style.removeProperty("--xingchao-secondary")
  document.documentElement.style.removeProperty("--xingchao-accent")
  document.documentElement.style.removeProperty("--xingchao-surface")
  document.documentElement.style.removeProperty("--xingchao-foreground")
})

describe("XingchaoThemeProvider", () => {
  it("applies an imported crew palette and clears it when the crew disappears", async () => {
    const { host, rerender } = await renderThemeProbe(importedRuntimeFleetContext("aurora-pack"))

    await act(async () => host.querySelector("button")!.click())

    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#123456")
    expect(localStorage.getItem(storageKey("activeCrew"))).toBe("aurora-pack--watchtide")

    await rerender(builtinRuntimeFleetContext)

    expect(localStorage.getItem(storageKey("activeCrew"))).toBeNull()
    expect(document.documentElement.dataset.crew).toBe("watchtide")
    expect(host.textContent).toBe("watchtide")
  })
})
