import type { Mission } from "../../src/domain/xingchao/types.ts"

import { serviceName } from "../branding.ts"
import { defineService } from "../ipc/connection.ts"

export type MissionRunStatus = "admitted" | "running" | "blocked" | "completed" | "failed" | "cancelled"

export type MissionRunEventType =
  | "mission-admitted"
  | "mission-started"
  | "mission-completed"
  | "mission-failed"
  | "mission-cancelled"
  | "mission-recovery-blocked"

export type MissionRunReason =
  | "message_completed"
  | "send_failed"
  | "send_rejected"
  | "dispatch_not_direct"
  | "agent_error"
  | "system_interrupted"
  | "user_stopped"
  | "app_restarted"

export interface MissionRunEvent {
  userMessageId?: string
  generationId?: string
  at: number
  reason?: MissionRunReason
  sequence: number
  sessionId?: string
  status: MissionRunStatus
  type: MissionRunEventType
}

export interface MissionRunSummary {
  userMessageId?: string
  persistencePending?: boolean
  attempt: number
  createdAt: number
  events: MissionRunEvent[]
  fleetRevision: string
  goal: string
  missionId: string
  runId: string
  sessionId?: string
  status: MissionRunStatus
  updatedAt: number
}

export interface AdmitMissionRunRequest {
  mission: Mission
}

export interface StartMissionRunRequest {
  userMessageId?: string
  generationId: string
  runId: string
  sessionId: string
}

export interface FailMissionDispatchRequest {
  reason: "send_failed" | "send_rejected" | "dispatch_not_direct"
  runId: string
}

export interface MissionRunChangedEvent {
  persistencePending?: boolean
  runId: string
  status: MissionRunStatus
}

export type MissionStorageStatus =
  | { state: "ready"; runCount: number; maxRuns: number; bytes: number; maxBytes: number; persistencePending: boolean }
  | { state: "corrupt" | "unavailable" }

export type MissionFileResult = "done" | "cancelled"

export type MissionRunService = typeof MissionRunService
export const MissionRunService = defineService<{
  ServerEvents: {
    missionRunChanged: MissionRunChangedEvent
  }
  ClientInvokes: {
    list(): Promise<MissionRunSummary[]>
    retrySettlement(runId: string): Promise<void>
    storageStatus(): Promise<MissionStorageStatus>
    exportHistory(): Promise<MissionFileResult>
    restoreHistory(): Promise<MissionFileResult>
  }
}>(serviceName("mission-run-service"), {
  list: true,
  retrySettlement: true,
  storageStatus: true,
  exportHistory: true,
  restoreHistory: true,
})
