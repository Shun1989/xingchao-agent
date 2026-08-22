import type { RuntimeContentCatalog, RuntimeContentSource, RuntimeThemeProfile } from "./runtime-catalog.ts"
import type { AgentRole, CapabilityScore, CrewId } from "./types.ts"

import { CONTENT_PACK_LIMITS } from "./content-pack-limits.ts"
import { originalFleetPack } from "./content-pack.ts"
import { buildRuntimeContentCatalog } from "./runtime-catalog.ts"

const RUNTIME_FLEET_LIMITS = {
  crews: CONTENT_PACK_LIMITS.packCrews * 4,
  agents: CONTENT_PACK_LIMITS.packAgents * 4,
  themes: CONTENT_PACK_LIMITS.packThemes * 4,
} as const

export type RuntimeFleetSource = Pick<RuntimeContentSource, "kind" | "packId" | "packVersion">

export interface RuntimeFleetAgent {
  id: string
  crewId: CrewId
  name: string
  title: string
  role: AgentRole
  biography: string
  capabilities: CapabilityScore[]
  deliverables: string[]
  visual: { accent: string; silhouette: string }
}

export interface RuntimeFleetCrew {
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
  themeId: string
}

export interface RuntimeFleetTheme {
  id: string
  name: string
  primary: string
  secondary: string
  accent: string
  surface: string
  foreground: string
  texture: RuntimeThemeProfile["texture"]
  motion: RuntimeThemeProfile["motion"]
  soundCue: string
  live2dOverlay: string
  highContrast: RuntimeThemeProfile["highContrast"]
}

export interface RuntimeFleetSnapshot {
  revision: string
  crews: RuntimeFleetCrew[]
  agents: RuntimeFleetAgent[]
  themes: RuntimeFleetTheme[]
  sources: {
    crews: Record<string, RuntimeFleetSource>
    agents: Record<string, RuntimeFleetSource>
    themes: Record<string, RuntimeFleetSource>
  }
}

export interface RuntimeFleetIndex {
  snapshot: RuntimeFleetSnapshot
  crewById: ReadonlyMap<CrewId, RuntimeFleetCrew>
  agentById: ReadonlyMap<string, RuntimeFleetAgent>
  themeById: ReadonlyMap<string, RuntimeFleetTheme>
  agentsForCrew(crewId: CrewId): RuntimeFleetAgent[]
}

function assertRuntimeFleetCapacity(catalog: RuntimeContentCatalog): void {
  if (catalog.crews.length > RUNTIME_FLEET_LIMITS.crews) {
    throw new Error(`Runtime fleet exceeds ${RUNTIME_FLEET_LIMITS.crews} crews`)
  }
  if (catalog.agents.length > RUNTIME_FLEET_LIMITS.agents) {
    throw new Error(`Runtime fleet exceeds ${RUNTIME_FLEET_LIMITS.agents} agents`)
  }
  if (catalog.themes.length > RUNTIME_FLEET_LIMITS.themes) {
    throw new Error(`Runtime fleet exceeds ${RUNTIME_FLEET_LIMITS.themes} themes`)
  }
}

function projectSources(sources: ReadonlyMap<string, RuntimeContentSource>): Record<string, RuntimeFleetSource> {
  return Object.fromEntries(
    [...sources].map(([id, source]) => [
      id,
      { kind: source.kind, packId: source.packId, packVersion: source.packVersion },
    ]),
  )
}

function runtimeRevision(catalog: RuntimeContentCatalog): string {
  const sourceValues = [
    ...catalog.sources.crews.values(),
    ...catalog.sources.agents.values(),
    ...catalog.sources.themes.values(),
  ]
  return [...new Set(sourceValues.map(({ packId, packVersion }) => `${packId}@${packVersion}`))].sort().join("|")
}

export function projectRuntimeFleetCatalog(catalog: RuntimeContentCatalog): RuntimeFleetSnapshot {
  assertRuntimeFleetCapacity(catalog)

  return {
    revision: runtimeRevision(catalog),
    crews: catalog.crews.map((crew) => ({
      id: crew.id,
      name: crew.name,
      domain: crew.domain,
      motto: crew.motto,
      description: crew.description,
      captainId: crew.captainId,
      memberIds: [...crew.memberIds],
      routingSignals: [...crew.routingSignals],
      supportSignals: [...crew.supportSignals],
      standardWorkflow: [...crew.standardWorkflow],
      themeId: crew.theme.id,
    })),
    agents: catalog.agents.map((agent) => ({
      id: agent.id,
      crewId: agent.crewId,
      name: agent.name,
      title: agent.title,
      role: agent.role,
      biography: agent.biography,
      capabilities: agent.professional.capabilities.map((capability) => ({
        id: capability.id,
        label: capability.label,
        level: capability.level,
      })),
      deliverables: [...agent.professional.deliverables],
      visual: { accent: agent.visual.accent, silhouette: agent.visual.silhouette },
    })),
    themes: catalog.themes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      primary: theme.primary,
      secondary: theme.secondary,
      accent: theme.accent,
      surface: theme.surface,
      foreground: theme.foreground,
      texture: theme.texture,
      motion: theme.motion,
      soundCue: theme.soundCue,
      live2dOverlay: theme.live2dOverlay,
      highContrast: {
        primary: theme.highContrast.primary,
        background: theme.highContrast.background,
        foreground: theme.highContrast.foreground,
      },
    })),
    sources: {
      crews: projectSources(catalog.sources.crews),
      agents: projectSources(catalog.sources.agents),
      themes: projectSources(catalog.sources.themes),
    },
  }
}

function indexById<T extends { id: string }>(items: readonly T[], label: string): Map<string, T> {
  const index = new Map<string, T>()
  for (const item of items) {
    if (index.has(item.id)) throw new Error(`Duplicate ${label} ID: ${item.id}`)
    index.set(item.id, item)
  }
  return index
}

export function indexRuntimeFleet(snapshot: RuntimeFleetSnapshot): RuntimeFleetIndex {
  const crewById = indexById(snapshot.crews, "crew")
  const agentById = indexById(snapshot.agents, "agent")
  const themeById = indexById(snapshot.themes, "theme")
  const agentsByCrew = new Map<CrewId, RuntimeFleetAgent[]>()

  for (const agent of snapshot.agents) {
    if (!crewById.has(agent.crewId)) {
      throw new Error(`Agent ${agent.id} references missing crew ${agent.crewId}`)
    }
    const crewAgents = agentsByCrew.get(agent.crewId) ?? []
    crewAgents.push(agent)
    agentsByCrew.set(agent.crewId, crewAgents)
  }

  for (const crew of snapshot.crews) {
    if (!agentById.has(crew.captainId)) {
      throw new Error(`Crew ${crew.id} captain ${crew.captainId} is missing`)
    }
    for (const memberId of crew.memberIds) {
      if (!agentById.has(memberId)) {
        throw new Error(`Crew ${crew.id} member ${memberId} is missing`)
      }
    }
    if (!themeById.has(crew.themeId)) {
      throw new Error(`Crew ${crew.id} theme ${crew.themeId} is missing`)
    }
  }

  return {
    snapshot,
    crewById,
    agentById,
    themeById,
    agentsForCrew: (crewId) => [...(agentsByCrew.get(crewId) ?? [])],
  }
}

export const builtinRuntimeFleetSnapshot = projectRuntimeFleetCatalog(buildRuntimeContentCatalog(originalFleetPack, []))
export const builtinRuntimeFleetIndex = indexRuntimeFleet(builtinRuntimeFleetSnapshot)
