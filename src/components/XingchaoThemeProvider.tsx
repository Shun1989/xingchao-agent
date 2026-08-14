import type { CrewId } from "@/domain/xingchao/types.ts"

import * as React from "react"
import { storageKey } from "../../electron/branding.ts"
import { XingchaoThemeContext } from "@/components/xingchao-theme-context.ts"
import { crewById } from "@/domain/xingchao/crews.ts"

const selectedCrewStorageKey = storageKey("activeCrew")
const fallbackCrewId: CrewId = "watchtide"

function storedCrewId(): CrewId {
  const stored = globalThis.localStorage?.getItem(selectedCrewStorageKey) as CrewId | null
  return stored && crewById.has(stored) ? stored : fallbackCrewId
}

export function XingchaoThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeCrewId, setActiveCrewIdState] = React.useState<CrewId>(storedCrewId)
  const theme = crewById.get(activeCrewId)?.theme ?? crewById.get(fallbackCrewId)!.theme

  React.useEffect(() => {
    const root = document.documentElement
    root.dataset.crew = activeCrewId
    root.style.setProperty("--xingchao-primary", theme.primary)
    root.style.setProperty("--xingchao-secondary", theme.secondary)
    root.style.setProperty("--xingchao-accent", theme.accent)
    root.style.setProperty("--xingchao-surface", theme.surface)
    root.style.setProperty("--xingchao-foreground", theme.foreground)
  }, [activeCrewId, theme])

  const setActiveCrewId = React.useCallback((crewId: CrewId) => {
    if (!crewById.has(crewId)) return
    setActiveCrewIdState(crewId)
    globalThis.localStorage?.setItem(selectedCrewStorageKey, crewId)
  }, [])

  const value = React.useMemo(() => ({ activeCrewId, setActiveCrewId, theme }), [activeCrewId, setActiveCrewId, theme])
  return <XingchaoThemeContext.Provider value={value}>{children}</XingchaoThemeContext.Provider>
}
