import type {
  AgentRuntimeStatus,
  AssistantActivityEvent,
  ChatPermissionRequest,
} from "../../../electron/chat/common.ts"
import type { ChatStatus } from "ai"

export type AppShellRoute =
  | "archived"
  | "billing"
  | "chat"
  | "connections"
  | "fleet"
  | "knowledge"
  | "teams"
  | "skills"
  | "supply"
  | "voyage"
  | "settings"

/** The mapper deliberately accepts the existing app state, not chat/tool payload text. */
export interface CaptainAppEventInput {
  readonly route: AppShellRoute
  readonly activeSessionId: string | null
  readonly displayedStatus: ChatStatus
  readonly agentStatus: AgentRuntimeStatus
  readonly pendingPermissions: readonly ChatPermissionRequest[]
  readonly activity: AssistantActivityEvent | null
  readonly error: string | null
}
