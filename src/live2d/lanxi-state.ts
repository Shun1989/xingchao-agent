import type { CaptainEventType, CaptainReducerState, CaptainState } from "../captain/captain-types.ts"

import { captainReducer, createCaptainState } from "../captain/captain-reducer.ts"

export type LanxiState = CaptainState
export type LanxiExpression = "neutral" | "attentive" | "focused" | "warm" | "concerned" | "bright"

const eventTypeByState: Readonly<Record<LanxiState, CaptainEventType>> = Object.freeze({
  idle: "captain.idle",
  listening: "input.listening",
  thinking: "assistant.thinking",
  executing: "task.started",
  reporting: "speech.started",
  warning: "permission.required",
  success: "task.succeeded",
  failure: "task.failed",
})

export interface LanxiVisualFrame {
  state: LanxiState
  expression: LanxiExpression
  mouthOpen: number
}

/** @deprecated Use the pure captainReducer and CaptainSnapshot boundary. */
export class LanxiStateController {
  private reducerState: CaptainReducerState = createCaptainState()
  private sequence = 0

  public current(): LanxiVisualFrame {
    const snapshot = this.reducerState.snapshot
    return { state: snapshot.state, expression: snapshot.expression, mouthOpen: snapshot.mouthLevel }
  }

  public transition(state: LanxiState): LanxiVisualFrame {
    this.sequence += 1
    const mouthLevel = state === "reporting" ? this.reducerState.snapshot.mouthLevel : 0
    this.reducerState = captainReducer(this.reducerState, {
      id: "legacy-state",
      type: eventTypeByState[state],
      source: "legacy",
      taskId: "legacy-state",
      sequence: this.sequence,
      startedAt: this.sequence,
      expiresAt: null,
      captionKey: `captain.${state}`,
      captionParams: { mouthLevel },
    })
    return this.current()
  }

  public applyAudioLevel(level: number): LanxiVisualFrame {
    const normalized = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0
    if (this.reducerState.snapshot.state !== "reporting") return this.current()
    this.sequence += 1
    this.reducerState = captainReducer(this.reducerState, {
      id: "legacy-state",
      type: "speech.started",
      source: "legacy",
      taskId: "legacy-state",
      sequence: this.sequence,
      startedAt: this.sequence,
      expiresAt: null,
      captionKey: "captain.reporting",
      captionParams: { mouthLevel: normalized },
    })
    return this.current()
  }
}
