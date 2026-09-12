// @vitest-environment happy-dom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { useMissionRuns } from "./useMissionRuns.ts"

const state = vi.hoisted(() => ({ invoke: vi.fn(), listener: null as (() => void) | null }))
vi.mock("@/components/AppContext", () => ({ useMissionRunService: () => service }))
const service = {
  invoke: state.invoke,
  serverEvents: {
    on: (_name: string, fn: () => void) => {
      state.listener = fn
      return () => {
        state.listener = null
      }
    },
  },
}
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: ReturnType<typeof createRoot> | undefined
let history: ReturnType<typeof useMissionRuns>
function Probe() {
  history = useMissionRuns()
  return (
    <div>
      {history.items.map((run) => run.goal).join(",")}|{history.error}|{String(history.loading)}
    </div>
  )
}
async function mount() {
  const host = document.createElement("div")
  root = createRoot(host)
  await act(async () => root!.render(<Probe />))
  return host
}
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  vi.resetAllMocks()
})
it("keeps the newer event refresh when the initial request resolves late and unsubscribes", async () => {
  let resolveOld!: (value: unknown) => void
  state.invoke
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    .mockResolvedValueOnce([{ runId: "new", goal: "new" }])
  const host = await mount()
  await act(async () => state.listener!())
  await act(async () => resolveOld([{ runId: "old", goal: "old" }]))
  expect(host.textContent).toContain("new")
  expect(host.textContent).not.toContain("old")
  act(() => root!.unmount())
  root = undefined
  expect(state.listener).toBeNull()
})
it("ignores a list response that arrives after unmount", async () => {
  let resolve!: (value: unknown) => void
  state.invoke.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await mount()
  act(() => root!.unmount())
  root = undefined
  await act(async () => resolve([{ runId: "late", goal: "late" }]))
  expect(state.listener).toBeNull()
})
it("refreshes when the main process reports a changed run", async () => {
  state.invoke.mockResolvedValueOnce([]).mockResolvedValueOnce([{ runId: "event", goal: "event refresh" }])
  const host = await mount()
  await act(async () => state.listener!())
  expect(host.textContent).toContain("event refresh")
})
it("shows a safe read failure and recovers on explicit refresh", async () => {
  state.invoke
    .mockRejectedValueOnce(new Error("secret path"))
    .mockResolvedValueOnce([{ runId: "restored", goal: "restored" }])
  const host = await mount()
  expect(history.error).toBe("read")
  expect(host.textContent).not.toContain("secret path")
  await act(async () => history.refresh())
  expect(history.error).toBeNull()
  expect(host.textContent).toContain("restored")
})
it("deduplicates repair and surfaces its failure without dispatching a new execution", async () => {
  let rejectSave!: (reason: Error) => void
  state.invoke.mockResolvedValueOnce([]).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject
      }),
  )
  await mount()
  let first!: Promise<void>
  act(() => {
    first = history.repair("run-1")
    void history.repair("run-1")
  })
  expect(state.invoke.mock.calls.filter(([method]) => method === "retrySettlement")).toEqual([
    ["retrySettlement", "run-1"],
  ])
  await act(async () => {
    rejectSave(new Error("private disk path"))
    await first
  })
  expect(history.error).toBe("save")
  expect(history.busy).toBeNull()
  state.invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce([])
  await act(async () => history.repair("run-1"))
  expect(history.error).toBeNull()
})
