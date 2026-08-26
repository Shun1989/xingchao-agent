import type { CaptainAppEventInput, AppShellRoute } from "../../src/components/app-shell/app-shell-types.ts"
import type {
  CaptainLifecycleEvent,
  CaptainLifecycleSource,
} from "../../src/components/app-shell/useCaptainAppEvents.ts"
import type { AppContextValue } from "../../src/components/AppContext.ts"

import * as React from "react"
import { CaptainAppShellRouteContinuity } from "../../src/components/app-shell/CaptainAppShellRouteContinuity.tsx"
import { AppContext } from "../../src/components/AppContext.ts"
import { CaptainOrchestrator } from "../../src/components/captain/CaptainOrchestrator.tsx"
import { useFleetSkin } from "../../src/components/fleet-skin-context.ts"
import { FleetSkinProvider } from "../../src/components/FleetSkinProvider.tsx"
import { RuntimeFleetContext } from "../../src/components/runtime-fleet-context.ts"
import { RuntimeFleetProvider } from "../../src/components/RuntimeFleetProvider.tsx"
import { builtinRuntimeFleetSnapshot } from "../../src/domain/xingchao/runtime-fleet.ts"
import { I18nProvider } from "../../src/i18n/index.ts"
import { fleetSkinAssetUrl } from "../../src/skins/fleet-skin-assets.ts"
import { createAcceptanceAssetLoader, FAILING_REQUIRED_ASSET_ID } from "./fixtures/failing-required-asset.ts"
import { acceptanceBridge } from "./fleet-e2e-bridge.ts"

const acceptanceContentPackService = {
  invoke(method: string) {
    return method === "runtimeFleet"
      ? Promise.resolve(builtinRuntimeFleetSnapshot)
      : Promise.reject(new Error(`Unexpected fleet acceptance service method: ${method}`))
  },
  serverEvents: {
    on: () => () => undefined,
  },
} as unknown as AppContextValue["contentPackService"]

const acceptanceAppContext = {
  contentPackService: acceptanceContentPackService,
} as AppContextValue

class AcceptanceLifecycleSource implements CaptainLifecycleSource {
  private readonly listeners = new Set<(event: CaptainLifecycleEvent) => void>()

  subscribe(listener: (event: CaptainLifecycleEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: CaptainLifecycleEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

const acceptanceRoutes = ["fleet", "voyage", "connections", "settings"] as const satisfies readonly AppShellRoute[]

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function decodeDocumentImages(): Promise<void> {
  await Promise.all(
    [...document.images].map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true })
          image.addEventListener("error", () => reject(new Error(`Acceptance image failed: ${image.currentSrc}`)), {
            once: true,
          })
        })
      }
      if (typeof image.decode === "function") await image.decode()
    }),
  )
}

function AcceptanceReadyGate() {
  const runtimeFleet = React.useContext(RuntimeFleetContext)
  const fleetSkin = useFleetSkin()
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState("")
  const committedRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (ready || runtimeFleet?.status !== "ready" || fleetSkin.phase !== "idle" || !fleetSkin.skin) return
    let cancelled = false
    void (async () => {
      await document.fonts.ready
      await decodeDocumentImages()
      await nextFrame()
      await nextFrame()
      if (cancelled) return
      const crewId = fleetSkin.activeCrewId
      const root = document.documentElement
      const renderer = document.querySelector<HTMLElement>("[data-captain-renderer]")
      const style = getComputedStyle(root)
      const committed =
        root.dataset.fleetSkin === crewId &&
        renderer?.dataset.skinId === crewId &&
        style.getPropertyValue("--fleet-scene-backdrop").trim() !== "" &&
        style.getPropertyValue("--fleet-surface-card-material").trim() !== "" &&
        style.getPropertyValue("--fleet-audio-cue").trim() !== ""
      if (!committed) throw new Error(`Acceptance commit boundary incomplete for ${crewId}`)
      committedRef.current = crewId
      acceptanceBridge()?.lifecycle.push(`committed:${crewId}`)
      setReady(true)
    })().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Unknown acceptance readiness error")
    })
    return () => {
      cancelled = true
    }
  }, [fleetSkin, ready, runtimeFleet?.status])

  React.useLayoutEffect(() => {
    if (!ready || committedRef.current === null) return
    acceptanceBridge()?.lifecycle.push(`ready:${committedRef.current}`)
  }, [ready])

  return <output data-testid="fleet-e2e-ready" data-ready={String(ready)} data-ready-error={error} aria-hidden="true" />
}

