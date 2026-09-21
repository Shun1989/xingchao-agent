import * as React from "react"
import { createRoot } from "react-dom/client"
import { CaptainAppShellSurface } from "@/components/app-shell/CaptainAppShellSurface"
import { CaptainOrchestrator } from "@/components/captain/CaptainOrchestrator"
import { FleetSkinProvider } from "@/components/FleetSkinProvider"
import { RuntimeFleetContext } from "@/components/runtime-fleet-context"
import { XingchaoThemeProvider } from "@/components/XingchaoThemeProvider"
import { builtinRuntimeFleetIndex, builtinRuntimeFleetSnapshot } from "@/domain/xingchao/runtime-fleet"
import { I18nProvider } from "@/i18n"
import { FleetHarborRoute } from "@/routes/Fleet"
import { VoyageRoute } from "@/routes/Voyage"
import "./route-polish.css"

const runtime = {
  snapshot: builtinRuntimeFleetSnapshot,
  index: builtinRuntimeFleetIndex,
  status: "ready" as const,
  error: null,
}
const lifecycle = { subscribe: () => () => {} }

export function Routes() {
  const [route, setRoute] = React.useState<"fleet" | "voyage">("fleet")
  return (
    <div className="oo-app-chrome h-screen bg-background text-foreground">
      <nav className="oo-toolbar flex h-12 items-center gap-5 border-b px-6" aria-label="验收导航">
        <strong>星潮航局</strong>
        <button onClick={() => setRoute("fleet")}>舰队港口</button>
        <button onClick={() => setRoute("voyage")}>航海图</button>
      </nav>
      <div style={{ height: "calc(100vh - 48px)" }}>
        <CaptainAppShellSurface
          route={route}
          activeProject={false}
          activeTask={false}
          activeSessionId={null}
          chatIsEmpty
          modalOpen={false}
          lifecycleSource={lifecycle}
          eventInput={{
            route,
            activeSessionId: null,
            displayedStatus: "ready",
            agentStatus: { status: "ready" },
            pendingPermissions: [],
            activity: null,
            error: null,
          }}
        >
          {route === "fleet" ? (
            <FleetHarborRoute onOpenVoyage={() => setRoute("voyage")} />
          ) : (
            <VoyageRoute
              onLaunch={async () => {
                throw new Error("Acceptance never executes model requests")
              }}
            />
          )}
        </CaptainAppShellSurface>
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <RuntimeFleetContext.Provider value={runtime}>
      <FleetSkinProvider>
        <XingchaoThemeProvider>
          <CaptainOrchestrator>
            <Routes />
          </CaptainOrchestrator>
        </XingchaoThemeProvider>
      </FleetSkinProvider>
    </RuntimeFleetContext.Provider>
  </I18nProvider>,
)
