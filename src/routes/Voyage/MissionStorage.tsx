import type { MissionStorageStatus } from "../../../electron/xingchao/mission-common.ts"

import * as React from "react"
import { useMissionRunService } from "@/components/AppContext"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/i18n"

export function MissionStorage({ onRestored }: { onRestored(): Promise<void> }) {
  const service = useMissionRunService()
  const t = useT()
  const [status, setStatus] = React.useState<MissionStorageStatus | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<"exported" | "restored" | "failed" | null>(null)
  const inFlight = React.useRef(false)
  const mounted = React.useRef(false)
  const sequence = React.useRef(0)
  const refresh = React.useCallback(async () => {
    const request = ++sequence.current
    try {
      const value = await service.invoke("storageStatus")
      if (mounted.current && request === sequence.current) setStatus(value)
    } catch {
      if (mounted.current && request === sequence.current) setStatus({ state: "unavailable" })
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
  const run = async (method: "exportHistory" | "restoreHistory") => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const result = await service.invoke(method)
      if (!mounted.current) return
      if (result === "done") {
        setNotice(method === "exportHistory" ? "exported" : "restored")
        if (method === "restoreHistory") await onRestored()
      }
      await refresh()
    } catch {
      if (mounted.current) setNotice("failed")
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <section className="fleet-panel min-w-0 space-y-3 p-5" aria-label={t("missionStorage.title")}>
      <h2 className="font-semibold">{t("missionStorage.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("missionStorage.retention")}</p>
      {status?.state === "ready" ? (
        <>
          <p className="text-sm">{t("missionStorage.usage", { count: status.runCount, max: status.maxRuns })}</p>
          {status.runCount >= status.maxRuns * 0.9 || status.bytes >= status.maxBytes * 0.9 ? (
            <p role="alert">{t("missionStorage.capacity")}</p>
          ) : null}
          {status.persistencePending ? <p role="alert">{t("missionStorage.pending")}</p> : null}
          <Button
            variant="outline"
            disabled={busy || status.persistencePending}
            onClick={() => void run("exportHistory")}
          >
            {t("missionStorage.export")}
          </Button>
        </>
      ) : status ? (
        <>
          <p role="alert">{t(status.state === "corrupt" ? "missionStorage.corrupt" : "missionStorage.unavailable")}</p>
          <div className="flex flex-wrap gap-2">
            {status.state === "corrupt" ? (
              <Button disabled={busy} onClick={() => void run("restoreHistory")}>
                {t("missionStorage.restore")}
              </Button>
            ) : null}
            <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
              {t("missionHistory.refresh")}
            </Button>
          </div>
        </>
      ) : null}
      {notice ? <p role={notice === "failed" ? "alert" : "status"}>{t(`missionStorage.${notice}`)}</p> : null}
    </section>
  )
}
