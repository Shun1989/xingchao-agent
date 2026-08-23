import * as React from "react"
import { useFleetSkin } from "@/components/fleet-skin-context.ts"
import { useRuntimeFleet } from "@/components/runtime-fleet-context.ts"
import { XingchaoThemeContext } from "@/components/xingchao-theme-context.ts"

export function XingchaoThemeProvider({ children }: { children: React.ReactNode }) {
  const runtimeFleet = useRuntimeFleet()
  const fleetSkin = useFleetSkin()
  const activeCrewId = runtimeFleet.index.crewById.has(fleetSkin.activeCrewId) ? fleetSkin.activeCrewId : "watchtide"
  const activeCrew = runtimeFleet.index.crewById.get(activeCrewId)!
  const theme = runtimeFleet.index.themeById.get(activeCrew.themeId)!
  const value = React.useMemo(
    () => ({ activeCrewId, setActiveCrewId: fleetSkin.requestCrew, theme }),
    [activeCrewId, fleetSkin.requestCrew, theme],
  )
  return <XingchaoThemeContext.Provider value={value}>{children}</XingchaoThemeContext.Provider>
}
