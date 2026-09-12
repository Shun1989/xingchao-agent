import type { AppContextValue } from "@/components/AppContext"

import { ConnectionClient } from "@oomol/connection"
import { ElectronClientAdapter } from "@oomol/connection-electron-adapter/client"
import * as React from "react"
import { createRoot } from "react-dom/client"
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