function AcceptanceScene() {
  return (
    <div className="oo-fleet-scene" aria-hidden="true">
      <div className="oo-fleet-scene-backdrop" />
      <div className="oo-fleet-scene-scrim" />
      <div className="oo-fleet-scene-foreground" />
    </div>
  )
}

function AcceptancePage() {
  const fleetSkin = useFleetSkin()
  const [route, setRoute] = React.useState<AppShellRoute>("fleet")
  const [displayedStatus, setDisplayedStatus] = React.useState<CaptainAppEventInput["displayedStatus"]>("ready")
  const lifecycleSourceRef = React.useRef<AcceptanceLifecycleSource | null>(null)
  lifecycleSourceRef.current ??= new AcceptanceLifecycleSource()
  const eventInput: CaptainAppEventInput = {
    route,
    activeSessionId: "fleet-e2e-session",
    displayedStatus,
    agentStatus: { status: "ready" },
    pendingPermissions: [],
    activity: null,
    error: null,
  }

  const completeTask = () => {
    lifecycleSourceRef.current?.emit({ kind: "turn.completed", sessionId: "fleet-e2e-session" })
    setDisplayedStatus("ready")
  }

  const branchContent = (branch: "settings" | "workspace") => (
    <div className="oo-app-chrome" data-fleet-acceptance-root data-route-branch={branch}>
      <AcceptanceScene />
      <main
        data-captain-content
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) var(--fleet-captain-stage-width, 38%)",
          minHeight: "100vh",
          padding: "24px",
          position: "relative",
        }}
      >
        <section
          aria-label="舰队验收控制"
          style={{ alignContent: "start", display: "grid", gap: "16px", maxWidth: "760px", padding: "24px" }}
        >
          <nav aria-label="验收页面路由" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {acceptanceRoutes.map((candidate) => (
              <button
                key={candidate}
                type="button"
                data-testid={`route-${candidate}`}
                onClick={() => setRoute(candidate)}
              >
                {candidate}
              </button>
            ))}
          </nav>
          <section aria-label="舰队选择" style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(2, 1fr)" }}>
            {builtinRuntimeFleetSnapshot.crews.map((crew) => (
              <button
                key={crew.id}
                type="button"
                data-testid={`fleet-select-${crew.id}`}
                onClick={() => fleetSkin.requestCrew(crew.id)}
              >
                {crew.name}
              </button>
            ))}
          </section>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" data-testid="task-start" onClick={() => setDisplayedStatus("streaming")}>
              开始任务
            </button>
            <button type="button" data-testid="task-complete" onClick={completeTask}>
              完成任务
            </button>
          </div>
          <output
            data-testid="fleet-e2e-state"
            data-active-crew={fleetSkin.activeCrewId}
            data-phase={fleetSkin.phase}
            data-route={route}
            data-error={fleetSkin.error ?? ""}
          >
            {fleetSkin.activeCrewId}
          </output>
        </section>
        <div data-captain-host-slot aria-hidden="true" style={{ minHeight: "820px" }} />
      </main>
    </div>
  )

  return (
    <CaptainAppShellRouteContinuity
      activeProject={false}
      activeSessionId="fleet-e2e-session"
      activeTask={displayedStatus === "submitted" || displayedStatus === "streaming"}
      chatIsEmpty={false}
      eventInput={eventInput}
      lifecycleSource={lifecycleSourceRef.current}
      modalOpen={false}
      persistentChildren={<AcceptanceReadyGate />}
      route={route}
      settingsChildren={branchContent("settings")}
      viewportWidth={1440}
      workspaceChildren={branchContent("workspace")}
    />
  )
}

export function FleetSkinAcceptanceHarness() {
  const loader = React.useMemo(
    () => createAcceptanceAssetLoader(acceptanceBridge, fleetSkinAssetUrl(FAILING_REQUIRED_ASSET_ID)),
    [],
  )
  return (
    <I18nProvider>
      <AppContext.Provider value={acceptanceAppContext}>
        <RuntimeFleetProvider>
          <FleetSkinProvider loadAsset={loader}>
            <CaptainOrchestrator>
              <AcceptancePage />
            </CaptainOrchestrator>
          </FleetSkinProvider>
        </RuntimeFleetProvider>
      </AppContext.Provider>
    </I18nProvider>
  )
}
