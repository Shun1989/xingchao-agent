import { describe, expect, test } from "vitest"
import { resolveAppEntryState } from "./app-entry.ts"

describe("app entry", () => {
  test("shows recovery when either initialization source fails before the other is ready", () => {
    expect(resolveAppEntryState({ authReady: false, authFailed: true, runtimeFailed: false, runtimeReady: true })).toBe(
      "fallback",
    )
    expect(resolveAppEntryState({ authReady: false, authFailed: true, runtimeFailed: true, runtimeReady: false })).toBe(
      "fallback",
    )
    expect(resolveAppEntryState({ authReady: false, runtimeFailed: true, runtimeReady: false })).toBe("fallback")
  })

  test("keeps usable initialized state despite a later operation error", () => {
    expect(resolveAppEntryState({ authReady: true, authFailed: true, runtimeFailed: true, runtimeReady: true })).toBe(
      "app",
    )
  })
  test("enters the app once auth and runtime facts are initialized", () => {
    expect(resolveAppEntryState({ authReady: true, runtimeFailed: false, runtimeReady: true })).toBe("app")
  })

  test("waits for both initialization sources without requiring authentication", () => {
    expect(resolveAppEntryState({ authReady: false, runtimeFailed: false, runtimeReady: true })).toBe("loading")
    expect(resolveAppEntryState({ authReady: true, runtimeFailed: false, runtimeReady: false })).toBe("loading")
  })

  test("shows recovery UI when runtime capability loading fails", () => {
    expect(resolveAppEntryState({ authReady: true, runtimeFailed: true, runtimeReady: false })).toBe("fallback")
  })
})
