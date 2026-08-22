export const CONTENT_PACK_SCHEMA_VERSION = "1.0.0" as const

export const BUILTIN_CREW_IDS = [
  "watchtide",
  "ink-sail",
  "brocade-harbor",
  "forge-vessel",
  "golden-scale",
  "helm-order",
  "iron-code",
  "lighthouse",
  "phantom-wave",
  "rest-harbor",
] as const

export type BuiltinCrewId = (typeof BUILTIN_CREW_IDS)[number]
export type CrewId = string

export type AgentRole = "captain" | "crew"
export type PackVisibility = "public-original" | "private-local"
export type MissionStatus = "draft" | "awaiting-confirmation" | "running" | "blocked" | "completed" | "cancelled"
export type MissionNodeStatus = "pending" | "running" | "blocked" | "completed" | "failed" | "cancelled"
export type RiskLevel = "low" | "medium" | "high"
export type MemoryScope = "turn" | "mission" | "user" | "project" | "long-term"

export interface CapabilityScore {
  id: string
  label: string
  level: 1 | 2 | 3 | 4 | 5
}

export interface PersonaProfile {
  temperament: string
  decisionStyle: string
  communicationStyle: string
  signature: string
  tension: string
}

export interface ProfessionalProfile {
  capabilities: CapabilityScore[]
  allowedTools: string[]
  prohibitedActions: string[]
  deliverables: string[]
}

export interface AgentEvaluationCase {
  id: string
  prompt: string
  expectedBehaviors: string[]
  forbiddenBehaviors: string[]
}

export interface AgentProfile {
  id: string
  crewId: CrewId
  name: string
  title: string
  role: AgentRole
  biography: string
  persona: PersonaProfile
  professional: ProfessionalProfile
  delegatesTo: string[]
  relationships: Array<{ agentId: string; description: string }>
  voice: { style: string; rate: number; pitch: number }
  visual: { portrait?: string; accent: string; silhouette: string }
  evaluations: AgentEvaluationCase[]
}

export interface ThemeProfile {
  id: CrewId
  name: string
  primary: string
  secondary: string
  accent: string
  surface: string
  foreground: string
  texture: "chart" | "paper" | "wood" | "metal" | "mist"
  motion: "tide" | "ink" | "glimmer" | "pulse" | "drift"
  soundCue: string
  live2dOverlay: string
  highContrast: { primary: string; background: string; foreground: string }
}

export interface CrewProfile {
  id: CrewId
  name: string
  domain: string
  motto: string
  description: string
  captainId: string
  memberIds: string[]
  routingSignals: string[]
  supportSignals: string[]
  standardWorkflow: string[]
  theme: ThemeProfile
}

export interface ContentPackManifest {
  schemaVersion: typeof CONTENT_PACK_SCHEMA_VERSION
  id: string
  version: string
  name: string
  description: string
  visibility: PackVisibility
  minimumAppVersion: string
  checksums: Record<string, string>
  crews: CrewProfile[]
  agents: AgentProfile[]
  themes: ThemeProfile[]
  executableCode: false
}

export interface ProviderProfile {
  id: string
  name: string
  protocol: "openai-compatible" | "openai-responses" | "anthropic" | "google" | "ollama"
  baseUrl: string
  credentialRef?: string
  models: Array<{
    id: string
    displayName: string
    toolCall: boolean
    vision: boolean
    audio: boolean
    contextWindow?: number
  }>
  fallbackEnabled: boolean
}

export interface MissionNode {
  id: string
  title: string
  description: string
  agentId: string
  crewId: CrewId
  dependsOn: string[]
  status: MissionNodeStatus
  concurrencySafe: boolean
  risk: RiskLevel
  expectedArtifact?: string
}

export interface Mission {
  id: string
  goal: string
  deliverables: string[]
  constraints: string[]
  risks: string[]
  primaryCrewId: CrewId
  supportCrewIds: CrewId[]
  nodes: MissionNode[]
  status: MissionStatus
  budget?: { maxTokens?: number; maxCost?: number; currency?: string }
  approvals: Array<{ nodeId: string; reason: string; approved?: boolean }>
  artifacts: Array<{ id: string; path: string; agentId: string; nodeId: string; version: number }>
}

export type AgentStreamEvent =
  | { type: "plan"; mission: Mission }
  | { type: "agent-start"; missionId: string; nodeId: string; agentId: string }
  | { type: "agent-stop"; missionId: string; nodeId: string; agentId: string; ok: boolean }
  | { type: "tool"; missionId: string; nodeId: string; tool: string; phase: "start" | "finish" }
  | { type: "approval"; missionId: string; nodeId: string; reason: string }
  | { type: "handoff"; missionId: string; fromAgentId: string; toAgentId: string; summary: string }
  | { type: "artifact"; missionId: string; nodeId: string; path: string }
  | { type: "failure"; missionId: string; nodeId?: string; message: string; recoverable: boolean }
  | { type: "cancelled"; missionId: string }
  | { type: "completed"; missionId: string; artifactIds: string[] }

export interface MemoryRecord {
  id: string
  scope: MemoryScope
  subject: string
  content: string
  source: { type: "user" | "artifact" | "agent" | "import"; ref: string }
  confidence: number
  sensitivity: "normal" | "personal" | "sensitive"
  createdAt: string
  updatedAt: string
  expiresAt?: string
  provenance: string[]
}
