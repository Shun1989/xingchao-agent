import type { AgentProfile, ContentPackManifest, CrewProfile, ThemeProfile } from "./types.ts"

export type RuntimeAgentProfile = Omit<AgentProfile, "crewId"> & { crewId: string }
export type RuntimeThemeProfile = Omit<ThemeProfile, "id"> & { id: string }
export type RuntimeCrewProfile = Omit<CrewProfile, "id" | "theme"> & {
  id: string
  theme: RuntimeThemeProfile
}

export interface RuntimeContentSource {
  kind: "builtin" | "installed"
  localId: string
  packId: string
  packVersion: string
}

export interface RuntimeContentCatalog {
  agents: RuntimeAgentProfile[]
  crews: RuntimeCrewProfile[]
  sources: {
    agents: ReadonlyMap<string, RuntimeContentSource>
    crews: ReadonlyMap<string, RuntimeContentSource>
    themes: ReadonlyMap<string, RuntimeContentSource>
  }
  themes: RuntimeThemeProfile[]
}

function importedId(packId: string, localId: string): string {
  return `${packId}--${localId}`
}

function catalogSource(
  pack: ContentPackManifest,
  kind: RuntimeContentSource["kind"],
  localId: string,
): RuntimeContentSource {
  return { kind, localId, packId: pack.id, packVersion: pack.version }
}

function registerSource(
  sources: Map<string, RuntimeContentSource>,
  runtimeId: string,
  source: RuntimeContentSource,
  entity: "agent" | "crew" | "theme",
): void {
  if (sources.has(runtimeId)) throw new Error(`Runtime ${entity} ID collision: ${runtimeId}`)
  sources.set(runtimeId, source)
}

export function buildRuntimeContentCatalog(
  builtinPack: ContentPackManifest,
  installedPacks: readonly ContentPackManifest[],
): RuntimeContentCatalog {
  const selectedPackIds = new Set<string>()
  for (const pack of installedPacks) {
    if (selectedPackIds.has(pack.id)) throw new Error(`Multiple versions selected for content pack ${pack.id}`)
    selectedPackIds.add(pack.id)
  }

  const agents: RuntimeAgentProfile[] = []
  const crews: RuntimeCrewProfile[] = []
  const themes: RuntimeThemeProfile[] = []
  const sources = {
    agents: new Map<string, RuntimeContentSource>(),
    crews: new Map<string, RuntimeContentSource>(),
    themes: new Map<string, RuntimeContentSource>(),
  }

  const addPack = (sourcePack: ContentPackManifest, kind: RuntimeContentSource["kind"]): void => {
    const pack = structuredClone(sourcePack)
    const runtimeId =
      kind === "builtin" ? (localId: string) => localId : (localId: string) => importedId(pack.id, localId)

    for (const crew of pack.crews) {
      const id = runtimeId(crew.id)
      registerSource(sources.crews, id, catalogSource(pack, kind, crew.id), "crew")
      crews.push({
        ...crew,
        captainId: runtimeId(crew.captainId),
        id,
        memberIds: crew.memberIds.map(runtimeId),
        theme: { ...crew.theme, id: runtimeId(crew.theme.id) },
      })
    }

    for (const agent of pack.agents) {
      const id = runtimeId(agent.id)
      registerSource(sources.agents, id, catalogSource(pack, kind, agent.id), "agent")
      agents.push({
        ...agent,
        crewId: runtimeId(agent.crewId),
        delegatesTo: agent.delegatesTo.map(runtimeId),
        id,
        relationships: agent.relationships.map((relationship) => ({
          ...relationship,
          agentId: runtimeId(relationship.agentId),
        })),
      })
    }

    for (const theme of pack.themes) {
      const id = runtimeId(theme.id)
      registerSource(sources.themes, id, catalogSource(pack, kind, theme.id), "theme")
      themes.push({ ...theme, id })
    }
  }

  addPack(builtinPack, "builtin")
  installedPacks.forEach((pack) => addPack(pack, "installed"))
  return { agents, crews, sources, themes }
}
