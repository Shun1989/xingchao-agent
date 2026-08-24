import type {
  CaptainCaptionKey,
  CaptainCaptionParams,
  CaptainEventSource,
  CaptainEventType,
  CaptainSnapshot,
} from "@/captain/captain-types.ts"
import type { UseCaptainSpeechResult } from "@/hooks/useCaptainSpeech.ts"

import * as React from "react"

export interface CaptainEventDraft {
  readonly id: string
  readonly type: CaptainEventType
  readonly source: CaptainEventSource
  readonly taskId: string | null
  readonly captionKey: CaptainCaptionKey
  readonly captionParams?: CaptainCaptionParams
  readonly expiresInMs?: number | null
}

export interface CaptainContextValue {
  readonly epoch: number
  readonly snapshot: CaptainSnapshot
  readonly speech: UseCaptainSpeechResult
  readonly publish: (events: readonly CaptainEventDraft[]) => void
  readonly cancelTaskSpeech: () => void
}

export const CaptainContext = React.createContext<CaptainContextValue | null>(null)

export function useCaptain(): CaptainContextValue {
  const value = React.useContext(CaptainContext)
  if (!value) throw new Error("useCaptain must be used within CaptainOrchestrator")
  return value
}
