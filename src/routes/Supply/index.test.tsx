// @vitest-environment happy-dom

import type { ContentPackSummary } from "../../../electron/xingchao/common.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SupplyDepotRoute } from "./index.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const useContentPacksMock = vi.hoisted(() => vi.fn())

vi.mock("@/hooks/useContentPacks", () => ({ useContentPacks: useContentPacksMock }))

const builtinPack: ContentPackSummary = {
  agentCount: 60,
  crewCount: 10,
  description: "Built-in original fleet",
  id: "xingchao-original-fleet",
  installedAt: null,
  minimumAppVersion: "0.1.0",
  name: "Xingchao Original Fleet",
  removable: false,
  selected: true,
  source: "builtin",
  themeCount: 10,
  version: "1.0.0",
  visibility: "public-original",
}

const unselectedPack: ContentPackSummary = {
  agentCount: 2,
  crewCount: 1,
  description: "A private test pack",
  id: "aurora-pack",
  installedAt: 123,
  minimumAppVersion: "0.1.0",
  name: "Aurora Pack",
  removable: true,
  selected: false,
  source: "installed",
  themeCount: 1,
  version: "1.0.0",
  visibility: "private-local",
}

const selectedPack: ContentPackSummary = {
  ...unselectedPack,
  id: "harbor-pack",
  name: "Harbor Pack",
  selected: true,
  version: "2.0.0",
}

const roots: Array<ReturnType<typeof createRoot>> = []

async function renderSupply(overrides: Record<string, unknown> = {}) {
  const select = vi.fn()
  useContentPacksMock.mockReturnValue({
    busy: null,
    error: null,
    install: vi.fn(),
    items: [builtinPack, unselectedPack, selectedPack],
    loading: false,
    remove: vi.fn(),
    select,
    ...overrides,
  })

  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => {
    root.render(
      <I18nContext.Provider
        value={{ locale: "en", setLocale: () => undefined, t: (key, vars) => translate("en", key, vars) }}
      >
        <SupplyDepotRoute />
      </I18nContext.Provider>,
    )
  })
  return { host, select }
}

function buttonWithText(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(text))
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  vi.clearAllMocks()
})

describe("SupplyDepotRoute content-pack selection", () => {
  it("shows truthful runtime-selection status for built-in, selected, and unselected packs", async () => {
    const { host } = await renderSupply()

    expect(host.textContent).toContain("Always active")
    expect(host.textContent).toContain("Selected version")
    expect(host.textContent).toContain("Not selected")
    expect(host.textContent).toContain("Imported crews, routing, and themes are not active in tasks yet")
    expect(buttonWithText(host, "Select this version")).toBeDefined()
    expect(buttonWithText(host, "Stop using")).toBeDefined()
  })

  it("maps the two selection actions to the requested installed version", async () => {
    const { host, select } = await renderSupply()

    await act(async () => buttonWithText(host, "Select this version")?.click())
    expect(select).toHaveBeenCalledWith("aurora-pack", "1.0.0", true)

    await act(async () => buttonWithText(host, "Stop using")?.click())
    expect(select).toHaveBeenCalledWith("harbor-pack", "2.0.0", false)
  })

  it("disables mutations and identifies the pack whose selection is in progress", async () => {
    const { host } = await renderSupply({
      busy: { id: "aurora-pack", kind: "selection", selected: true, version: "1.0.0" },
    })

    expect(buttonWithText(host, "Selecting")?.disabled).toBe(true)
    expect(buttonWithText(host, "Stop using")?.disabled).toBe(true)
    expect(buttonWithText(host, "Import content pack")?.disabled).toBe(true)
  })
})
