import type { RuntimeContentCatalog } from "../../src/domain/xingchao/runtime-catalog.ts"
import type { RemoveContentPackRequest, SetContentPackSelectionRequest } from "./common.ts"
import type { InstalledContentPack } from "./content-pack-installer.ts"
import type { ContentPackSelectionPersistence } from "./selection-store.ts"

import { originalFleetPack } from "../../src/domain/xingchao/content-pack.ts"
import { buildRuntimeContentCatalog } from "../../src/domain/xingchao/runtime-catalog.ts"
import {
  compareVersions,
  installContentPackArchive,
  listInstalledContentPacks,
  removeInstalledContentPack,
} from "./content-pack-installer.ts"
import { ContentPackSelectionStore } from "./selection-store.ts"

export interface RuntimeManagedContentPack extends InstalledContentPack {
  selected: boolean
}

export interface ContentPackRuntimeManagerDeps {
  appVersion: string
  selectionStore?: ContentPackSelectionPersistence
  userDataDirectory: string
}

type ConfirmSelection = (pack: RuntimeManagedContentPack, selected: boolean) => Promise<boolean>
type ConfirmRemoval = (pack: RuntimeManagedContentPack) => Promise<boolean>

function sameSelections(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): boolean {
  return left.size === right.size && [...left].every(([id, version]) => right.get(id) === version)
}

export class ContentPackRuntimeManager {
  readonly #appVersion: string
  readonly #selectionStore: ContentPackSelectionPersistence
  readonly #userDataDirectory: string
  #operationChain: Promise<void> = Promise.resolve()

  public constructor(deps: ContentPackRuntimeManagerDeps) {
    this.#appVersion = deps.appVersion
    this.#selectionStore = deps.selectionStore ?? new ContentPackSelectionStore(deps.userDataDirectory)
    this.#userDataDirectory = deps.userDataDirectory
  }

  public async install(archive: Uint8Array): Promise<InstalledContentPack> {
    return this.#exclusive(() =>
      installContentPackArchive(archive, this.#userDataDirectory, { currentAppVersion: this.#appVersion }),
    )
  }

  public async list(): Promise<RuntimeManagedContentPack[]> {
    return this.#exclusive(async () => {
      const { installed, selections } = await this.#loadInventory()
      return installed.map((pack) => ({ ...pack, selected: selections.get(pack.id) === pack.version }))
    })
  }

  public async remove(request: RemoveContentPackRequest, confirm: ConfirmRemoval): Promise<boolean> {
    return this.#exclusive(async () => {
      let inventory = await this.#loadInventory()
      let pack = inventory.installed.find(
        (candidate) => candidate.id === request.id && candidate.version === request.version,
      )
      if (!pack) return false
      if (!(await confirm({ ...pack, selected: inventory.selections.get(pack.id) === pack.version }))) return false

      inventory = await this.#loadInventory()
      pack = inventory.installed.find(
        (candidate) => candidate.id === request.id && candidate.version === request.version,
      )
      if (!pack) return false
      const wasSelected = inventory.selections.get(request.id) === request.version
      if (wasSelected) {
        const selectionsWithoutPack = new Map(inventory.selections)
        selectionsWithoutPack.delete(request.id)
        await this.#selectionStore.write(selectionsWithoutPack)
      }

      try {
        return await removeInstalledContentPack(this.#userDataDirectory, request.id, request.version)
      } catch (error) {
        if (wasSelected) {
          try {
            await this.#selectionStore.write(inventory.selections)
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], "Content pack removal and selection rollback failed")
          }
        }
        throw error
      }
    })
  }

  public async runtimeCatalog(): Promise<RuntimeContentCatalog> {
    return this.#exclusive(async () => {
      const { installed, selections } = await this.#loadInventory()
      return buildRuntimeContentCatalog(
        originalFleetPack,
        installed.filter((pack) => selections.get(pack.id) === pack.version).map((pack) => pack.manifest),
      )
    })
  }

  public async setSelection(request: SetContentPackSelectionRequest, confirm: ConfirmSelection): Promise<boolean> {
    return this.#exclusive(async () => {
      if (
        typeof request?.id !== "string" ||
        typeof request?.version !== "string" ||
        typeof request?.selected !== "boolean"
      ) {
        throw new Error("Invalid content pack selection request")
      }
      if (request.id === originalFleetPack.id) {
        throw new Error("The built-in original fleet selection cannot be changed")
      }

      let inventory = await this.#loadInventory()
      let pack = this.#requireSelectablePack(inventory.installed, request)
      const currentlySelected = inventory.selections.get(request.id) === request.version
      if (currentlySelected === request.selected) return false
      if (!(await confirm({ ...pack, selected: currentlySelected }, request.selected))) return false

      inventory = await this.#loadInventory()
      pack = this.#requireSelectablePack(inventory.installed, request)
      const latestSelected = inventory.selections.get(request.id) === request.version
      if (latestSelected === request.selected) return false
      if (request.selected) inventory.selections.set(request.id, request.version)
      else inventory.selections.delete(request.id)
      await this.#selectionStore.write(inventory.selections)
      return true
    })
  }

  #compatible(pack: InstalledContentPack): boolean {
    return compareVersions(this.#appVersion, pack.manifest.minimumAppVersion) >= 0
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationChain.then(operation)
    this.#operationChain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async #loadInventory(): Promise<{
    installed: InstalledContentPack[]
    selections: Map<string, string>
  }> {
    const installed = await listInstalledContentPacks(this.#userDataDirectory)
    const persistedSelections = await this.#selectionStore.read()
    const selectableVersions = new Set(
      installed.filter((pack) => this.#compatible(pack)).map((pack) => `${pack.id}@${pack.version}`),
    )
    const selections = new Map(
      [...persistedSelections].filter(([id, version]) => selectableVersions.has(`${id}@${version}`)),
    )
    if (!sameSelections(persistedSelections, selections)) {
      try {
        await this.#selectionStore.write(selections)
      } catch (error) {
        console.warn("[wanta] failed to repair content pack selections:", error)
      }
    }
    return { installed, selections }
  }

  #requireSelectablePack(
    installed: readonly InstalledContentPack[],
    request: Pick<SetContentPackSelectionRequest, "id" | "version">,
  ): InstalledContentPack {
    const pack = installed.find((candidate) => candidate.id === request.id && candidate.version === request.version)
    if (!pack) throw new Error(`Content pack is not installed: ${request.id}@${request.version}`)
    if (!this.#compatible(pack)) {
      throw new Error(`Content pack requires app version ${pack.manifest.minimumAppVersion} or newer`)
    }
    return pack
  }
}
