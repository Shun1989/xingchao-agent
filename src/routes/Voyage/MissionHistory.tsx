import type { MissionRunSummary } from "../../../electron/xingchao/mission-common.ts"
import type { MissionHistoryState } from "@/hooks/useMissionRuns.ts"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { useMissionRuns } from "@/hooks/useMissionRuns.ts"
import { useT } from "@/i18n/i18n"

export interface MissionHistoryProps {
  activeSessionId?: string | null
  fleetRevision: string
  onRetry(run: MissionRunSummary): Promise<void>
  onOpenSession(sessionId: string): void
}

export function MissionHistory(props: MissionHistoryProps) {
  const history = useMissionRuns()
  return <MissionHistoryView {...props} history={history} />
}

export function MissionHistoryView({
  history,
  fleetRevision,
  activeSessionId,
  onRetry,
  onOpenSession,
}: MissionHistoryProps & { history: MissionHistoryState }) {
  const t = useT()
  const [confirmId, setConfirmId] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [limit, setLimit] = React.useState(20)
  const inFlight = React.useRef(false)
  const latest = new Map<string, number>()
  for (const run of history.items) latest.set(run.missionId, Math.max(latest.get(run.missionId) ?? 0, run.attempt))
  const canRetry = (run: MissionRunSummary) =>
    ["blocked", "failed", "cancelled"].includes(run.status) &&
    !run.persistencePending &&
    run.attempt === latest.get(run.missionId) &&
    run.fleetRevision === fleetRevision &&
    Boolean(run.sessionId) &&
    run.sessionId === activeSessionId &&
    !history.error &&
    !history.loading
  const execute = async (run: MissionRunSummary) => {
    if (inFlight.current || !canRetry(run)) return
    inFlight.current = true
    setSending(true)
    setFailed(false)
    try {
      await onRetry(run)
      setConfirmId(null)
      await history.refresh()
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }
  return (
    <section className="fleet-panel min-w-0 space-y-4 p-5" aria-label={t("missionHistory.title")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("missionHistory.title")}</h2>
        <Button variant="outline" onClick={() => void history.refresh()}>
          {t("missionHistory.refresh")}
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">{t("missionHistory.description")}</p>
      {history.error || failed ? (
        <p role="alert" className="text-sm text-destructive">
          {t(
            history.error === "read"
              ? "missionHistory.readFailed"
              : history.error === "save"
                ? "missionHistory.saveFailed"
                : "missionHistory.retryFailed",
          )}
        </p>
      ) : null}
      {history.loading ? <p role="status">{t("missionHistory.loading")}</p> : null}
      {!history.loading && !history.error && history.items.length === 0 ? <p>{t("missionHistory.empty")}</p> : null}
      {history.items.slice(0, limit).map((run) => (
        <article key={run.runId} className="min-w-0 space-y-3 rounded-xl border bg-background/55 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 font-medium break-words">{run.goal}</h3>
            <span className="text-sm">
              {t("missionHistory.attempt", { count: run.attempt })} · {t(`missionHistory.status.${run.status}`)}
            </span>
          </div>
          <time className="text-xs text-muted-foreground" dateTime={new Date(run.updatedAt).toISOString()}>
            {new Date(run.updatedAt).toLocaleString()}
          </time>
          {run.persistencePending ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{t("missionHistory.saveFailed")}</p>
              <Button variant="outline" disabled={history.busy !== null} onClick={() => void history.repair(run.runId)}>
                {t("missionHistory.repair")}
              </Button>
            </div>
          ) : null}
          <details className="text-sm">
            <summary className="cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-ring">
              {t("missionHistory.events")}
            </summary>
            <ol className="mt-2 space-y-1 border-l pl-4">
              {[...run.events]
                .sort((a, b) => a.sequence - b.sequence)
                .map((event) => (
                  <li key={event.sequence}>
                    <span className="text-muted-foreground">
                      #{event.sequence} · {new Date(event.at).toLocaleString()}
                    </span>
                    {" · "}
                    {t(`missionHistory.status.${event.status}`)}
                    {event.reason ? ` — ${t(`missionHistory.reason.${event.reason}`)}` : ""}
                  </li>
                ))}
            </ol>
          </details>
          {["blocked", "failed", "cancelled"].includes(run.status) && run.fleetRevision !== fleetRevision ? (
            <p className="text-sm text-muted-foreground">{t("missionHistory.staleFleet")}</p>
          ) : null}
          {["blocked", "failed", "cancelled"].includes(run.status) &&
          run.sessionId &&
          run.sessionId !== activeSessionId ? (
            <p className="text-sm text-muted-foreground">{t("missionHistory.openOriginalFirst")}</p>
          ) : null}
          {["blocked", "failed", "cancelled"].includes(run.status) && !run.sessionId ? (
            <p className="text-sm text-muted-foreground">{t("missionHistory.missingSession")}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {run.sessionId ? (
              <Button variant="outline" onClick={() => onOpenSession(run.sessionId!)}>
                {t("missionHistory.open")}
              </Button>
            ) : null}
            {canRetry(run) ? (
              <Button
                disabled={sending}
                onClick={() => {
                  setFailed(false)
                  setConfirmId(run.runId)
                }}
              >
                {t("missionHistory.retry")}
              </Button>
            ) : null}
          </div>
          {confirmId === run.runId && canRetry(run) ? (
            <div
              role="region"
              aria-label={t("missionHistory.confirm")}
              className="space-y-3 rounded-lg border border-primary p-3"
            >
              <p className="text-sm">{t("missionHistory.confirmNotice")}</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={sending} onClick={() => void execute(run)}>
                  {t("missionHistory.confirm")}
                </Button>
                <Button variant="outline" disabled={sending} onClick={() => setConfirmId(null)}>
                  {t("missionHistory.cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </article>
      ))}
      {history.items.length > limit ? (
        <Button variant="outline" onClick={() => setLimit((value) => value + 20)}>
          {t("missionHistory.more")}
        </Button>
      ) : null}
    </section>
  )
}
