// @vitest-environment happy-dom

import type { RuntimeFleetContextValue } from "@/components/runtime-fleet-context.ts"
import type { XingchaoThemeContextValue } from "@/components/xingchao-theme-context.ts"
import type { CrewId } from "@/domain/xingchao/types.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import { FleetHarborRoute } from "./index.tsx"
import { RuntimeFleetContext } from "@/components/runtime-fleet-context.ts"
import { XingchaoThemeContext } from "@/components/xingchao-theme-context.ts"
import { originalFleetPack } from "@/domain/xingchao/content-pack.ts"
import { buildRuntimeContentCatalog } from "@/domain/xingchao/runtime-catalog.ts"
import {
  builtinRuntimeFleetIndex,
  builtinRuntimeFleetSnapshot,
  indexRuntimeFleet,
  projectRuntimeFleetCatalog,
} from "@/domain/xingchao/runtime-fleet.ts"
import { localeStorageKey } from "@/i18n/i18n.ts"
import { I18nProvider } from "@/i18n/I18nProvider.tsx"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []
const builtinRuntimeFleetContext: RuntimeFleetContextValue = {
  snapshot: builtinRuntimeFleetSnapshot,
  index: builtinRuntimeFleetIndex,
  status: "ready",
  error: null,
}

function runtimeContext(packId: string): RuntimeFleetContextValue {
  const pack = structuredClone({ ...originalFleetPack, id: packId, visibility: "private-local" as const })
  const builtinPack = structuredClone(originalFleetPack)
  for (const agent of builtinPack.agents.filter((candidate) => candidate.crewId === "watchtide")) {
    agent.name = `内置-${agent.name}`
  }
  const snapshot = projectRuntimeFleetCatalog(buildRuntimeContentCatalog(builtinPack, [pack]))
  return { snapshot, index: indexRuntimeFleet(snapshot), status: "ready", error: null }
}

function TestProviders({ runtimeFleet }: { runtimeFleet: RuntimeFleetContextValue }) {
  const [activeCrewId, setActiveCrewId] = React.useState<CrewId>("watchtide")
  const activeCrew = runtimeFleet.index.crewById.get(activeCrewId) ?? runtimeFleet.index.crewById.get("watchtide")!
  const theme = runtimeFleet.index.themeById.get(activeCrew.themeId)!
  const themeValue: XingchaoThemeContextValue = { activeCrewId, setActiveCrewId, theme }
  return (
    <I18nProvider>
      <RuntimeFleetContext.Provider value={runtimeFleet}>
        <XingchaoThemeContext.Provider value={themeValue}>
          <FleetHarborRoute onOpenVoyage={() => undefined} />
        </XingchaoThemeContext.Provider>
      </RuntimeFleetContext.Provider>
    </I18nProvider>
  )
}

async function renderFleet(runtimeFleet: RuntimeFleetContextValue) {
  localStorage.setItem(localeStorageKey, "zh-CN")
  const host = document.createElement("div")
  const root = createRoot(host)
  roots.push(root)
  const render = async (value: RuntimeFleetContextValue) => {
    await act(async () => root.render(<TestProviders runtimeFleet={value} />))
  }
  await render(runtimeFleet)
  return { host, rerender: render }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  localStorage.clear()
})

describe("FleetHarborRoute", () => {
  it("renders an imported six-Agent roster and removes its card with the runtime snapshot", async () => {
    const { host, rerender } = await renderFleet(runtimeContext("aurora-pack"))
    const importedCard = [...host.querySelectorAll("button")].find(
      (button) => button.dataset.crewId === "aurora-pack--watchtide",
    )

    expect(importedCard).toBeDefined()
    expect([...host.querySelectorAll("article h3")].map((heading) => heading.textContent)).not.toContain("凌越")
    await act(async () => importedCard!.click())

    expect(host.querySelectorAll('[data-agent-id^="aurora-pack--"]')).toHaveLength(6)
    for (const name of ["凌越", "沈砚", "纪澜", "温弦", "白溯", "许星衡"]) {
      expect(host.textContent).toContain(name)
    }
    expect(host.textContent).toContain("20 团 · 120 位原创 Agent")

    await rerender(builtinRuntimeFleetContext)

    expect(host.querySelector('[data-crew-id="aurora-pack--watchtide"]')).toBeNull()
    expect(host.querySelectorAll("[data-crew-id]")).toHaveLength(10)
    expect(host.textContent).toContain("10 团 · 60 位原创 Agent")
  })

  it("shows the localized fallback notice without hiding the built-in fleet", async () => {
    const fallbackContext: RuntimeFleetContextValue = {
      ...builtinRuntimeFleetContext,
      status: "fallback",
      error: "projection failed",
    }
    const { host } = await renderFleet(fallbackContext)

    const fallbackStatus = host.querySelector('[role="status"]')?.textContent
    expect(fallbackStatus).toContain("当前仅显示可信内置舰队")
    expect(fallbackStatus).not.toContain("projection failed")
    expect(host.querySelectorAll("[data-crew-id]")).toHaveLength(10)
  })
})
