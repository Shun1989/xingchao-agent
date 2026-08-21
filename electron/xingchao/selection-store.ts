import { readFile } from "node:fs/promises"
import path from "node:path"
import { atomicWriteText } from "../atomic-file.ts"
import { isMissingFileError, logStoreReadFailure } from "../store-diagnostics.ts"

const safePackId = /^[a-z0-9][a-z0-9-]{1,63}$/
const semanticVersion = /^\d+\.\d+\.\d+$/

interface PersistedContentPackSelections {
  selections?: Record<string, unknown>
  version?: number
}

export interface ContentPackSelectionPersistence {
  read(): Promise<Map<string, string>>
  write(selections: ReadonlyMap<string, string>): Promise<void>
}

export interface ContentPackSelectionStoreDeps {
  readText(filePath: string): Promise<string>
  writeText(filePath: string, content: string): Promise<void>
}

const defaultDeps: ContentPackSelectionStoreDeps = {
  readText: (filePath) => readFile(filePath, "utf8"),
  writeText: (filePath, content) => atomicWriteText(filePath, content, { mode: 0o600 }),
}

export function normalizeContentPackSelections(value: unknown): Map<string, string> {
  if (!value || typeof value !== "object") return new Map()
  const state = value as PersistedContentPackSelections
  if (state.version !== 1 || !state.selections || typeof state.selections !== "object") return new Map()

  const selections = new Map<string, string>()
  for (const [packId, version] of Object.entries(state.selections)) {
    if (safePackId.test(packId) && typeof version === "string" && semanticVersion.test(version)) {
      selections.set(packId, version)
    }
  }
  return selections
}

function serializeContentPackSelections(selections: ReadonlyMap<string, string>): PersistedContentPackSelections {
  return {
    selections: Object.fromEntries([...selections].sort(([left], [right]) => left.localeCompare(right))),
    version: 1,
  }
}

export class ContentPackSelectionStore implements ContentPackSelectionPersistence {
  private readonly deps: ContentPackSelectionStoreDeps
  private readonly file: string

  public constructor(userDataDirectory: string, deps: ContentPackSelectionStoreDeps = defaultDeps) {
    this.deps = deps
    this.file = path.join(userDataDirectory, "content-pack-selections.json")
  }

  public async read(): Promise<Map<string, string>> {
    try {
      return normalizeContentPackSelections(JSON.parse(await this.deps.readText(this.file)))
    } catch (error) {
      logStoreReadFailure("content pack selections", this.file, error)
      if (isMissingFileError(error) || error instanceof SyntaxError) return new Map()
      throw error
    }
  }

  public async write(selections: ReadonlyMap<string, string>): Promise<void> {
    await this.deps.writeText(this.file, `${JSON.stringify(serializeContentPackSelections(selections), null, 2)}\n`)
  }
}
