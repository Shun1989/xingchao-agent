// @vitest-environment happy-dom
import type { MissionRunSummary } from "../../../electron/xingchao/mission-common.ts"
import type { MissionHistoryState } from "@/hooks/useMissionRuns.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { MissionHistoryView } from "./MissionHistory.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const run: MissionRunSummary = {
  runId: "r1",
  missionId: "m1",
  goal: "测试任务",
  attempt: 1,
  status: "blocked",
  createdAt: 1000,
  updatedAt: 2000,
  sessionId: "s1",
  fleetRevision: "f1",
  events: [{ at: 2000, sequence: 3, type: "mission-recovery-blocked", status: "blocked", reason: "app_restarted" }],
}
let root: ReturnType<typeof createRoot> | undefined
async function mount(
  items = [run],
  options: {
    activeSessionId?: string
    fleetRevision?: string
    onRetry?: (run: MissionRunSummary) => Promise<void>
  } = {},
) {
  const onRetry = options.onRetry ?? vi.fn(async () => undefined)
  const repair = vi.fn(async () => undefined)
  const open = vi.fn()
  const history: MissionHistoryState = {
    items,
    loading: false,
    error: null,
    busy: null,
    refresh: async () => undefined,
    repair,
  }
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <I18nContext.Provider
        value={{ locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) }}
      >
        <MissionHistoryView
          history={history}
          fleetRevision={options.fleetRevision ?? "f1"}
          activeSessionId={options.activeSessionId ?? "s1"}
          onRetry={onRetry}
          onOpenSession={open}
        />
      </I18nContext.Provider>,
    ),
  )
  const click = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find((item) => item.textContent === label)
    if (!button) throw new Error(`Missing button ${label}`)
    await act(async () => button.click())
  }
  return { host, click, onRetry, repair, open }
}
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})
it("requires confirmation, cancels without sending, and guards repeated confirmation clicks", async () => {
  let resolve!: () => void
  const send = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  const { host, click } = await mount([run], { onRetry: send })
  await click("重新执行")
  expect(host.textContent).toContain("不是断点续跑")
  await click("取消")
  expect(send).not.toHaveBeenCalled()
  await click("重新执行")
  const confirm = [...host.querySelectorAll("button")].find((b) => b.textContent === "确认重新执行")!
  act(() => {
    confirm.click()
    confirm.click()
  })
  expect(send).toHaveBeenCalledExactlyOnceWith(run)
  await act(async () => resolve())
})
it.each([
  [[run, { ...run, runId: "r2", attempt: 2, status: "running" as const }], {}],
  [[run], { fleetRevision: "changed" }],
  [[run], { activeSessionId: "other" }],
  [[{ ...run, sessionId: undefined }], {}],
  [[{ ...run, status: "completed" as const }], {}],
])(
  "does not offer retry for old, stale, missing-session, wrong-session or completed attempts",
  async (items, options) => {
    const { host } = await mount(items, options)
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "重新执行" && !b.disabled)).toBe(false)
  },
)

it("orders event history by durable sequence", async () => {
  const { host } = await mount([
    {
      ...run,
      events: [
        { at: 3000, sequence: 3, type: "mission-recovery-blocked", status: "blocked", reason: "app_restarted" },
        { at: 1000, sequence: 1, type: "mission-admitted", status: "admitted" },
        { at: 2000, sequence: 2, type: "mission-started", status: "running" },
      ],
    },
  ])
  const sequences = [...host.querySelectorAll("ol li")].map((item) => item.textContent?.trim().slice(0, 2))
  expect(sequences).toEqual(["#1", "#2", "#3"])
})

it("directs a record without an original chat to replanning", async () => {
  const { host } = await mount([{ ...run, sessionId: undefined }])
  expect(host.textContent).toContain("原对话当前不可用")
  expect([...host.querySelectorAll("button")].some((button) => button.textContent === "重新执行")).toBe(false)
})
it("repairs a failed write without offering another execution and opens the original chat", async () => {
  const { click, repair, onRetry, open } = await mount([{ ...run, status: "running", persistencePending: true }])
  await click("重试保存")
  expect(repair).toHaveBeenCalledExactlyOnceWith("r1")
  expect(onRetry).not.toHaveBeenCalled()
  await click("打开原对话")
  expect(open).toHaveBeenCalledExactlyOnceWith("s1")
})
it("retains history and a generic error when execution is rejected", async () => {
  const { host, click } = await mount([run], {
    onRetry: async () => {
      throw new Error("secret-local-path")
    },
  })
  await click("重新执行")
  await click("确认重新执行")
  expect(host.querySelector('[role="alert"]')).not.toBeNull()
  expect(host.textContent).toContain("测试任务")
  expect(host.textContent).not.toContain("secret-local-path")
})
