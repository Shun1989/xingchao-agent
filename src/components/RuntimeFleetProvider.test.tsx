// @vitest-environment happy-dom

import type { RuntimeFleetSnapshot } from "@/domain/xingchao/runtime-fleet.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useRuntimeFleet } from "./runtime-fleet-context.ts"
import { RuntimeFleetProvider } from "./RuntimeFleetProvider.tsx"
import { originalFleetPack } from "@/domain/xingchao/content-pack.ts"
import { buildRuntimeContentCatalog } from "@/domain/xingchao/runtime-catalog.ts"
import { builtinRuntimeFleetSnapshot, projectRuntimeFleetCatalog } from "@/domain/xingchao/runtime-fleet.ts"
import { I18nProvider } from "@/i18n/I18nProvider.tsx"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface TestContentPackService {
  invoke: (method: string) => Promise<RuntimeFleetSnapshot>
  serverEvents: { on: (event: string, listener: () => void) => () => void }
}

const testState = vi.hoisted(() => ({ service: null as TestContentPackService | null }))

vi.mock("@/components/AppContext", () => ({
  useContentPackService: () => {
    if (!testState.service) throw new Error("Test content-pack service is not configured")
    return testState.service
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

function importedSnapshot(packId: string): RuntimeFleetSnapshot {
  const pack = structuredClone({ ...originalFleetPack, id: packId, visibility: "private-local" as const })
  return projectRuntimeFleetCatalog(buildRuntimeContentCatalog(originalFleetPack, [pack]))
}

function Probe() {
  const { error, snapshot, status } = useRuntimeFleet()
  return <div>{`${status}:${snapshot.revision}:${snapshot.crews.length}:${error ?? ""}`}</div>
}

const roots: Array<ReturnType<typeof createRoot>> = []

async function renderProviderProbe(responses: Promise<RuntimeFleetSnapshot>[]) {
  let call = 0
  let changed: () => void = () => undefined
  let unsubscribeCalls = 0
  testState.service = {
    invoke: async (method: string) => {
      if (method !== "runtimeFleet") throw new Error(`Unexpected method: ${method}`)
      return responses[call++]!
    },
    serverEvents: {
      on: (event: string, listener: () => void) => {
        if (event !== "contentPacksChanged") throw new Error(`Unexpected event: ${event}`)
        changed = listener
        return () => {
          unsubscribeCalls += 1
        }
      },
    },
  }
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () =>
    root.render(
      <I18nProvider>
        <RuntimeFleetProvider>
          <Probe />
        </RuntimeFleetProvider>
      </I18nProvider>,
    ),
  )
  return {
    host,
    emitChanged: (_event: unknown) => act(async () => changed()),
    unsubscribeCalls: () => unsubscribeCalls,
    unmount: () =>
      act(async () => {
        root.unmount()
        roots.splice(roots.indexOf(root), 1)
      }),
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
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

describe("RuntimeFleetProvider", () => {
  it("starts built-in, adopts the service snapshot, and refreshes on a change event", async () => {
    const first = deferred<RuntimeFleetSnapshot>()
    const second = deferred<RuntimeFleetSnapshot>()
    const { host, emitChanged } = await renderProviderProbe([first.promise, second.promise])
    expect(host.textContent).toBe(`loading:${builtinRuntimeFleetSnapshot.revision}:10:`)

    first.resolve(importedSnapshot("aurora-pack"))
    await flush()
    expect(host.textContent).toContain("ready:")
    expect(host.textContent).toContain("aurora-pack@1.0.0")

    await emitChanged({ reason: "selection-changed" })
    expect(host.textContent).toBe(`loading:${builtinRuntimeFleetSnapshot.revision}:10:`)
    second.resolve(importedSnapshot("harbor-pack"))
    await flush()
    expect(host.textContent).toContain("ready:")
    expect(host.textContent).toContain("harbor-pack@1.0.0")
  })

  it("ignores an older response that resolves after the newest generation", async () => {
    const first = deferred<RuntimeFleetSnapshot>()
    const second = deferred<RuntimeFleetSnapshot>()
    const { host, emitChanged } = await renderProviderProbe([first.promise, second.promise])
    await emitChanged({ reason: "selection-changed" })
    second.resolve(importedSnapshot("harbor-pack"))
    await flush()
    expect(host.textContent).toContain("harbor-pack@1.0.0")
    first.resolve(importedSnapshot("aurora-pack"))
    await flush()
    expect(host.textContent).toContain("harbor-pack@1.0.0")
    expect(host.textContent).not.toContain("aurora-pack@1.0.0")
  })

  it("falls back to built-in and exposes a localized non-blocking error", async () => {
    const failed = deferred<RuntimeFleetSnapshot>()
    const { host } = await renderProviderProbe([failed.promise])
    failed.reject(new Error("projection failed"))
    await flush()
    expect(host.textContent).toContain(`fallback:${builtinRuntimeFleetSnapshot.revision}:10:`)
    expect(host.textContent).toContain("projection failed")
  })

  it("fails closed when snapshot integrity validation rejects", async () => {
    const invalid = structuredClone(builtinRuntimeFleetSnapshot)
    invalid.crews[0]!.captainId = "missing-agent"
    const { host } = await renderProviderProbe([Promise.resolve(invalid)])
    await flush()
    expect(host.textContent).toContain(`fallback:${builtinRuntimeFleetSnapshot.revision}:10:`)
    expect(host.textContent).toContain("missing-agent")
  })

  it("ignores completion after unmount", async () => {
    const pending = deferred<RuntimeFleetSnapshot>()
    const { host, unmount } = await renderProviderProbe([pending.promise])
    await unmount()
    pending.resolve(importedSnapshot("aurora-pack"))
    await flush()
    expect(host.textContent).toBe("")
  })

  it("unsubscribes from content-pack changes when unmounted", async () => {
    const pending = deferred<RuntimeFleetSnapshot>()
    const { host, unsubscribeCalls, unmount } = await renderProviderProbe([pending.promise])
    expect(host.textContent).toBe(`loading:${builtinRuntimeFleetSnapshot.revision}:10:`)
    expect(unsubscribeCalls()).toBe(0)

    await unmount()

    expect(host.textContent).toBe("")
    expect(unsubscribeCalls()).toBe(1)
  })
})
