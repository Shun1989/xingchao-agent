import type { ContentPackService, ContentPackSummary, RemoveContentPackRequest } from "./common.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { originalFleetPack } from "../../src/domain/xingchao/content-pack.ts"
import { ServiceEvent } from "../service-events.ts"
import { ContentPackService as ContentPackServiceName } from "./common.ts"
import {
  installContentPackArchive,
  listInstalledContentPacks,
  removeInstalledContentPack,
} from "./content-pack-installer.ts"

const maxArchiveBytes = 256 * 1024 * 1024

export interface ContentPackServiceDeps {
  appVersion: string
  confirmRemoval: (pack: ContentPackSummary) => Promise<boolean>
  selectArchivePath: () => Promise<string | undefined>
  userDataDirectory: string
}

function summaryFromManifest(
  manifest: typeof originalFleetPack,
  source: ContentPackSummary["source"],
  installedAt: number | null,
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
  public readonly changed = new ServiceEvent<{ reason: "installed" | "removed" }>()

  public constructor(private readonly deps: ContentPackServiceDeps) {
    super(ContentPackServiceName)
  }

  public async list(): Promise<ContentPackSummary[]> {
    const installed = await listInstalledContentPacks(this.deps.userDataDirectory)
    return [
      summaryFromManifest(originalFleetPack, "builtin", null),
      ...installed.map((pack) => summaryFromManifest(pack.manifest, "installed", pack.installedAt)),
    ]
  }

  public async install(): Promise<ContentPackSummary | null> {
    const selectedPath = await this.deps.selectArchivePath()
    if (!selectedPath) return null
    const extension = path.extname(selectedPath).toLowerCase()
    if (extension !== ".xcp" && extension !== ".zip") throw new Error("Only .xcp and .zip content packs are supported")
    const archiveStat = await stat(selectedPath)
    if (!archiveStat.isFile() || archiveStat.size > maxArchiveBytes) {
      throw new Error("Content pack archive exceeds the 256 MiB size limit")
    }
    const installed = await installContentPackArchive(await readFile(selectedPath), this.deps.userDataDirectory, {
      currentAppVersion: this.deps.appVersion,
    })
    const summary = summaryFromManifest(installed.manifest, "installed", installed.installedAt)
    this.broadcastChanged("installed")
    return summary
  }

  public async remove(request: RemoveContentPackRequest): Promise<boolean> {
    const pack = (await this.list()).find(
      (candidate) => candidate.id === request.id && candidate.version === request.version,
    )
    if (!pack) return false
    if (!pack.removable) throw new Error("The built-in original fleet cannot be removed")
    if (!(await this.deps.confirmRemoval(pack))) return false
    const removed = await removeInstalledContentPack(this.deps.userDataDirectory, request.id, request.version)
    if (removed) this.broadcastChanged("removed")
    return removed
  }

  private broadcastChanged(reason: "installed" | "removed"): void {
    this.changed.emit({ reason })
    void this.send("contentPacksChanged", { reason }).catch((error: unknown) => {
      console.warn("[xingchao] content pack broadcast failed:", error)
    })
  }
}
