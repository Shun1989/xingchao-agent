// @vitest-environment happy-dom

import type { RuntimeFleetContextValue } from "@/components/runtime-fleet-context.ts"
import type { XingchaoThemeContextValue } from "@/components/xingchao-theme-context.ts"

import * as React from "react"
import { act } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { VoyageRoute } from "./index.tsx"
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
import { I18nContext, translate } from "@/i18n/i18n"

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
  pack.crews[0]!.name = "Aurora Watchtide"
  pack.crews[0]!.routingSignals = ["极光封签", ...pack.crews[0]!.routingSignals]
  const snapshot = projectRuntimeFleetCatalog(buildRuntimeContentCatalog(originalFleetPack, [pack]))
  return { snapshot, index: indexRuntimeFleet(snapshot), status: "ready", error: null }
}

const themeContextValue: XingchaoThemeContextValue = {
  activeCrewId: "watchtide",
  setActiveCrewId: vi.fn(),
  theme: builtinRuntimeFleetSnapshot.themes[0]!,
}

function buttonByText(host: HTMLElement, label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label))
  if (!button) throw new Error(`Missing button: ${label}`)
  return button
}

async function clickButton(host: HTMLElement, label: string) {
  await act(async () => buttonByText(host, label).click())
}

async function enterGoal(host: HTMLElement, goal: string) {
  const textarea = host.querySelector("#mission-goal") as HTMLTextAreaElement
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
  await act(async () => {
    setValue.call(textarea, goal)
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function enterGoalAndCreatePlan(host: HTMLElement, goal: string) {
  await enterGoal(host, goal)
  await clickButton(host, "推荐团队并生成航海图")
}

async function renderVoyage(
  contextValue: RuntimeFleetContextValue,
  onLaunch: React.ComponentProps<typeof VoyageRoute>["onLaunch"],
) {
  const host = document.createElement("div")
  const root = createRoot(host)
  roots.push(root)
  const renderTree = (value: RuntimeFleetContextValue) =>
    root.render(
      <I18nContext.Provider
        value={{ locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) }}
      >
        <RuntimeFleetContext.Provider value={value}>
          <XingchaoThemeContext.Provider value={themeContextValue}>
            <VoyageRoute onLaunch={onLaunch} />
          </XingchaoThemeContext.Provider>
        </RuntimeFleetContext.Provider>
      </I18nContext.Provider>,
    )
  const rerender = async (value: RuntimeFleetContextValue) => {
    await act(async () => renderTree(value))
  }
  const rerenderWithoutFlushingEffects = (value: RuntimeFleetContextValue) => {
    flushSync(() => renderTree(value))
  }
  const flushEffects = async () => {
    await act(async () => undefined)
  }
  await rerender(contextValue)
  return { host, rerender, rerenderWithoutFlushingEffects, flushEffects }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  vi.clearAllMocks()
})

describe("VoyageRoute", () => {
  it("shows a recoverable launch error instead of an unhandled rejected promise", async () => {
    const onLaunch = vi.fn().mockRejectedValue(new Error("sensitive provider diagnostics"))
    const { host } = await renderVoyage(builtinRuntimeFleetContext, onLaunch)
    await enterGoalAndCreatePlan(host, "测试任务")
    await clickButton(host, "确认并开始执行")
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("启航失败")
    expect(host.textContent).not.toContain("sensitive provider diagnostics")
    expect(buttonByText(host, "确认并开始执行").disabled).toBe(false)
  })
  it("recommends, displays, and launches an imported crew from one revision", async () => {
    const onLaunch = vi.fn().mockResolvedValue(undefined)
    const { host } = await renderVoyage(importedRuntimeFleetContext("aurora-pack"), onLaunch)

    await enterGoalAndCreatePlan(host, "请执行极光封签")

    expect(host.textContent).toContain("Aurora Watchtide")
    await clickButton(host, "确认并开始执行")
    expect(onLaunch).toHaveBeenCalledTimes(1)
    expect(onLaunch.mock.calls[0]![0].primaryCrewId).toBe("aurora-pack--watchtide")
    expect(onLaunch.mock.calls[0]![0].fleetRevision).toContain("aurora-pack@1.0.0")
  })

  it("disables a stale mission before effects and rebuilds it from the original trimmed goal", async () => {
    const onLaunch = vi.fn().mockResolvedValue(undefined)
    const view = await renderVoyage(importedRuntimeFleetContext("aurora-pack"), onLaunch)
    await enterGoalAndCreatePlan(view.host, "  请执行极光封签  ")
    await enterGoal(view.host, "不要替换已经生成的任务目标")

    view.rerenderWithoutFlushingEffects(builtinRuntimeFleetContext)
    expect(buttonByText(view.host, "确认并开始执行").disabled).toBe(true)
    await clickButton(view.host, "确认并开始执行")
    expect(onLaunch).not.toHaveBeenCalled()

    await view.flushEffects()
    expect(buttonByText(view.host, "确认并开始执行").disabled).toBe(false)
    expect(view.host.textContent).not.toContain("Aurora Watchtide")
    await clickButton(view.host, "确认并开始执行")
    expect(onLaunch).toHaveBeenCalledTimes(1)
    expect(onLaunch.mock.calls[0]![0].fleetRevision).toBe(builtinRuntimeFleetSnapshot.revision)
    expect(onLaunch.mock.calls[0]![0].primaryCrewId).not.toBe("aurora-pack--watchtide")
    expect(onLaunch.mock.calls[0]![0].goal).toBe("请执行极光封签")
  })
})
