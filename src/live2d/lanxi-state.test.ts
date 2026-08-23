import { describe, expect, it } from "vitest"
import { LanxiStateController } from "./lanxi-state.ts"

describe("澜汐 Live2D 适配状态机", () => {
  it("保留全部八种旧状态及其表达映射", () => {
    const controller = new LanxiStateController()
    const expected = {
      idle: "neutral",
      listening: "attentive",
      thinking: "focused",
      executing: "focused",
      reporting: "warm",
      warning: "concerned",
      success: "bright",
      failure: "concerned",
    } as const

    for (const [state, expression] of Object.entries(expected)) {
      expect(controller.transition(state as keyof typeof expected)).toMatchObject({ state, expression })
    }
  })

  it("只在汇报状态驱动并约束旧口型级别", () => {
    const controller = new LanxiStateController()
    controller.transition("reporting")
    expect(controller.applyAudioLevel(1.8).mouthOpen).toBe(1)
    expect(controller.applyAudioLevel(Number.NaN).mouthOpen).toBe(0)
    controller.transition("thinking")
    expect(controller.applyAudioLevel(0.8).mouthOpen).toBe(0)
  })

  it("返回快照而不是可变内部帧", () => {
    const controller = new LanxiStateController()
    const frame = controller.transition("success")
    frame.state = "failure"
    expect(controller.current()).toMatchObject({ state: "success", expression: "bright", mouthOpen: 0 })
  })
})
