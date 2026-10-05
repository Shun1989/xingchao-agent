import type { AppShellRoute } from "./app-shell-types.ts"

// @vitest-environment happy-dom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { useComposerSubmission } from "./use-composer-submission.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: ReturnType<typeof createRoot> | undefined
let controller: ReturnType<typeof useComposerSubmission>
type Input = Parameters<typeof useComposerSubmission>[0]

async function mount(overrides: Partial<Input> = {}) {
  const host = document.createElement("div")
  const send = vi.fn<Input["send"]>().mockResolvedValue(undefined)
  const props: Omit<Input, "setRoute"> = {
    activeChatSessionId: "original-session",
    activeComposerDraftKey: "original-session",
    currentScopeKey: "local:local",
    sessionScope: { kind: "local", workspaceId: "local", workspaceName: "Local" },
    displayedPermissionMode: "default",
    draftAgentKind: "opencode",
    messages: [],
    messagesLoaded: true,
    teamSkills: [],
    knowledgeBaseIds: [],
    createSession: async () => {
      throw new Error("Retry must not create a new session")
    },
    persistPermissionMode: async () => undefined,
    persistKnowledgeBaseIds: () => undefined,
    send,
    setIsDraftSession: () => undefined,
    setPendingChatTransition: () => undefined,
    setSelectedSessionId: () => undefined,
    setSidebarSegment: () => undefined,
    titleGeneration: {
      getAutoFallbackTitle: () => undefined,
      isAutoRefreshable: () => false,
      refreshGeneratedTitle: async () => undefined,
      rememberAutoFallbackTitle: () => undefined,
    },
    ...overrides,
  }
  function Probe() {
    const [route, setRoute] = React.useState<AppShellRoute>("voyage")
    controller = useComposerSubmission({ ...props, setRoute })
    return <div>{route}</div>
  }
  root = createRoot(host)
  await act(async () => root!.render(<Probe />))
  return { host, send }
}

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
})

it.each(["permission", "dispatch"])("keeps history mounted when Mission retry fails at %s", async (failure) => {
  const fail = async () => {
    throw new Error("synthetic failure")
  }
  const { host } = await mount(failure === "permission" ? { persistPermissionMode: fail } : { send: fail })
  await act(async () => {
    const result = await controller.sendNow({ text: "retry", missionRetryRunId: "run-1", mode: "build" })
    expect(result.status).toBe("failed")
  })
  expect(host.textContent).toBe("voyage")
  expect(controller.isSendInFlight()).toBe(false)
})

it("leaves retry navigation to the caller and sends the original session plus run id", async () => {
  const { host, send } = await mount()
  await act(async () => {
    expect(await controller.sendNow({ text: "retry", missionRetryRunId: "run-1", mode: "build" })).toEqual({
      status: "accepted",
      delivery: "sent",
    })
  })
  expect(host.textContent).toBe("voyage")
  expect(send).toHaveBeenCalledWith(
    "original-session",
    "retry",
    [],
    expect.objectContaining({ missionRetryRunId: "run-1", mode: "build" }),
  )
})

it("preserves immediate chat navigation for ordinary sends", async () => {
  const { host } = await mount()
  await act(async () => {
    await controller.sendNow({ text: "ordinary" })
  })
  expect(host.textContent).toBe("chat")
})

it.each([true, false])(
  "generates a Mission title only after successful main dispatch (success=%s)",
  async (success) => {
    const refreshGeneratedTitle = vi.fn(async () => undefined)
    const send = vi.fn<Input["send"]>().mockImplementation(async () => {
      expect(refreshGeneratedTitle).not.toHaveBeenCalled()
      if (!success) throw new Error("planning_skill_unavailable")
    })
    await mount({
      send,
      activeSession: { id: "original-session", title: "Untitled", createdAt: 1, updatedAt: 1 },
      titleGeneration: {
        getAutoFallbackTitle: () => undefined,
        isAutoRefreshable: () => true,
        refreshGeneratedTitle,
        rememberAutoFallbackTitle: () => undefined,
      },
    })
    await act(async () => {
      await controller.sendNow({ text: "retry", missionRetryRunId: "run-1" })
    })
    expect(refreshGeneratedTitle).toHaveBeenCalledTimes(success ? 1 : 0)
    expect([...controller.memory.retryOptionsBySession.current.get("original-session")!.values()][0]?.missionTurn).toBe(
      true,
    )
  },
)
