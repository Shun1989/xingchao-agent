import { serviceName } from "../branding.ts"
import { defineService } from "../ipc/connection.ts"

export interface AttentionState {
  unreadSessionIds: string[]
  unreadTeamIds: string[]
}

export interface VisibleSessionRequest {
  sessionId?: string
  visible: boolean
}

export interface OpenAttentionSessionEvent {
  teamId?: string
  sessionId: string
}

export type NotificationCapabilityPlatform = "darwin" | "other" | "win32"

export type NotificationCapabilityStatus = "development-unavailable" | "testable" | "unsupported"

export interface NotificationCapability {
  canOpenSystemSettings: boolean
  platform: NotificationCapabilityPlatform
  status: NotificationCapabilityStatus
}

export type NotificationTestOutcome = "accepted" | "delivered" | "failed" | "timed-out" | "unsupported"

export interface NotificationTestResult {
  error?: string
  foundInHistory?: boolean
  notificationId?: string
  outcome: NotificationTestOutcome
  windowFocused?: boolean
}

export type AttentionService = typeof AttentionService
export const AttentionService = defineService<{
  ServerEvents: {
    attentionStateChanged: AttentionState
    openSessionRequested: OpenAttentionSessionEvent
  }
  ClientInvokes: {
    getAttentionState(): Promise<AttentionState>
    getNotificationCapability(): Promise<NotificationCapability>
    markSessionViewed(sessionId: string): Promise<void>
    openSystemNotificationSettings(): Promise<void>
    setVisibleSession(req: VisibleSessionRequest): Promise<void>
    testCompletionNotification(): Promise<NotificationTestResult>
  }
}>(serviceName("attention-service"), {
  getAttentionState: true,
  getNotificationCapability: true,
  markSessionViewed: true,
  openSystemNotificationSettings: true,
  setVisibleSession: true,
  testCompletionNotification: true,
})
