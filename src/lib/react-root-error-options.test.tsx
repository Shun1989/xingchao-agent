// @vitest-environment happy-dom

import type { CaptainRendererProps } from "@/captain/captain-types.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { classifyRendererError, safeReactRootOptions } from "./react-root-error-options.ts"
import { CaptainBoundary } from "@/components/captain/CaptainBoundary.tsx"
import { builtinFleetSkins } from "@/skins/fleet-skins.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []

function SecretBomb(): React.ReactNode {
  throw new TypeError("credential=secret")
}

function props(onRendererEvent: CaptainRendererProps["onRendererEvent"]): CaptainRendererProps {
  return {
    snapshot: {
      state: "failure",
      expression: "concerned",
      captionKey: "captain.failure",
      captionParams: Object.freeze({}),
      mouthLevel: 0,
      activeEventId: null,
      taskId: null,
    },
    skin: builtinFleetSkins.watchtide,
    mode: "stage",
    reducedMotion: false,
    onRendererEvent,
  }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  vi.restoreAllMocks()
  delete (globalThis as { wanta?: unknown }).wanta
})

describe("safeReactRootOptions", () => {
  it("fails closed when hostile prototype and message accessors throw", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const reportRendererError = vi.fn()
    Object.assign(globalThis, { wanta: { reportRendererError } })
    const hostilePrototype = new Proxy(Object.create(null), {
      getPrototypeOf() {
        throw new Error("prototype-secret")
      },
    })
    const hostileAccessors = Object.create(null) as Record<string, unknown>
    Object.defineProperties(hostileAccessors, {
      message: {
        get() {
          throw new Error("message-secret")
        },
      },
      stack: {
        get() {
          throw new Error("stack-secret")
        },
      },
    })
    const options = safeReactRootOptions()

    expect(classifyRendererError(hostilePrototype)).toBe("render-error")
    expect(() => options.onCaughtError?.(hostilePrototype, { componentStack: "component-secret" })).not.toThrow()
    expect(() => options.onCaughtError?.(hostileAccessors, { componentStack: "component-secret" })).not.toThrow()
    expect(consoleError).not.toHaveBeenCalled()
    expect(reportRendererError).toHaveBeenCalledTimes(2)
    expect(reportRendererError).toHaveBeenNthCalledWith(1, {
      source: "error",
      scope: "react.caught",
      message: "react renderer caught error: render-error",
    })
    expect(reportRendererError).toHaveBeenNthCalledWith(2, {
      source: "error",
      scope: "react.caught",
      message: "react renderer caught error: render-error",
    })
    expect(JSON.stringify(reportRendererError.mock.calls)).not.toMatch(/prototype-secret|message-secret|stack-secret/)
  })

  it("suppresses React 19 raw caught-error output and reports only a closed safe cause", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const reportRendererError = vi.fn()
    Object.assign(globalThis, { wanta: { reportRendererError } })
    const onRendererEvent = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host, safeReactRootOptions())
    roots.push(root)

    await act(async () => {
      root.render(
        <CaptainBoundary {...props(onRendererEvent)}>
          <SecretBomb />
        </CaptainBoundary>,
      )
    })

    expect(host.querySelector("[data-captain-static-fallback]")).not.toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    expect(reportRendererError).toHaveBeenCalledOnce()
    expect(reportRendererError).toHaveBeenCalledWith({
      source: "error",
      scope: "react.caught",
      message: "react renderer caught error: type-error",
    })
    const serializedReports = JSON.stringify(reportRendererError.mock.calls)
    expect(serializedReports).not.toContain("credential")
    expect(serializedReports).not.toContain("secret")
    expect(serializedReports).not.toContain("stack")
  })

  it("contains diagnostic bridge failures instead of creating a second root error", () => {
    Object.assign(globalThis, {
      wanta: {
        reportRendererError: () => {
          throw new Error("bridge secret")
        },
      },
    })
    const options = safeReactRootOptions()

    expect(() => options.onCaughtError?.(new RangeError("private"), { componentStack: "private stack" })).not.toThrow()
  })
})
