// @vitest-environment happy-dom

import type { CaptainLayoutDecision } from "@/captain/captain-layout.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import { CaptainStageLayout } from "./CaptainStageLayout.tsx"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []
const decisions = {
  stage: {
    workspaceMode: "stage",
    displayMode: "stage",
    minWidth: 360,
    maxWidth: 560,
    integrated: true,
    reservesContent: false,
  },
  deck: {
    workspaceMode: "deck",
    displayMode: "companion",
    minWidth: 240,
    maxWidth: 300,
    integrated: false,
    reservesContent: true,
  },
  compact: {
    workspaceMode: "compact",
    displayMode: "compact",
    minWidth: 0,
    maxWidth: 72,
    integrated: false,
    reservesContent: false,
  },
} as const satisfies Record<string, CaptainLayoutDecision>

function renderLayout(initial: CaptainLayoutDecision) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const draw = (decision: CaptainLayoutDecision) =>
    act(() =>
      root.render(
        <CaptainStageLayout captain={<aside data-captain-host>captain</aside>} decision={decision}>
          <main>workspace</main>
        </CaptainStageLayout>,
      ),
    )
  draw(initial)
  return { container, update: draw }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe("CaptainStageLayout", () => {
  it("keeps one host and one slot while workspace modes change", () => {
    const view = renderLayout(decisions.stage)
    const host = view.container.querySelector("[data-captain-host]")
    const slot = view.container.querySelector("[data-captain-host-slot]")

    view.update(decisions.deck)
    view.update(decisions.compact)
    view.update(decisions.stage)

    expect(view.container.querySelector("[data-captain-host]")).toBe(host)
    expect(view.container.querySelector("[data-captain-host-slot]")).toBe(slot)
    expect(view.container.querySelectorAll("[data-captain-host]")).toHaveLength(1)
  })

  it("marks only stage as an integrated visual plane", () => {
    const view = renderLayout(decisions.stage)
    expect(view.container.querySelector("[data-captain-stage-layout]")?.getAttribute("data-workspace-mode")).toBe(
      "stage",
    )
    expect(view.container.querySelector("[data-captain-content]")?.getAttribute("data-captain-reserved")).toBe("false")

    view.update(decisions.deck)
    expect(view.container.querySelector("[data-captain-content]")?.getAttribute("data-captain-reserved")).toBe("true")
  })
})
