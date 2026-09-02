import type { VisualCase, VisualMode } from "./visual-case.ts"
import type { CaptainSnapshot, CaptainDisplayMode } from "@/captain/captain-types.ts"
import type { CaptainContextValue } from "@/components/captain/captain-context.ts"
import type { RuntimeFleetContextValue } from "@/components/runtime-fleet-context.ts"
import type { UseCaptainSpeechResult } from "@/hooks/useCaptainSpeech.ts"

import * as React from "react"
import { resolveCaptainWorkspaceLayout } from "@/captain/captain-layout.ts"
import { DEFAULT_CAPTAIN_VOICE_SETTINGS } from "@/captain/captain-voice.ts"
import { CaptainContext } from "@/components/captain/captain-context.ts"
import { CaptainHost } from "@/components/captain/CaptainHost.tsx"
import { useFleetSkin } from "@/components/fleet-skin-context.ts"
import { FleetSkinProvider } from "@/components/FleetSkinProvider.tsx"
import { RuntimeFleetContext } from "@/components/runtime-fleet-context.ts"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import { builtinRuntimeFleetIndex, builtinRuntimeFleetSnapshot } from "@/domain/xingchao/runtime-fleet.ts"
import { I18nProvider } from "@/i18n"

export function VisualCaseError({ reason }: { readonly reason: string }) {
  return (
    <main className="visual-error" data-testid="visual-case-error">
      <strong>Invalid visual case</strong>
      <span>{reason}</span>
    </main>
  )
}

const runtimeFleetValue: RuntimeFleetContextValue = Object.freeze({
  snapshot: builtinRuntimeFleetSnapshot,
  index: builtinRuntimeFleetIndex,
  status: "ready",
  error: null,
})

const snapshot: CaptainSnapshot = Object.freeze({
  state: "executing",
  expression: "focused",
  captionKey: "captain.executing",
  captionParams: Object.freeze({}),
  mouthLevel: 0,
  activeEventId: "visual-task",
  taskId: "visual-task",
})

const ignore = () => undefined

const speech: UseCaptainSpeechResult = Object.freeze({
  settings: DEFAULT_CAPTAIN_VOICE_SETTINGS,
  caption: null,
  current: null,
  queue: Object.freeze([]),
  availability: "unavailable",
  epochStatus: "active",
  lastFailure: null,
  request: ignore,
  setEnabled: ignore,
  setClickOnly: ignore,
  setVolume: ignore,
  setRate: ignore,
  mute: ignore,
  cancelTaskSpeech: ignore,
})

const captainValue: CaptainContextValue = Object.freeze({
  epoch: 1,
  snapshot,
  speech,
  acquireProducer: () => null,
})

const MODE_COPY: Readonly<Record<VisualMode, { label: string; route: "fleet" | "skills" | "settings" }>> = {
  stage: { label: "主舞台", route: "fleet" },
  companion: { label: "伴随层", route: "skills" },
  compact: { label: "紧凑状态", route: "settings" },
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function decodeDocumentImages(): Promise<void> {
  await Promise.all(
    [...document.images].map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true })
          image.addEventListener("error", () => reject(new Error(`Visual image failed: ${image.currentSrc}`)), {
            once: true,
          })
        })
      }
      if (typeof image.decode === "function") await image.decode()
    }),
  )
}

async function freezeDocumentAnimations(): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const animation of document.getAnimations()) {
      animation.pause()
      animation.currentTime = 0
    }
    await nextFrame()
  }
  const running = document
    .getAnimations()
    .filter((animation) => animation.playState === "running" || animation.playState === "pending")
  if (running.length > 0) throw new Error(`Visual animations did not freeze: ${running.length}`)
}

