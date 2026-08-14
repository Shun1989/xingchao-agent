import type { AgentProfile, ContentPackManifest, CrewProfile, ThemeProfile } from "./types.ts"

import { z } from "zod"
import { agents, crews } from "./crews.ts"
import { CONTENT_PACK_SCHEMA_VERSION } from "./types.ts"

const safeId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const contentPackManifestSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_PACK_SCHEMA_VERSION),
    id: safeId,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    visibility: z.enum(["public-original", "private-local"]),
    minimumAppVersion: z.string(),
    checksums: z.record(z.string(), z.string()),
    crews: z.array(
      z.object({
        id: safeId,
        name: z.string(),
        domain: z.string(),
        motto: z.string(),
        description: z.string(),
        captainId: safeId,
        memberIds: z.array(safeId).length(6),
        routingSignals: z.array(z.string()).min(3),
        supportSignals: z.array(z.string()),
        standardWorkflow: z.array(z.string()).min(3),
        theme: z.object({
          id: safeId,
          name: z.string(),
          primary: hexColor,
          secondary: hexColor,
          accent: hexColor,
          surface: hexColor,
          foreground: hexColor,
          texture: z.enum(["chart", "paper", "wood", "metal", "mist"]),
          motion: z.enum(["tide", "ink", "glimmer", "pulse", "drift"]),
          soundCue: z.string(),
          live2dOverlay: z.string(),
          highContrast: z.object({ primary: hexColor, background: hexColor, foreground: hexColor }),
        }),
      }),
    ),
    agents: z.array(z.object({ id: safeId, crewId: safeId, name: z.string(), title: z.string() }).passthrough()),
    themes: z.array(z.object({ id: safeId }).passthrough()),
    executableCode: z.literal(false),
  })
  .superRefine((pack, context) => {
    const agentIds = new Set(pack.agents.map((agent) => agent.id))
    for (const crew of pack.crews) {
      if (!agentIds.has(crew.captainId)) {
        context.addIssue({ code: "custom", message: `船长 ${crew.captainId} 不存在`, path: ["crews", crew.id] })
      }
      for (const memberId of crew.memberIds) {
        if (!agentIds.has(memberId)) {
          context.addIssue({ code: "custom", message: `成员 ${memberId} 不存在`, path: ["crews", crew.id] })
        }
      }
    }
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
