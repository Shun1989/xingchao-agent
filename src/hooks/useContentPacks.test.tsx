// @vitest-environment happy-dom

import type { ContentPackSummary } from "../../electron/xingchao/common.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useContentPacks } from "./useContentPacks.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface TestContentPackService {
  invoke: (method: string, request?: unknown) => Promise<unknown>
}

const testState = vi.hoisted(() => ({ service: null as TestContentPackService | null }))

vi.mock("@/components/AppContext", () => ({
  useContentPackService: () => {
    if (!testState.service) throw new Error("Test content-pack service is not configured")
    return testState.service
  },
}))

const installedPack: ContentPackSummary = {
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

const roots: Array<ReturnType<typeof createRoot>> = []

function Probe() {
  const packs = useContentPacks()
  return (
    <div>
      <span data-testid="selected">{String(packs.items[0]?.selected)}</span>
      <span data-testid="busy">
        {packs.busy ? `${packs.busy.kind}:${packs.busy.id}@${packs.busy.version}` : "idle"}
      </span>
      <span data-testid="error">{packs.error ?? ""}</span>
      <button onClick={() => void packs.select("aurora-pack", "1.0.0", true)}>select</button>
    </div>
  )
}

async function renderProbe() {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => {
    root.render(<Probe />)
  })
  return { host }
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  testState.service = null
  vi.clearAllMocks()
})

describe("useContentPacks selection", () => {
  it("selects an installed version and reloads the persisted summary", async () => {
    let selected = false
    testState.service = {
      invoke: async (method, request) => {
        if (method === "list") return [{ ...installedPack, selected }]
        if (method === "setSelection") {
          expect(request).toEqual({ id: "aurora-pack", selected: true, version: "1.0.0" })
          selected = true
          return true
        }
        throw new Error(`Unexpected method: ${method}`)
      },
    }

    const { host } = await renderProbe()
    await flush()
    expect(host.querySelector('[data-testid="selected"]')?.textContent).toBe("false")

    await act(async () => host.querySelector<HTMLButtonElement>("button")?.click())
    await flush()

    expect(host.querySelector('[data-testid="selected"]')?.textContent).toBe("true")
    expect(host.querySelector('[data-testid="busy"]')?.textContent).toBe("idle")
    expect(host.querySelector('[data-testid="error"]')?.textContent).toBe("")
  })

  it("surfaces a selection failure and always clears the busy state", async () => {
    testState.service = {
      invoke: async (method) => {
        if (method === "list") return [installedPack]
        if (method === "setSelection") throw new Error("Selection was rejected")
        throw new Error(`Unexpected method: ${method}`)
      },
    }

    const { host } = await renderProbe()
    await flush()
    await act(async () => host.querySelector<HTMLButtonElement>("button")?.click())
    await flush()

    expect(host.querySelector('[data-testid="selected"]')?.textContent).toBe("false")
    expect(host.querySelector('[data-testid="busy"]')?.textContent).toBe("idle")
    expect(host.querySelector('[data-testid="error"]')?.textContent).toBe("Selection was rejected")
  })
})