function VisualReadyGate({ visualCase }: { readonly visualCase: VisualCase }) {
  const fleetSkin = useFleetSkin()
  const [ready, setReady] = React.useState(false)
  const [readyError, setReadyError] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setReady(false)
    setReadyError("")
    if (fleetSkin.phase !== "idle" || fleetSkin.activeCrewId !== visualCase.crewId || !fleetSkin.skin) return

    void (async () => {
      await document.fonts.ready
      await decodeDocumentImages()
      await nextFrame()
      await nextFrame()
      await freezeDocumentAnimations()
      if (cancelled) return

      const host = document.querySelector<HTMLElement>("[data-captain-host]")
      const renderer = document.querySelector<HTMLElement>("[data-captain-renderer]")
      const expectedReducedMotion = String(visualCase.reducedMotion)
      if (
        document.documentElement.dataset.fleetSkin !== visualCase.crewId ||
        document.documentElement.dataset.fleetContrast !== visualCase.contrast ||
        host?.dataset.captainMode !== visualCase.mode ||
        renderer?.dataset.skinId !== visualCase.crewId ||
        renderer?.dataset.reducedMotion !== expectedReducedMotion
      ) {
        const slot = document.querySelector<HTMLElement>("[data-captain-host-slot]")
        const slotRect = slot?.getBoundingClientRect()
        const overlappingControls = slotRect
          ? [...document.querySelectorAll<HTMLElement>("[data-captain-safe-control]")]
              .filter((control) => !host?.contains(control))
              .map((control) => ({ control, rect: control.getBoundingClientRect() }))
              .filter(({ rect }) => rect.left < slotRect.right && rect.right > slotRect.left)
              .map(
                ({ control, rect }) =>
                  `${control.tagName.toLowerCase()}:${control.textContent?.trim().slice(0, 18) ?? ""}` +
                  `@${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}`,
              )
              .join("|")
          : "no-slot"
        throw new Error(
          `Visual case mismatch: rootSkin=${document.documentElement.dataset.fleetSkin ?? "none"}, ` +
            `contrast=${document.documentElement.dataset.fleetContrast ?? "none"}, ` +
            `hostMode=${host?.dataset.captainMode ?? "none"}, rendererSkin=${renderer?.dataset.skinId ?? "none"}, ` +
            `reducedMotion=${renderer?.dataset.reducedMotion ?? "none"}, ` +
            `slot=${slotRect ? `${Math.round(slotRect.left)},${Math.round(slotRect.top)},${Math.round(slotRect.right)},${Math.round(slotRect.bottom)}` : "none"}, ` +
            `horizontalControls=${overlappingControls}`,
        )
      }
      setReady(true)
    })().catch((cause: unknown) => {
      if (!cancelled) setReadyError(cause instanceof Error ? cause.message : "Unknown visual readiness error")
    })

    return () => {
      cancelled = true
    }
  }, [fleetSkin.activeCrewId, fleetSkin.phase, fleetSkin.skin, visualCase])

  return (
    <div
      className="visual-ready"
      data-testid="visual-case-ready"
      data-ready={String(ready)}
      data-ready-error={readyError}
      data-phase={fleetSkin.phase}
      data-active-crew={fleetSkin.activeCrewId}
      data-skin={fleetSkin.skin?.identity.crewId ?? "none"}
      aria-hidden="true"
    />
  )
}

function Scene() {
  return (
    <div className="oo-fleet-scene" aria-hidden="true">
      <div className="oo-fleet-scene-backdrop" />
      <div className="oo-fleet-scene-midground" />
      <div className="oo-fleet-scene-scrim" />
      <div className="oo-fleet-scene-light" />
      <div className="oo-fleet-scene-foreground" />
    </div>
  )
}

const NAVIGATION_ITEMS = ["指挥甲板", "航海日志", "船员编组", "技能舱", "连接舱"] as const

function Sidebar() {
  return (
    <aside className="oo-sidebar visual-sidebar fleet-navigation" aria-label="舰队导航">
      <div className="visual-brand">
        <span className="visual-crest" aria-hidden="true" />
        <span>
          <strong>星潮航局</strong>
          <small>FLEET COMMAND</small>
        </span>
      </div>
      <nav className="visual-navigation">
        {NAVIGATION_ITEMS.map((item, index) => (
          <div key={item} className="oo-sidebar-nav-item" aria-current={index === 0 ? "page" : undefined}>
            <span className="visual-nav-mark" aria-hidden="true" />
            {item}
          </div>
        ))}
      </nav>
      <div className="visual-sidebar-status fleet-card">
        <span className="visual-status-dot" />
        <span>
          <small>航线状态</small>
          <strong>全舰待命</strong>
        </span>
      </div>
    </aside>
  )
}

