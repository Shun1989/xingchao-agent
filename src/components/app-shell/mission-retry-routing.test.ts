import { expect, it } from "vitest"
import { routeMissionRetry } from "./mission-retry-routing.ts"

it("routes a Mission turn, including a legacy record, to history without executing", async () => {
  let execution = 0
  const context = {
    list: async () => [{ sessionId: "s1", userMessageId: "u1" }],
    openHistory: () => {
      execution += 10
    },
  }
  if (!(await routeMissionRetry(context, "s1", "u1"))) execution++
  expect(execution).toBe(10)
  if (!(await routeMissionRetry(context, "s1", "ordinary-message"))) execution++
  expect(execution).toBe(11)
  expect(
    await routeMissionRetry({ ...context, list: async () => [{ sessionId: "legacy" }] }, "legacy", "unknown"),
  ).toBe(true)
  expect(await routeMissionRetry(context, "other-session", "u1")).toBe(false)
})
it("does not silently fall back to untracked execution if history cannot be read", async () => {
  await expect(
    routeMissionRetry(
      {
        list: async () => {
          throw new Error("unreadable")
        },
        openHistory: () => undefined,
      },
      "s1",
      "u1",
    ),
  ).rejects.toThrow()
})
