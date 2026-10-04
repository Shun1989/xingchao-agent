// @vitest-environment happy-dom

import type { FleetSkinContextValue } from "@/components/fleet-skin-context.ts"
import type { RuntimeFleetContextValue } from "@/components/runtime-fleet-context.ts"
import type { XingchaoThemeContextValue } from "@/components/xingchao-theme-context.ts"
import type { CrewId } from "@/domain/xingchao/types.ts"

import { readFileSync } from "node:fs"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FleetHarborRoute } from "./index.tsx"
import { FleetSkinContext } from "@/components/fleet-skin-context.ts"
import { RuntimeFleetContext } from "@/components/runtime-fleet-context.ts"
import { XingchaoThemeContext } from "@/components/xingchao-theme-context.ts"
import { originalFleetPack, validateContentPack } from "@/domain/xingchao/content-pack.ts"
import { buildRuntimeContentCatalog } from "@/domain/xingchao/runtime-catalog.ts"
import { indexRuntimeFleet, projectRuntimeFleetCatalog } from "@/domain/xingchao/runtime-fleet.ts"
import { localeStorageKey } from "@/i18n/i18n.ts"
import { I18nProvider } from "@/i18n/I18nProvider.tsx"
import { resolveFleetSkin } from "@/skins/fleet-skins.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const legionPack = validateContentPack(
  JSON.parse(readFileSync("content-packs/actuator-design-legion/manifest.json", "utf8")),
)
const legionCrewId = "actuator-design-legion--actuator-legion"
const snapshot = projectRuntimeFleetCatalog(buildRuntimeContentCatalog(originalFleetPack, [legionPack]))
const runtimeFleet: RuntimeFleetContextValue = {
  snapshot,
  index: indexRuntimeFleet(snapshot),
  status: "ready",
  error: null,
}
const requestedCrew = vi.fn<(crewId: CrewId) => void>()
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement | undefined

function TestProviders() {
  const [activeCrewId, setActiveCrewId] = React.useState<CrewId>("watchtide")
  const activeCrew = runtimeFleet.index.crewById.get(activeCrewId)!
  const theme = runtimeFleet.index.themeById.get(activeCrew.themeId)!
  const requestCrew = (crewId: CrewId) => {
    requestedCrew(crewId)
    if (runtimeFleet.index.crewById.has(crewId)) setActiveCrewId(crewId)
  }
  const fleetSkin: FleetSkinContextValue = {
    activeCrewId,
    skin: resolveFleetSkin(activeCrewId),
    requestCrew,
    phase: "idle",
    pendingCrewId: null,
    error: null,
    retry: () => undefined,
    preloadCrew: () => undefined,
  }
  const themeValue: XingchaoThemeContextValue = { activeCrewId, setActiveCrewId: requestCrew, theme }

  return (
    <I18nProvider>
      <RuntimeFleetContext.Provider value={runtimeFleet}>
        <FleetSkinContext.Provider value={fleetSkin}>
          <XingchaoThemeContext.Provider value={themeValue}>
            <FleetHarborRoute onOpenVoyage={() => undefined} />
          </XingchaoThemeContext.Provider>
        </FleetSkinContext.Provider>
      </RuntimeFleetContext.Provider>
    </I18nProvider>
  )
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  requestedCrew.mockClear()
  localStorage.clear()
})

describe("Actuator Design Legion in Fleet Harbor", () => {
  it("selects the real pack's six-member roster and palette while retaining all original crews", async () => {
    localStorage.setItem(localeStorageKey, "zh-CN")
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(<TestProviders />))

    expect(host.textContent).toContain("11 团 · 66 位原创 Agent")
    expect(host.textContent).toContain("内置基线：10 团 · 60 位原创 Agent")
    expect(host.querySelectorAll("[data-crew-id]")).toHaveLength(11)

    const legionCard = host.querySelector<HTMLButtonElement>(`[data-crew-id="${legionCrewId}"]`)
    expect(legionCard).not.toBeNull()
    expect(legionCard!.textContent).toContain("执行器设计军团")
    expect(legionCard!.getAttribute("aria-pressed")).toBe("false")
    expect(legionCard!.style.getPropertyValue("--crew-color")).toBe(legionPack.themes[0]!.primary)
    expect(host.querySelectorAll('[data-agent-id^="actuator-design-legion--"]')).toHaveLength(0)

    await act(async () => legionCard!.click())

    expect(requestedCrew).toHaveBeenCalledExactlyOnceWith(legionCrewId)
    expect(legionCard!.getAttribute("aria-pressed")).toBe("true")
    expect(legionCard!.classList.contains("is-active")).toBe(true)
    expect(host.querySelector('[data-crew-id="watchtide"]')?.getAttribute("aria-pressed")).toBe("false")
    expect(host.textContent).toContain("当前：精工航台")
    expect(host.querySelectorAll("[data-agent-id]")).toHaveLength(6)

    const crew = legionPack.crews[0]!
    const members = crew.memberIds.map((id) => legionPack.agents.find((agent) => agent.id === id)!)
    expect([...host.querySelectorAll("[data-agent-id]")].map((card) => card.getAttribute("data-agent-id"))).toEqual(
      members.map((member) => `${legionPack.id}--${member.id}`),
    )
    for (const member of members) {
      const card = host.querySelector(`[data-agent-id="${legionPack.id}--${member.id}"]`)!
      expect(card.querySelector("h3")?.textContent).toBe(member.name)
      expect(card.textContent).toContain(member.title)
      expect(card.textContent).toContain(member.role === "captain" ? "船长" : "船员")
    }
    for (const originalCrew of originalFleetPack.crews) {
      expect(host.querySelector(`[data-crew-id="${originalCrew.id}"]`)?.textContent).toContain(originalCrew.name)
    }
    expect(host.querySelectorAll("[data-crew-id]")).toHaveLength(11)
  })
})
