import type { AgentProfile, ContentPackManifest, CrewProfile, ThemeProfile } from "./types.ts"

import { z } from "zod"
import { CONTENT_PACK_LIMITS, runtimeText } from "./content-pack-limits.ts"
import { agents, crews } from "./crews.ts"
import { CONTENT_PACK_SCHEMA_VERSION } from "./types.ts"

const safeId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const capabilityScoreSchema = z.object({
  id: safeId,
  label: runtimeText(CONTENT_PACK_LIMITS.shortText),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
})

const personaProfileSchema = z.object({
  communicationStyle: z.string().min(1),
  decisionStyle: z.string().min(1),
  signature: z.string().min(1),
  temperament: z.string().min(1),
  tension: z.string().min(1),
})

const professionalProfileSchema = z.object({
  allowedTools: z.array(z.string().min(1)),
  capabilities: z.array(capabilityScoreSchema).max(CONTENT_PACK_LIMITS.capabilities),
  deliverables: z.array(runtimeText(CONTENT_PACK_LIMITS.deliverableText)).max(CONTENT_PACK_LIMITS.deliverables),
  prohibitedActions: z.array(z.string().min(1)),
})

const agentEvaluationCaseSchema = z.object({
  expectedBehaviors: z.array(z.string().min(1)),
  forbiddenBehaviors: z.array(z.string().min(1)),
  id: safeId,
  prompt: z.string().min(1),
})

const themeProfileSchema = z.object({
  accent: hexColor,
  foreground: hexColor,
  highContrast: z.object({ background: hexColor, foreground: hexColor, primary: hexColor }),
  id: safeId,
  live2dOverlay: runtimeText(CONTENT_PACK_LIMITS.shortText),
  motion: z.enum(["tide", "ink", "glimmer", "pulse", "drift"]),
  name: runtimeText(CONTENT_PACK_LIMITS.shortText),
  primary: hexColor,
  secondary: hexColor,
  soundCue: runtimeText(CONTENT_PACK_LIMITS.shortText),
  surface: hexColor,
  texture: z.enum(["chart", "paper", "wood", "metal", "mist"]),
})

const crewProfileSchema = z.object({
  captainId: safeId,
  description: runtimeText(CONTENT_PACK_LIMITS.longText),
  domain: runtimeText(CONTENT_PACK_LIMITS.shortText),
  id: safeId,
  memberIds: z.array(safeId).length(6),
  motto: runtimeText(CONTENT_PACK_LIMITS.shortText),
  name: runtimeText(CONTENT_PACK_LIMITS.shortText),
  routingSignals: z.array(runtimeText(CONTENT_PACK_LIMITS.signalText)).min(3).max(CONTENT_PACK_LIMITS.signals),
  standardWorkflow: z.array(runtimeText(CONTENT_PACK_LIMITS.shortText)).min(3).max(CONTENT_PACK_LIMITS.workflowSteps),
  supportSignals: z.array(runtimeText(CONTENT_PACK_LIMITS.signalText)).max(CONTENT_PACK_LIMITS.signals),
  theme: themeProfileSchema,
})

const agentProfileSchema = z.object({
  biography: runtimeText(CONTENT_PACK_LIMITS.longText),
  crewId: safeId,
  delegatesTo: z.array(safeId),
  evaluations: z.array(agentEvaluationCaseSchema),
  id: safeId,
  name: runtimeText(CONTENT_PACK_LIMITS.shortText),
  persona: personaProfileSchema,
  professional: professionalProfileSchema,
  relationships: z.array(z.object({ agentId: safeId, description: z.string().min(1) })),
  role: z.enum(["captain", "crew"]),
  title: runtimeText(CONTENT_PACK_LIMITS.shortText),
  visual: z.object({
    accent: hexColor,
    portrait: z.string().optional(),
    silhouette: runtimeText(CONTENT_PACK_LIMITS.shortText),
  }),
  voice: z.object({
    pitch: z.number().finite().positive(),
    rate: z.number().finite().positive(),
    style: z.string().min(1),
  }),
})

function reportDuplicateIds(
  items: ReadonlyArray<{ id: string }>,
  collection: "agents" | "crews" | "themes",
  context: z.core.$RefinementCtx,
): void {
  const seen = new Set<string>()
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({
        code: "custom",
        message: `重复的 ${collection} ID：${item.id}`,
        path: [collection, index, "id"],
      })
    }
    seen.add(item.id)
  })
}

export const contentPackManifestSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_PACK_SCHEMA_VERSION),
    id: safeId,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    visibility: z.enum(["public-original", "private-local"]),
    minimumAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    checksums: z.record(z.string(), z.string().regex(/^[0-9a-fA-F]{64}$/)),
    crews: z.array(crewProfileSchema).max(CONTENT_PACK_LIMITS.packCrews),
    agents: z.array(agentProfileSchema).max(CONTENT_PACK_LIMITS.packAgents),
    themes: z.array(themeProfileSchema).max(CONTENT_PACK_LIMITS.packThemes),
    executableCode: z.literal(false),
  })
  .superRefine((pack, context) => {
    reportDuplicateIds(pack.crews, "crews", context)
    reportDuplicateIds(pack.agents, "agents", context)
    reportDuplicateIds(pack.themes, "themes", context)

    const crewsById = new Map(pack.crews.map((crew) => [crew.id, crew]))
    const agentsById = new Map(pack.agents.map((agent) => [agent.id, agent]))
    const themesById = new Map(pack.themes.map((theme) => [theme.id, theme]))
    pack.crews.forEach((crew, crewIndex) => {
      if (!agentsById.has(crew.captainId)) {
        context.addIssue({ code: "custom", message: `船长 ${crew.captainId} 不存在`, path: ["crews", crew.id] })
      }
      crew.memberIds.forEach((memberId, memberIndex) => {
        if (!agentsById.has(memberId)) {
          context.addIssue({
            code: "custom",
            message: `成员 ${memberId} 不存在`,
            path: ["crews", crewIndex, "memberIds", memberIndex],
          })
        }
      })
      if (!themesById.has(crew.theme.id)) {
        context.addIssue({
          code: "custom",
          message: `主题 ${crew.theme.id} 不在主题清单中`,
          path: ["crews", crewIndex, "theme", "id"],
        })
      }
    })

    pack.agents.forEach((agent, agentIndex) => {
      if (!crewsById.has(agent.crewId)) {
        context.addIssue({
          code: "custom",
          message: `角色 ${agent.id} 引用了不存在的航海团 ${agent.crewId}`,
          path: ["agents", agentIndex, "crewId"],
        })
      }
    })
  })

export const originalFleetPack: ContentPackManifest = {
  schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
  id: "xingchao-original-fleet",
  version: "1.0.0",
  name: "星潮原创舰队",
  description: "星潮航局公开发行的十个原创能力域航海团。",
  visibility: "public-original",
  minimumAppVersion: "0.1.0",
  checksums: {},
  crews,
  agents,
  themes: crews.map((crew) => crew.theme),
  executableCode: false,
}

export function validateContentPack(input: unknown): ContentPackManifest {
  const parsed = contentPackManifestSchema.parse(input)
  return {
    ...parsed,
    crews: parsed.crews as CrewProfile[],
    agents: parsed.agents as unknown as AgentProfile[],
    themes: parsed.themes as unknown as ThemeProfile[],
  }
}
