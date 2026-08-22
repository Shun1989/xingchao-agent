import type { BuiltinCrewId, CrewId } from "@/domain/xingchao/types.ts"

import * as React from "react"
import { storageKey } from "../../electron/branding.ts"
import { useRuntimeFleet } from "@/components/runtime-fleet-context.ts"
import { XingchaoThemeContext } from "@/components/xingchao-theme-context.ts"

const selectedCrewStorageKey = storageKey("activeCrew")
const fallbackCrewId: BuiltinCrewId = "watchtide"

export function XingchaoThemeProvider({ children }: { children: React.ReactNode }) {
  const runtimeFleet = useRuntimeFleet()
  const [requestedCrewId, setRequestedCrewId] = React.useState<CrewId>(
    () => globalThis.localStorage?.getItem(selectedCrewStorageKey) ?? fallbackCrewId,
  )
  const activeCrewId = runtimeFleet.index.crewById.has(requestedCrewId) ? requestedCrewId : fallbackCrewId
  const activeCrew = runtimeFleet.index.crewById.get(activeCrewId)!
  const theme = runtimeFleet.index.themeById.get(activeCrew.themeId)!

  React.useLayoutEffect(() => {
    if (requestedCrewId === activeCrewId) return
    globalThis.localStorage?.removeItem(selectedCrewStorageKey)
    setRequestedCrewId(fallbackCrewId)
  }, [activeCrewId, requestedCrewId, runtimeFleet.snapshot.revision])

  React.useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.crew = activeCrewId
    root.style.setProperty("--xingchao-primary", theme.primary)
    root.style.setProperty("--xingchao-secondary", theme.secondary)
    root.style.setProperty("--xingchao-accent", theme.accent)
    root.style.setProperty("--xingchao-surface", theme.surface)
    root.style.setProperty("--xingchao-foreground", theme.foreground)
  }, [activeCrewId, theme])

  const setActiveCrewId = React.useCallback(
    (crewId: CrewId) => {
      if (!runtimeFleet.index.crewById.has(crewId)) return
      setRequestedCrewId(crewId)
      globalThis.localStorage?.setItem(selectedCrewStorageKey, crewId)
    },
    [runtimeFleet.index],
  )

  const value = React.useMemo(() => ({ activeCrewId, setActiveCrewId, theme }), [activeCrewId, setActiveCrewId, theme])
  return <XingchaoThemeContext.Provider value={value}>{children}</XingchaoThemeContext.Provider>
}
