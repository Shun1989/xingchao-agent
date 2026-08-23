import type { BuiltinCrewId } from "../domain/xingchao/types.ts"
import type { ReadonlyFleetSkinManifest } from "../skins/fleet-skins.ts"

export type CaptainState =
  | "idle"
  | "listening"
  | "thinking"
  | "executing"
  | "reporting"
  | "warning"
  | "success"
  | "failure"

export type CaptainExpression = "neutral" | "attentive" | "focused" | "warm" | "concerned" | "bright"

export type CaptainEventType =
  | "captain.idle"
  | "input.listening"
  | "assistant.thinking"
  | "task.started"
  | "tool.started"
  | "speech.started"
  | "permission.required"
  | "task.warning"
  | "task.succeeded"
  | "task.failed"
  | "task.cancelled"
  | "speech.finished"
  | "speech.failed"
  | "event.dismissed"

export type CaptainEventSource = "route" | "chat" | "task" | "tool" | "permission" | "speech" | "legacy"
export const CAPTAIN_CAPTION_KEYS = Object.freeze([
  "captain.idle",
  "captain.listening",
  "captain.thinking",
  "captain.executing",
  "captain.reporting",
  "captain.success",
  "captain.warning",
  "captain.failure",
] as const)
export type CaptainCaptionKey = (typeof CAPTAIN_CAPTION_KEYS)[number]
export type CaptainCaptionPrimitive = number | boolean
export type CaptainCaptionParams = Readonly<Record<string, CaptainCaptionPrimitive>>

/**
 * A semantic input envelope. Reducers reconstruct this whitelist before storage;
 * chat text, tool output, credentials, and arbitrary renderer payloads are not event fields.
 */
export interface CaptainEvent {
  readonly id: string
  readonly epoch: number
  readonly type: CaptainEventType
  readonly source: CaptainEventSource
  readonly taskId: string | null
  readonly sequence: number
  readonly startedAt: number
  readonly expiresAt: number | null
  readonly captionKey: CaptainCaptionKey
  readonly captionParams: CaptainCaptionParams
}

export interface CaptainSnapshot {
  readonly state: CaptainState
  readonly expression: CaptainExpression
  readonly captionKey: CaptainCaptionKey
  readonly captionParams: CaptainCaptionParams
  readonly mouthLevel: number
  readonly activeEventId: string | null
  readonly taskId: string | null
}

declare const captainRetiredEventIndexBrand: unique symbol

/** Opaque, persistent string index. Public diagnostics expose only size and AVL height. */
export interface CaptainRetiredEventIndex {
  readonly size: number
  readonly height: number
  readonly [captainRetiredEventIndexBrand]: true
}

export interface CaptainReducerState {
  readonly epoch: number
  readonly activeEvents: Readonly<Record<string, CaptainEvent>>
  readonly latestSequenceByStream: Readonly<Record<string, number>>
  /** Epoch-local tombstones. Reset only after event producers for this epoch are quiescent. */
  readonly retiredEventIds: CaptainRetiredEventIndex
  readonly snapshot: CaptainSnapshot
  readonly now: number
}

export type CaptainDisplayMode = "stage" | "companion" | "compact"
export type CaptainRendererKind = "static" | "layered" | "live2d"

export type CaptainRendererEvent =
  | {
      readonly type: "renderer.ready"
      readonly renderer: CaptainRendererKind
      readonly skinId: BuiltinCrewId
      readonly state: CaptainState
    }
  | {
      readonly type: "renderer.error"
      readonly renderer: CaptainRendererKind
      readonly skinId: BuiltinCrewId
      readonly state: CaptainState
      readonly errorClass: string
    }

/** Stable boundary shared by static, first-version layered, and future Live2D renderers. */
export interface CaptainRendererProps {
  readonly snapshot: CaptainSnapshot
  readonly skin: ReadonlyFleetSkinManifest
  readonly mode: CaptainDisplayMode
  readonly reducedMotion: boolean
  readonly onRendererEvent: (event: CaptainRendererEvent) => void
}
