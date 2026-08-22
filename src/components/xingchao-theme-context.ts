import type { RuntimeFleetTheme } from "@/domain/xingchao/runtime-fleet.ts"
import type { CrewId } from "@/domain/xingchao/types.ts"

import * as React from "react"

export interface XingchaoThemeContextValue {
  activeCrewId: CrewId
  setActiveCrewId: (crewId: CrewId) => void
  theme: RuntimeFleetTheme
}

export const XingchaoThemeContext = React.createContext<XingchaoThemeContextValue | null>(null)

export function useXingchaoTheme(): XingchaoThemeContextValue {
  const context = React.useContext(XingchaoThemeContext)
  if (!context) throw new Error("useXingchaoTheme must be used within XingchaoThemeProvider")
  return context
}
