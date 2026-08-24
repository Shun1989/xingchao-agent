// @vitest-environment happy-dom

import type { CaptainRendererProps, CaptainSnapshot, CaptainState } from "@/captain/captain-types.ts"
import type { Mock } from "vitest"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LayeredCaptainRenderer } from "./LayeredCaptainRenderer.tsx"
import { fleetSkinAssetUrl } from "@/skins/fleet-skin-assets.ts"
import { builtinFleetSkins } from "@/skins/fleet-skins.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const motionPreference = vi.hoisted(() => ({ reduced: false }))
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>()
  return { ...actual, useReducedMotion: () => motionPreference.reduced }
})

const roots: Array<ReturnType<typeof createRoot>> = []
const skin = builtinFleetSkins.watchtide

function snapshot(state: CaptainState): CaptainSnapshot {
  const expressionByState = {
    idle: "neutral",
    listening: "attentive",
    thinking: "focused",
    executing: "focused",
    reporting: "warm",
    warning: "concerned",
    success: "bright",
    failure: "concerned",
  } as const
  return {
    state,
    expression: expressionByState[state],
    captionKey: `captain.${state}`,
    captionParams: Object.freeze({}),
    mouthLevel: state === "reporting" ? 0.75 : 0,
    activeEventId: null,
    taskId: null,
  }
}

async function renderCaptain(
  state: CaptainState = "idle",
  options: {
    mode?: "stage" | "companion" | "compact"
    reducedMotion?: boolean
    onEvent?: Mock<CaptainRendererProps["onRendererEvent"]>
  } = {},
) {
  const host = document.createElement("div")
  const root = createRoot(host)
  roots.push(root)
  const onEvent = options.onEvent ?? vi.fn<CaptainRendererProps["onRendererEvent"]>()
  const render = async (nextState: CaptainState) => {
    await act(async () => {
      root.render(
        <LayeredCaptainRenderer
          snapshot={snapshot(nextState)}
          skin={skin}
          mode={options.mode ?? "stage"}
          reducedMotion={options.reducedMotion ?? false}
          onRendererEvent={onEvent}
        />,
      )
    })
  }
  await render(state)
  return { host, onEvent, render }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  motionPreference.reduced = false
})

