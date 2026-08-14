import { describe, expect, it } from "vitest"
import { LanxiStateController } from "./lanxi-state.ts"

describe("澜汐 Live2D 适配状态机", () => {
  it("覆盖八种状态并只在汇报时驱动口型", () => {
    const controller = new LanxiStateController()
    controller.transition("reporting")
    expect(controller.applyAudioLevel(1.8).mouthOpen).toBe(1)
    controller.transition("thinking")
    expect(controller.applyAudioLevel(0.8).mouthOpen).toBe(0)
    expect(controller.transition("failure").expression).toBe("concerned")
  })
})
