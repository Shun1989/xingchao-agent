import type { MissionRunSummary } from "../../electron/xingchao/mission-common.ts"

import * as React from "react"
import { useMissionRunService } from "@/components/AppContext"

export interface MissionHistoryState {
  items: MissionRunSummary[]
  loading: boolean
  error: "read" | "save" | null
  busy: string | null
  refresh(): Promise<void>
  repair(runId: string): Promise<void>
}

export function useMissionRuns(): MissionHistoryState {
  const service = useMissionRunService()
  const [items, setItems] = React.useState<MissionRunSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<MissionHistoryState["error"]>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const sequence = React.useRef(0)
  const mounted = React.useRef(false)
  const saving = React.useRef(false)
  const refresh = React.useCallback(async () => {
    const request = ++sequence.current
    try {
      const next = await service.invoke("list")
      if (!mounted.current || request !== sequence.current) return
      setItems(next)
      setError(null)
    } catch {
      if (mounted.current && request === sequence.current) setError("read")
    } finally {
      if (mounted.current && request === sequence.current) setLoading(false)
    }
  }, [service])
  React.useEffect(() => {
    mounted.current = true
    const off = service.serverEvents.on("missionRunChanged", () => void refresh())
    void refresh()
    return () => {
      mounted.current = false
      ++sequence.current
      off()
    }
  }, [refresh, service])
  const repair = React.useCallback(
    async (runId: string) => {
      if (saving.current) return
      saving.current = true
      setBusy(runId)
      setError(null)
      try {
        await service.invoke("retrySettlement", runId)
        if (mounted.current) await refresh()
      } catch {
        if (mounted.current) setError("save")
      } finally {
        saving.current = false
        if (mounted.current) setBusy(null)
      }
    },
    [refresh, service],
  )
  return { items, loading, error, busy, refresh, repair }
}
