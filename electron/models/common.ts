import type { WantaReasoningVariant } from "../agent/reasoning.ts"
import type { BuiltinModelId } from "./builtin.ts"

import { serviceName } from "../branding.ts"
import { defineService } from "../ipc/connection.ts"

export interface BuiltinModelSummary {
  id: BuiltinModelId
  displayName: string
  providerName: string
  supportsImages: boolean
  toolCall: boolean
  runtimeKind: "openai-compatible" | "openai-responses"
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly WantaReasoningVariant[]
}

export interface CustomModelOption {
  id: string
  displayName?: string
  supportsImages?: boolean
  supportsToolCalls?: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly WantaReasoningVariant[]
}

export interface CustomModelApiRegion {
  id: string
  baseUrl: string
}

export interface CustomModelApiPlan {
  id: string
  baseUrl: string
  apiRegions?: CustomModelApiRegion[]
}

export interface CustomModelProvider {
  id: string
  displayName: string
  baseUrl: string
  apiPlans?: CustomModelApiPlan[]
  apiRegions?: CustomModelApiRegion[]
  modelOptions?: CustomModelOption[]
  supportsImages?: boolean
  supportsToolCalls?: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly WantaReasoningVariant[]
  documentationUrl?: string
  requiresBaseUrl?: boolean
}

export type ModelCredentialStatus = "configured" | "missing" | "unavailable"

export interface CustomModelSummary {
  id: string
  providerId: string
  providerName: string
  baseUrl: string
  modelName: string
  displayName: string
  apiKeyConfigured: boolean
  credentialStatus: ModelCredentialStatus
  supportsImages: boolean
  supportsToolCalls: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly WantaReasoningVariant[]
}

export type ModelChoice = { kind: "builtin"; id: BuiltinModelId } | { kind: "custom"; id: string }

export interface ModelCatalog {
  builtins: BuiltinModelSummary[]
  customModels: CustomModelSummary[]
  providers: CustomModelProvider[]
  selected: ModelChoice
}

export interface SaveCustomModelRequest {
  id?: string
  providerId: string
  providerName?: string
  baseUrl?: string
  apiKey?: string
  modelName: string
  displayName?: string
  supportsImages?: boolean
  supportsToolCalls?: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly WantaReasoningVariant[]
}

export type ModelsService = typeof ModelsService
export const ModelsService = defineService<{
  ServerEvents: {
    modelsChanged: ModelCatalog
  }
  ClientInvokes: {
    listModels(): Promise<ModelCatalog>
    setSelectedModel(choice: ModelChoice): Promise<ModelCatalog>
    saveCustomModel(req: SaveCustomModelRequest): Promise<ModelCatalog>
    deleteCustomModel(id: string): Promise<ModelCatalog>
  }
}>(serviceName("models-service"), {
  listModels: true,
  setSelectedModel: true,
  saveCustomModel: true,
  deleteCustomModel: true,
})
