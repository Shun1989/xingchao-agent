// @vitest-environment happy-dom

import type { FleetSkinContextValue } from "@/components/fleet-skin-context.ts"
import type { RuntimeFleetContextValue } from "@/components/runtime-fleet-context.ts"
import type { XingchaoThemeContextValue } from "@/components/xingchao-theme-context.ts"
import type { CrewId } from "@/domain/xingchao/types.ts"
import type { Mock } from "vitest"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FleetHarborRoute } from "./index.tsx"
import { FleetSkinContext } from "@/components/fleet-skin-context.ts"
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
import { resolveFleetSkin } from "@/skins/fleet-skins.ts"

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

interface FleetActions {
  requestCrew: Mock
  preloadCrew: Mock
  retry: Mock
}

function TestProviders({
  runtimeFleet,
  actions,
  pendingCrewId = null,
  error = null,
}: {
  runtimeFleet: RuntimeFleetContextValue
  actions: FleetActions
  pendingCrewId?: CrewId | null
  error?: string | null
}) {
  const [activeCrewId, setActiveCrewId] = React.useState<CrewId>("watchtide")
  const activeCrew = runtimeFleet.index.crewById.get(activeCrewId) ?? runtimeFleet.index.crewById.get("watchtide")!
  const theme = runtimeFleet.index.themeById.get(activeCrew.themeId)!
  const themeValue: XingchaoThemeContextValue = { activeCrewId, setActiveCrewId, theme }
  const fleetSkinValue: FleetSkinContextValue = {
    activeCrewId,
    skin: resolveFleetSkin(activeCrewId),
    requestCrew: (crewId) => {
      actions.requestCrew(crewId)
      if (runtimeFleet.index.crewById.has(crewId)) setActiveCrewId(crewId)
    },
    phase: pendingCrewId ? "loading" : error ? "error" : "idle",
    pendingCrewId,
    error,
    retry: actions.retry,
    preloadCrew: actions.preloadCrew,
  }
  return (
    <I18nProvider>
      <RuntimeFleetContext.Provider value={runtimeFleet}>
        <FleetSkinContext.Provider value={fleetSkinValue}>
          <XingchaoThemeContext.Provider value={themeValue}>
            <FleetHarborRoute onOpenVoyage={() => undefined} />
          </XingchaoThemeContext.Provider>
        </FleetSkinContext.Provider>
      </RuntimeFleetContext.Provider>
    </I18nProvider>
  )
}

async function renderFleet(
  runtimeFleet: RuntimeFleetContextValue,
  options: { pendingCrewId?: CrewId | null; error?: string | null } = {},
) {
  const actions: FleetActions = { requestCrew: vi.fn(), preloadCrew: vi.fn(), retry: vi.fn() }
  localStorage.setItem(localeStorageKey, "zh-CN")
  const host = document.createElement("div")
  const root = createRoot(host)
  roots.push(root)
  const render = async (value: RuntimeFleetContextValue) => {
    await act(async () => root.render(<TestProviders runtimeFleet={value} actions={actions} {...options} />))
  }
  await render(runtimeFleet)
  return { host, rerender: render, actions }
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

  it("preloads built-in cards on hover and focus, requests selection, and reserves the global captain stage", async () => {
    const { host, actions } = await renderFleet(builtinRuntimeFleetContext)
    const inkCard = host.querySelector('[data-crew-id="ink-sail"]') as HTMLButtonElement

    await act(async () => {
      inkCard.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }))
      inkCard.focus()
      inkCard.click()
    })

    expect(actions.preloadCrew).toHaveBeenCalledWith("ink-sail")
    expect(actions.requestCrew).toHaveBeenCalledWith("ink-sail")
    expect(host.querySelector("[data-captain-host-slot]")).not.toBeNull()
    expect(host.querySelector("[data-lanxi-state]")).toBeNull()
  })

  it("marks only the pending card and keeps the retryable rollback error beside the selector", async () => {
    const { host, actions } = await renderFleet(builtinRuntimeFleetContext, {
      pendingCrewId: "ink-sail",
      error: "皮肤资源加载失败，已保留当前舰队。请重试。",
    })

    expect(host.querySelector('[data-crew-id="ink-sail"]')?.textContent).toContain("切换中")
    expect(host.querySelector('[data-crew-id="watchtide"]')?.textContent).not.toContain("切换中")
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("皮肤资源加载失败")

    const retryButton = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("重试"))
    await act(async () => retryButton!.click())
    expect(actions.retry).toHaveBeenCalledOnce()
  })
})
