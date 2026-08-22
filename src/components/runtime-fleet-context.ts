import type { RuntimeFleetIndex, RuntimeFleetSnapshot } from "@/domain/xingchao/runtime-fleet.ts"

import * as React from "react"

export interface RuntimeFleetContextValue {
  snapshot: RuntimeFleetSnapshot
  index: RuntimeFleetIndex
  status: "loading" | "ready" | "fallback"
  error: string | null
}

export const RuntimeFleetContext = React.createContext<RuntimeFleetContextValue | null>(null)

export function useRuntimeFleet(): RuntimeFleetContextValue {
  const value = React.useContext(RuntimeFleetContext)
  if (!value) throw new Error("useRuntimeFleet must be used within RuntimeFleetProvider")
  return value
}