function Titlebar({ visualCase }: { readonly visualCase: VisualCase }) {
  return (
    <header className="oo-toolbar oo-main-titlebar visual-titlebar" data-visual-titlebar>
      <span className="visual-eyebrow">舰队皮肤视觉校验</span>
      <div className="visual-titlebar-meta">
        <span>{MODE_COPY[visualCase.mode].label}</span>
        <span>{visualCase.contrast === "high" ? "高对比度" : "标准对比度"}</span>
        <span>{visualCase.reducedMotion ? "减少动效" : "标准动效"}</span>
        <time dateTime="2026-08-23T08:00:00+08:00">08:00 CST</time>
      </div>
    </header>
  )
}

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail: string }) {
  return (
    <Card className="visual-metric fleet-card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle data-numeric>{value}</CardTitle>
      </CardHeader>
      <CardContent>{detail}</CardContent>
    </Card>
  )
}

function Content({ visualCase }: { readonly visualCase: VisualCase }) {
  const { skin } = useFleetSkin()
  const modeCopy = MODE_COPY[visualCase.mode]

  return (
    <main className="oo-content-surface visual-content fleet-route" data-captain-content>
      <section className="visual-dashboard">
        <div className="visual-primary-column">
          <section className="fleet-hero visual-hero">
            <span className="visual-overline">ACTIVE FLEET · {skin?.identity.version ?? "1.0.0"}</span>
            <h1>{skin?.identity.name ?? "舰队装载中"}</h1>
            <p>{skin?.identity.description ?? "正在进行原子皮肤切换。"}</p>
            <div className="visual-hero-actions">
              <Button className="fleet-button-primary">启动巡航任务</Button>
              <span className="visual-route-chip">{modeCopy.label}</span>
            </div>
          </section>

          <section className="visual-metric-grid" aria-label="舰队状态概览">
            <Metric label="活跃任务" value="12" detail="3 支协作小队正在执行" />
            <Metric label="航线完整度" value="98.6%" detail="资源与组件已同步提交" />
            <Metric label="响应时延" value="42 ms" detail="输入与关键控制保持畅通" />
          </section>

          <section className="visual-lower-grid">
            <Card className="visual-form-card fleet-card">
              <CardHeader>
                <CardTitle>新建航线指令</CardTitle>
                <CardDescription>输入任务目标，舰长会协调合适的船员。</CardDescription>
              </CardHeader>
              <CardContent>
                <label htmlFor="visual-command">任务目标</label>
                <Input id="visual-command" className="fleet-input" value="整理本周舰队行动摘要" readOnly />
              </CardContent>
            </Card>

            <section className="fleet-dialog visual-dialog-preview" aria-label="确认任务对话框预览">
              <span className="visual-dialog-kicker">需要确认</span>
              <h2>批准这条航线？</h2>
              <p>任务将在本地工作区运行，完成后返回可审计报告。</p>
              <div className="visual-dialog-actions">
                <Button variant="outline">稍后处理</Button>
                <Button>确认启航</Button>
              </div>
            </section>
          </section>
        </div>
        <div className="visual-captain-slot" data-captain-host-slot aria-hidden="true" />
      </section>
    </main>
  )
}

function Captain({ mode }: { readonly mode: CaptainDisplayMode }) {
  const route = MODE_COPY[mode].route
  const decision = resolveCaptainWorkspaceLayout({
    route,
    activeSessionId: mode === "companion" ? "visual-session" : null,
    chatIsEmpty: mode !== "companion",
    activeProject: false,
    activeTask: mode === "companion",
    modalOpen: false,
    viewportWidth: mode === "compact" ? 1024 : 1440,
  })
  return <CaptainHost decision={decision} />
}

function DeferredCaptain({ mode }: { readonly mode: CaptainDisplayMode }) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return mounted ? <Captain mode={mode} /> : null
}

function HarnessPage({ visualCase }: { readonly visualCase: VisualCase }) {
  return (
    <div className="oo-app-chrome visual-shell">
      <Scene />
      <div className="oo-app-workspace visual-workspace">
        <Sidebar />
        <Titlebar visualCase={visualCase} />
        <Content visualCase={visualCase} />
      </div>
      <DeferredCaptain mode={visualCase.mode} />
      <VisualReadyGate visualCase={visualCase} />
    </div>
  )
}

export function VisualHarness({ visualCase }: { readonly visualCase: VisualCase }) {
  return (
    <I18nProvider>
      <RuntimeFleetContext.Provider value={runtimeFleetValue}>
        <FleetSkinProvider>
          <CaptainContext.Provider value={captainValue}>
            <HarnessPage visualCase={visualCase} />
          </CaptainContext.Provider>
        </FleetSkinProvider>
      </RuntimeFleetContext.Provider>
    </I18nProvider>
  )
}
