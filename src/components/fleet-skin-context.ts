import type { CrewId } from "@/domain/xingchao/types.ts"
import type { ReadonlyFleetSkinManifest } from "@/skins/fleet-skins.ts"

import * as React from "react"

export interface FleetSkinContextValue {
  activeCrewId: CrewId
  skin: ReadonlyFleetSkinManifest | null
  requestCrew: (crewId: CrewId) => void
  phase: "idle" | "loading" | "committed" | "error"
  pendingCrewId: CrewId | null
  error: string | null
  retry: () => void
  preloadCrew: (crewId: CrewId) => void
}

export const FleetSkinContext = React.createContext<FleetSkinContextValue | null>(null)

export function useFleetSkin(): FleetSkinContextValue {
  const value = React.useContext(FleetSkinContext)
  if (!value) throw new Error("useFleetSkin must be used within FleetSkinProvider")
  return value
}
