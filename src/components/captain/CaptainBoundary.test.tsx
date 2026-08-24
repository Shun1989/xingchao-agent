// @vitest-environment happy-dom

import type { CaptainRendererProps } from "@/captain/captain-types.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CaptainBoundary } from "./CaptainBoundary.tsx"
import { fleetSkinAssetUrl } from "@/skins/fleet-skin-assets.ts"
import { builtinFleetSkins } from "@/skins/fleet-skins.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  vi.restoreAllMocks()
})

function Bomb({ kind }: { kind: "type" | "range" }): React.ReactNode {
  const error =
    kind === "type"
      ? new TypeError("private renderer message: credential=secret")
      : new RangeError("private renderer stack")
  throw error
}

function SafeRenderer() {
  return <div data-safe-renderer>safe renderer</div>
}

function rendererProps(onRendererEvent: CaptainRendererProps["onRendererEvent"]): CaptainRendererProps {
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
    skin: builtinFleetSkins["ink-sail"],
    mode: "companion",
    reducedMotion: false,
    onRendererEvent,
  }
}

describe("CaptainBoundary", () => {
  it("replaces only its visual slot with the current skin static fallback and a truthful static marker", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const onRendererEvent = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    roots.push(root)
    const props = rendererProps(onRendererEvent)

    await act(async () => {
      root.render(
        <section>
          <CaptainBoundary {...props}>
            <Bomb kind="type" />
          </CaptainBoundary>
          <div data-permanent-captain-ui>permanent caption and controls</div>
        </section>,
      )
    })

    const fallback = host.querySelector<HTMLElement>("[data-captain-static-fallback]")!
    expect(fallback.dataset.rendererKind).toBe("static")
    expect(fallback.dataset.layeredReady).toBe("false")
    expect(fallback.querySelector("img")?.getAttribute("src")).toBe(
      fleetSkinAssetUrl(builtinFleetSkins["ink-sail"].captain.staticFallback),
    )
    expect(fallback.querySelector("img")?.getAttribute("alt")).toBe("")
    expect(host.querySelector("[data-permanent-captain-ui]")?.textContent).toContain("permanent caption")
  })

  it("reports one closed safe error class without leaking the thrown message or stack", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const onRendererEvent = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    roots.push(root)

    await act(async () => {
      root.render(
        <CaptainBoundary {...rendererProps(onRendererEvent)}>
          <Bomb kind="range" />
        </CaptainBoundary>,
      )
    })

    expect(onRendererEvent).toHaveBeenCalledOnce()
    expect(onRendererEvent).toHaveBeenCalledWith({
      type: "renderer.error",
      renderer: "layered",
      skinId: "ink-sail",
      state: "failure",
      errorClass: "range-error",
    })
    expect(JSON.stringify(onRendererEvent.mock.calls)).not.toContain("private")
    expect(JSON.stringify(onRendererEvent.mock.calls)).not.toContain("secret")
  })

  it("stays failed for the same identity but recovers on an explicit recovery key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const onRendererEvent = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    roots.push(root)
    const props = rendererProps(onRendererEvent)

    await act(async () => {
      root.render(
        <CaptainBoundary {...props} recoveryKey={0}>
          <Bomb kind="type" />
        </CaptainBoundary>,
      )
    })
    expect(host.querySelector("[data-captain-static-fallback]")).not.toBeNull()
    expect(onRendererEvent).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(
        <CaptainBoundary {...props} recoveryKey={0}>
          <SafeRenderer />
        </CaptainBoundary>,
      )
    })
    expect(host.querySelector("[data-safe-renderer]")).toBeNull()
    expect(onRendererEvent).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(
        <CaptainBoundary {...props} recoveryKey={1}>
          <SafeRenderer />
        </CaptainBoundary>,
      )
    })
    expect(host.querySelector("[data-safe-renderer]")).not.toBeNull()

    await act(async () => {
      root.render(
        <CaptainBoundary {...props} recoveryKey={2}>
          <Bomb kind="range" />
        </CaptainBoundary>,
      )
    })
    expect(host.querySelector("[data-captain-static-fallback]")).not.toBeNull()
    expect(onRendererEvent).toHaveBeenCalledTimes(2)
  })

  it("uses a changed skin's fallback and can retry that rendering context", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const onRendererEvent = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    roots.push(root)
    const inkProps = rendererProps(onRendererEvent)
    const watchProps = { ...inkProps, skin: builtinFleetSkins.watchtide }

    await act(async () => {
      root.render(
        <CaptainBoundary {...inkProps}>
          <Bomb kind="type" />
        </CaptainBoundary>,
      )
    })
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      fleetSkinAssetUrl(builtinFleetSkins["ink-sail"].captain.staticFallback),
    )

    await act(async () => {
      root.render(
        <CaptainBoundary {...watchProps}>
          <Bomb kind="type" />
        </CaptainBoundary>,
      )
    })
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      fleetSkinAssetUrl(builtinFleetSkins.watchtide.captain.staticFallback),
    )
    expect(onRendererEvent).toHaveBeenCalledTimes(2)

    await act(async () => {
      root.render(
        <CaptainBoundary {...watchProps} recoveryKey="retry">
          <SafeRenderer />
        </CaptainBoundary>,
      )
    })
    expect(host.querySelector("[data-safe-renderer]")).not.toBeNull()
  })
})