describe("LayeredCaptainRenderer", () => {
  it("renders the fixed scene-to-foreground stack from the current manifest registry", async () => {
    const { host } = await renderCaptain("idle")
    const layers = [...host.querySelectorAll<HTMLElement>("[data-captain-layer]")]

    expect(layers.map((layer) => layer.dataset.captainLayer)).toEqual([
      "scene",
      "base",
      "uniform",
      "expression-light",
      "foreground",
    ])
    expect(layers[0].querySelector("img")?.getAttribute("src")).toBe(fleetSkinAssetUrl(skin.scene.backdrop))
    expect(layers[1].querySelector("img")?.getAttribute("src")).toBe(fleetSkinAssetUrl("watchtide.captain.base"))
    expect(layers[2].querySelector("img")?.getAttribute("src")).toBe(fleetSkinAssetUrl("watchtide.captain.uniform"))
    expect(layers[4].querySelector("img")?.getAttribute("src")).toBe(fleetSkinAssetUrl(skin.scene.foreground))
    for (const layer of layers) {
      expect(layer.getAttribute("aria-hidden")).toBe("true")
      expect(layer.querySelector("img")?.getAttribute("alt") ?? "").toBe("")
    }
  })

  it("keeps base and full-uniform presentations mutually exclusive in stable frames", async () => {
    const quiet = await renderCaptain("thinking")
    expect(quiet.host.querySelector('[data-captain-layer="base"]')?.getAttribute("data-visible")).toBe("true")
    expect(quiet.host.querySelector('[data-captain-layer="uniform"]')?.getAttribute("data-visible")).toBe("false")

    await quiet.render("executing")
    expect(quiet.host.querySelector('[data-captain-layer="base"]')?.getAttribute("data-visible")).toBe("false")
    expect(quiet.host.querySelector('[data-captain-layer="uniform"]')?.getAttribute("data-visible")).toBe("true")
    expect(quiet.host.querySelectorAll('[data-captain-presentation][data-visible="true"]')).toHaveLength(1)
  })

  it.each([
    ["idle", "neutral"],
    ["listening", "attentive"],
    ["thinking", "focused"],
    ["executing", "focused"],
    ["reporting", "warm"],
    ["warning", "concerned"],
    ["success", "bright"],
    ["failure", "concerned"],
  ] as const)("exposes the %s semantic state and %s expression", async (state, expression) => {
    const { host } = await renderCaptain(state)
    const renderer = host.querySelector("[data-captain-renderer]")
    expect(renderer?.getAttribute("data-captain-state")).toBe(state)
    expect(renderer?.getAttribute("data-captain-expression")).toBe(expression)
    expect(renderer?.getAttribute("data-skin-id")).toBe("watchtide")
  })

  it.each([
    ["stage", "36", "36%", "58% 42%", "right", "bottom-left"],
    ["companion", "280", "280px", "52% 40%", "right", "left"],
    ["compact", "56", "56px", "50% 38%", "center", "outside"],
  ] as const)(
    "commits %s composition metadata from the manifest",
    async (mode, size, width, focal, alignment, caption) => {
      const { host } = await renderCaptain("idle", { mode })
      const renderer = host.querySelector<HTMLElement>("[data-captain-renderer]")!
      expect(renderer.dataset.captainMode).toBe(mode)
      expect(renderer.dataset.compositionSize).toBe(size)
      expect(renderer.style.getPropertyValue("--captain-composition-width")).toBe(width)
      expect(renderer.dataset.focalPosition).toBe(focal)
      expect(renderer.dataset.alignment).toBe(alignment)
      expect(renderer.dataset.safeCaptionPosition).toBe(caption)
    },
  )

  it("uses bounded deterministic reporting mouth cadence and forces other states closed", async () => {
    const reporting = await renderCaptain("reporting")
    const mouth = reporting.host.querySelector<HTMLElement>("[data-captain-mouth]")!
    expect(mouth.dataset.mouthCadence).toBe("clock")
    expect(mouth.style.getPropertyValue("--captain-mouth-level")).toBe("0.75")

    await reporting.render("success")
    expect(reporting.host.querySelector<HTMLElement>("[data-captain-mouth]")!.dataset.mouthCadence).toBe("off")
    expect(
      reporting.host
        .querySelector<HTMLElement>("[data-captain-mouth]")!
        .style.getPropertyValue("--captain-mouth-level"),
    ).toBe("0")
  })

  it("removes motion, transitions, and parallax transforms when reduced motion is requested", async () => {
    const { host } = await renderCaptain("reporting", { reducedMotion: true })
    const renderer = host.querySelector<HTMLElement>("[data-captain-renderer]")!
    expect(renderer.dataset.reducedMotion).toBe("true")
    expect(renderer.style.getPropertyValue("--captain-parallax-px")).toBe("0px")
    expect(host.querySelectorAll('[data-motion-enabled="true"]')).toHaveLength(0)
    expect(renderer.innerHTML).not.toMatch(/animation|transition|translate|transform/i)
  })

  it("treats the operating-system reduced-motion preference as authoritative", async () => {
    motionPreference.reduced = true
    const { host } = await renderCaptain("reporting", { reducedMotion: false })
    const renderer = host.querySelector<HTMLElement>("[data-captain-renderer]")!

    expect(renderer.dataset.reducedMotion).toBe("true")
    expect(renderer.style.getPropertyValue("--captain-parallax-px")).toBe("0px")
    expect(host.querySelectorAll('[data-motion-enabled="true"]')).toHaveLength(0)
    expect(host.querySelector<HTMLElement>("[data-captain-mouth]")!.dataset.mouthCadence).toBe("off")
    expect(renderer.innerHTML).not.toMatch(/animation|transition|translate|transform/i)
  })

  it("caps parallax at the manifest value and reports ready once per skin-state signature", async () => {
    const onEvent = vi.fn()
    const { host, render } = await renderCaptain("idle", { onEvent })
    const renderer = host.querySelector<HTMLElement>("[data-captain-renderer]")!
    expect(renderer.style.getPropertyValue("--captain-parallax-px")).toBe("18px")
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "renderer.ready",
      renderer: "layered",
      skinId: "watchtide",
      state: "idle",
    })

    await render("idle")
    expect(onEvent).toHaveBeenCalledTimes(1)
    await render("reporting")
    expect(onEvent).toHaveBeenCalledTimes(2)
    await render("idle")
    expect(onEvent).toHaveBeenCalledTimes(2)
  })
})
