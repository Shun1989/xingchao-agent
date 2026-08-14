export type LanxiState =
  | "idle"
  | "listening"
  | "thinking"
  | "executing"
  | "reporting"
  | "warning"
  | "success"
  | "failure"
export type LanxiExpression = "neutral" | "attentive" | "focused" | "warm" | "concerned" | "bright"

const expressionByState: Record<LanxiState, LanxiExpression> = {
  idle: "neutral",
  listening: "attentive",
  thinking: "focused",
  executing: "focused",
  reporting: "warm",
  warning: "concerned",
  success: "bright",
  failure: "concerned",
}

export interface LanxiVisualFrame {
  state: LanxiState
  expression: LanxiExpression
  mouthOpen: number
}

export class LanxiStateController {
  private frame: LanxiVisualFrame = { state: "idle", expression: "neutral", mouthOpen: 0 }

  public current(): LanxiVisualFrame {
    return { ...this.frame }
  }

  public transition(state: LanxiState): LanxiVisualFrame {
    this.frame = {
      state,
      expression: expressionByState[state],
      mouthOpen: state === "reporting" ? this.frame.mouthOpen : 0,
    }
    return this.current()
  }

  public applyAudioLevel(level: number): LanxiVisualFrame {
    const normalized = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0
    this.frame = { ...this.frame, mouthOpen: this.frame.state === "reporting" ? normalized : 0 }
    return this.current()
  }
}
