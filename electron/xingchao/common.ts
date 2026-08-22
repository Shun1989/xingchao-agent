import type { RuntimeFleetSnapshot } from "../../src/domain/xingchao/runtime-fleet.ts"
import type { PackVisibility } from "../../src/domain/xingchao/types.ts"
import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

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
export const ContentPackService = serviceName("content-pack-service") as ServiceName<{
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
}>
