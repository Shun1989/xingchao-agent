import type { RuntimeFleetSnapshot } from "../../src/domain/xingchao/runtime-fleet.ts"
import type { PackVisibility } from "../../src/domain/xingchao/types.ts"

import { serviceName } from "../branding.ts"
import { defineService } from "../ipc/connection.ts"

export interface ContentPackSummary {
  agentCount: number
  crewCount: number
  description: string
  id: string
  installedAt: number | null
  minimumAppVersion: string
  name: string
  removable: boolean
  selected: boolean
  source: "builtin" | "installed"
  themeCount: number
  version: string
  visibility: PackVisibility
}

export interface RemoveContentPackRequest {
  id: string
  version: string
}

export interface SetContentPackSelectionRequest {
  id: string
  selected: boolean
  version: string
}

export interface ContentPacksChangedEvent {
  reason: "installed" | "removed" | "selection-changed"
}

export type ContentPackService = typeof ContentPackService
export const ContentPackService = defineService<{
  ServerEvents: {
    contentPacksChanged: ContentPacksChangedEvent
  }
  ClientInvokes: {
    install(): Promise<ContentPackSummary | null>
    list(): Promise<ContentPackSummary[]>
    remove(request: RemoveContentPackRequest): Promise<boolean>
    runtimeFleet(): Promise<RuntimeFleetSnapshot>
    setSelection(request: SetContentPackSelectionRequest): Promise<boolean>
  }
}>(serviceName("content-pack-service"), {
  install: true,
  list: true,
  remove: true,
  runtimeFleet: true,
  setSelection: true,
})
