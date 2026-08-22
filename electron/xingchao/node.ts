import type { RuntimeFleetSnapshot } from "../../src/domain/xingchao/runtime-fleet.ts"
import type {
  ContentPackService,
  ContentPackSummary,
  ContentPacksChangedEvent,
  RemoveContentPackRequest,
  SetContentPackSelectionRequest,
} from "./common.ts"
import type { ContentPackRuntimeManager } from "./runtime-manager.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { originalFleetPack } from "../../src/domain/xingchao/content-pack.ts"
import { projectRuntimeFleetCatalog } from "../../src/domain/xingchao/runtime-fleet.ts"
import { ServiceEvent } from "../service-events.ts"
import { ContentPackService as ContentPackServiceName } from "./common.ts"

const maxArchiveBytes = 256 * 1024 * 1024

export interface ContentPackServiceDeps {
  confirmRemoval: (pack: ContentPackSummary) => Promise<boolean>
  confirmSelection: (pack: ContentPackSummary, selected: boolean) => Promise<boolean>
  runtimeManager: ContentPackRuntimeManager
  selectArchivePath: () => Promise<string | undefined>
}

function summaryFromManifest(
  manifest: typeof originalFleetPack,
  source: ContentPackSummary["source"],
  installedAt: number | null,
  selected: boolean,
): ContentPackSummary {
  return {
    agentCount: manifest.agents.length,
    crewCount: manifest.crews.length,
    description: manifest.description,
    id: manifest.id,
    installedAt,
    minimumAppVersion: manifest.minimumAppVersion,
    name: manifest.name,
    removable: source === "installed",
    selected,
    source,
    themeCount: manifest.themes.length,
    version: manifest.version,
    visibility: manifest.visibility,
  }
}

export class ContentPackServiceImpl
  extends ConnectionService<ContentPackService>
  implements IConnectionService<ContentPackService>
{
  public readonly changed = new ServiceEvent<ContentPacksChangedEvent>()
  readonly #deps: ContentPackServiceDeps

  public constructor(deps: ContentPackServiceDeps) {
    super(ContentPackServiceName)
    this.#deps = deps
  }

  public async list(): Promise<ContentPackSummary[]> {
    const installed = await this.#deps.runtimeManager.list()
    return [
      summaryFromManifest(originalFleetPack, "builtin", null, true),
      ...installed.map((pack) => summaryFromManifest(pack.manifest, "installed", pack.installedAt, pack.selected)),
    ]
  }

  public async runtimeFleet(): Promise<RuntimeFleetSnapshot> {
    return projectRuntimeFleetCatalog(await this.#deps.runtimeManager.runtimeCatalog())
  }

  public async install(): Promise<ContentPackSummary | null> {
    const selectedPath = await this.#deps.selectArchivePath()
    if (!selectedPath) return null
    const extension = path.extname(selectedPath).toLowerCase()
    if (extension !== ".xcp" && extension !== ".zip") throw new Error("Only .xcp and .zip content packs are supported")
    const archiveStat = await stat(selectedPath)
    if (!archiveStat.isFile() || archiveStat.size > maxArchiveBytes) {
      throw new Error("Content pack archive exceeds the 256 MiB size limit")
    }
    const installed = await this.#deps.runtimeManager.install(await readFile(selectedPath))
    const summary = summaryFromManifest(installed.manifest, "installed", installed.installedAt, false)
    this.#broadcastChanged("installed")
    return summary
  }

  public async setSelection(request: SetContentPackSelectionRequest): Promise<boolean> {
    const changed = await this.#deps.runtimeManager.setSelection(request, (pack, selected) =>
      this.#deps.confirmSelection(
        summaryFromManifest(pack.manifest, "installed", pack.installedAt, pack.selected),
        selected,
      ),
    )
    if (changed) this.#broadcastChanged("selection-changed")
    return changed
  }

  public async remove(request: RemoveContentPackRequest): Promise<boolean> {
    if (request?.id === originalFleetPack.id) throw new Error("The built-in original fleet cannot be removed")
    const removed = await this.#deps.runtimeManager.remove(request, (pack) =>
      this.#deps.confirmRemoval(summaryFromManifest(pack.manifest, "installed", pack.installedAt, pack.selected)),
    )
    if (removed) this.#broadcastChanged("removed")
    return removed
  }

  #broadcastChanged(reason: ContentPacksChangedEvent["reason"]): void {
    this.changed.emit({ reason })
    void this.send("contentPacksChanged", { reason }).catch((error: unknown) => {
      console.warn("[wanta] content pack broadcast failed:", error)
    })
  }
}
