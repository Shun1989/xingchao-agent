// @vitest-environment happy-dom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { MissionStorage } from "./MissionStorage.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), off: vi.fn() }))
vi.mock("@/components/AppContext", () => ({ useMissionRunService: () => service }))
const service = { invoke: mocks.invoke, serverEvents: { on: () => mocks.off } }
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  vi.resetAllMocks()
})
async function mount() {
  const host = document.createElement("div")
  const restored = vi.fn(async () => undefined)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <I18nContext.Provider
        value={{ locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) }}
      >
        <MissionStorage onRestored={restored} />
      </I18nContext.Provider>,
    ),
  )
  const button = (text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent === text)!
  return { host, restored, button }
}
it("offers recovery only for corrupt storage and cancel leaves history untouched", async () => {
  mocks.invoke
    .mockResolvedValueOnce({ state: "corrupt" })
    .mockResolvedValueOnce("cancelled")
    .mockResolvedValueOnce({ state: "corrupt" })
  const { host, restored, button } = await mount()
  expect(host.textContent).toContain("原文件尚未更改")
  await act(async () => button("从备份恢复").click())
  expect(restored).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain("备份已恢复")
})
it("deduplicates export clicks and renders no raw exception", async () => {
  let reject!: (error: Error) => void
  mocks.invoke
    .mockResolvedValueOnce({
      state: "ready",
      runCount: 1,
      maxRuns: 1024,
      bytes: 100,
      maxBytes: 1000,
      persistencePending: false,
    })
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
  const { host, button } = await mount()
  act(() => {
    button("导出备份").click()
    button("导出备份").click()
  })
  expect(mocks.invoke.mock.calls.filter(([method]) => method === "exportHistory")).toHaveLength(1)
  await act(async () => reject(new Error("private path and secret")))
  expect(host.textContent).toContain("操作未完成")
  expect(host.textContent).not.toContain("private path")
})
it("refreshes history only after successful recovery", async () => {
  mocks.invoke.mockResolvedValueOnce({ state: "corrupt" }).mockResolvedValueOnce("done").mockResolvedValueOnce({
    state: "ready",
    runCount: 1,
    maxRuns: 1024,
    bytes: 100,
    maxBytes: 1000,
    persistencePending: false,
  })
  const { host, restored, button } = await mount()
  await act(async () => button("从备份恢复").click())
  expect(restored).toHaveBeenCalledOnce()
  expect(host.textContent).toContain("备份已恢复")
  expect(button("导出备份")).toBeTruthy()
})
it("does not offer recovery for permission failures or export with pending writes", async () => {
  mocks.invoke.mockResolvedValueOnce({ state: "unavailable" })
  const { button } = await mount()
  expect(button("从备份恢复")).toBeUndefined()
  mocks.invoke.mockResolvedValueOnce({
    state: "ready",
    runCount: 1,
    maxRuns: 1024,
    bytes: 100,
    maxBytes: 1000,
    persistencePending: true,
  })
  await act(async () => button("刷新记录").click())
  expect(button("导出备份").disabled).toBe(true)
})
