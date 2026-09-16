import type { AppContextValue } from "@/components/AppContext"

import * as React from "react"
import { createRoot } from "react-dom/client"
import { ConnectionClient } from "../../../electron/ipc/connection.ts"
import { ElectronClientAdapter } from "../../../electron/ipc/electron-client.ts"
import { MissionRunService } from "../../../electron/xingchao/mission-common.ts"
import { Controls } from "./controls.ts"
import { AppContext } from "@/components/AppContext"
import { builtinRuntimeFleetSnapshot } from "@/domain/xingchao/runtime-fleet.ts"
import { I18nContext, translate } from "@/i18n/i18n"
import { MissionHistory } from "@/routes/Voyage/MissionHistory.tsx"
import "./styles.css"

const client = new ConnectionClient(new ElectronClientAdapter())
client.start()
const missionRunService = client.use(MissionRunService)
const controls = client.use(Controls)
const probeEvents: string[] = []
let unsubscribeProbe: (() => void) | undefined
window.ipcSmoke = {
  events: probeEvents,
  subscribe() {
    unsubscribeProbe ??= controls.serverEvents.on("probe", (value) => probeEvents.push(value))
  },
  unsubscribe() {
    unsubscribeProbe?.()
    unsubscribeProbe = undefined
  },
  emit: (value) => controls.invoke("emitProbe", value),
  async invokeChecks() {
    const completionOrder: string[] = []
    const values = await Promise.all([
      controls.invoke("echo", "slow", 60).then((value) => {
        completionOrder.push("slow")
        return value
      }),
      controls.invoke("echo", "fast", 0).then((value) => {
        completionOrder.push("fast")
        return value
      }),
      controls.invoke("echo", null, 0),
      controls.invoke("echo", undefined, 0),
    ])
    const errors: string[] = []
    for (const method of ["failSync", "failAsync"] as const) {
      try {
        await controls.invoke(method)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
    let denied = ""
    try {
      await (controls.invoke as (method: string) => Promise<unknown>)("internalOnly")
    } catch (error) {
      denied = error instanceof Error ? error.message : String(error)
    }
    return { values, completionOrder, errors, denied, preservedUndefined: values[3] === undefined }
  },
}
export function Harness() {
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  return (
    <AppContext.Provider value={{ missionRunService } as AppContextValue}>
      <I18nContext.Provider
        value={{ locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) }}
      >
        <main className="min-h-screen bg-background p-6 text-foreground">
          <p data-testid="selected-session">{sessionId ?? "none"}</p>
          <MissionHistory
            activeSessionId={sessionId}
            fleetRevision={builtinRuntimeFleetSnapshot.revision}
            onOpenSession={setSessionId}
            onRetry={(run) => controls.invoke("retry", run.runId)}
          />
        </main>
      </I18nContext.Provider>
    </AppContext.Provider>
  )
}
createRoot(document.getElementById("root")!).render(<Harness />)
