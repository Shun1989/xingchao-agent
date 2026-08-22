import type { RuntimeFleetContextValue } from "./runtime-fleet-context.ts"

import * as React from "react"
import { RuntimeFleetContext } from "./runtime-fleet-context.ts"
import { useContentPackService } from "@/components/AppContext"
import { builtinRuntimeFleetSnapshot, indexRuntimeFleet } from "@/domain/xingchao/runtime-fleet.ts"
import { useT } from "@/i18n"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { errorMessage } from "@/lib/user-facing-error.ts"

function builtinValue(
  status: Extract<RuntimeFleetContextValue["status"], "loading" | "fallback">,
  error: string | null,
): RuntimeFleetContextValue {
  return {
    snapshot: builtinRuntimeFleetSnapshot,
    index: indexRuntimeFleet(builtinRuntimeFleetSnapshot),
    status,
    error,
  }
}

export function RuntimeFleetProvider({ children }: { children: React.ReactNode }) {
  const service = useContentPackService()
  const t = useT()
  const generationRef = React.useRef(0)
  const mountedRef = React.useRef(false)
  const [value, setValue] = React.useState<RuntimeFleetContextValue>(() => builtinValue("loading", null))

  const load = React.useCallback(() => {
    const generation = ++generationRef.current
    setValue(builtinValue("loading", null))
    void service
      .invoke("runtimeFleet")
      .then((snapshot) => {
        const index = indexRuntimeFleet(snapshot)
        if (mountedRef.current && generation === generationRef.current) {
          setValue({ snapshot, index, status: "ready", error: null })
        }
      })
      .catch((cause: unknown) => {
        if (!mountedRef.current || generation !== generationRef.current) return
        reportRendererHandledError("runtime-fleet", "runtime fleet refresh failed", cause)
        setValue(builtinValue("fallback", t("runtimeFleet.loadFailed", { error: errorMessage(cause) })))
      })
  }, [service, t])

  React.useEffect(() => {
    mountedRef.current = true
    load()
    const unsubscribe = service.serverEvents.on("contentPacksChanged", load)
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [load, service])

  return <RuntimeFleetContext.Provider value={value}>{children}</RuntimeFleetContext.Provider>
}
