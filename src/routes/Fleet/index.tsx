import { Anchor, Check, Compass, ShipWheel } from "lucide-react"
import * as React from "react"
import { LanxiStage } from "@/components/LanxiStage.tsx"
import { useRuntimeFleet } from "@/components/runtime-fleet-context.ts"
import { useXingchaoTheme } from "@/components/xingchao-theme-context.ts"
import { useT } from "@/i18n"
import { cn } from "@/lib/utils"

export function FleetHarborRoute({ onOpenVoyage }: { onOpenVoyage: () => void }) {
  const t = useT()
  const runtimeFleet = useRuntimeFleet()
  const { activeCrewId, setActiveCrewId, theme } = useXingchaoTheme()
  const crews = runtimeFleet.snapshot.crews
  const activeCrew = runtimeFleet.index.crewById.get(activeCrewId) ?? runtimeFleet.index.crewById.get("watchtide")!
  const members = runtimeFleet.index.agentsForCrew(activeCrew.id)

  return (
    <div className="xingchao-route h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[110rem] gap-6 px-8 py-8">
        <section className="xingchao-hero grid min-h-[22rem] grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)] overflow-hidden rounded-2xl border max-[900px]:grid-cols-1">
          <div className="relative z-10 flex flex-col justify-center gap-5 p-8 lg:p-12">
            <div className="flex items-center gap-2 text-sm tracking-[.18em] text-[var(--xingchao-primary)]">
              <Compass className="size-4" /> 星潮航局 · 舰队港口
            </div>
            <div>
              <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--xingchao-foreground)]">
                十团协作，不止角色扮演
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[color-mix(in_srgb,var(--xingchao-foreground)_72%,transparent)]">
                澜汐负责识别目标、推荐团队与最终复核。每位船长和船员拥有独立人格、专业边界、工具白名单与评测任务。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="xingchao-primary-button" type="button" onClick={onOpenVoyage}>
                <ShipWheel className="size-4" /> 规划新航程
              </button>
              <span className="flex items-center gap-2 rounded-full border bg-background/60 px-4 py-2 text-sm">
                <Check className="size-4 text-[var(--xingchao-primary)]" />
                {t("fleet.runtimeCount", {
                  crews: crews.length,
                  agents: runtimeFleet.snapshot.agents.length,
                })}
              </span>
              <span className="flex items-center rounded-full border bg-background/60 px-4 py-2 text-sm">
                {t("fleet.builtinCount")}
              </span>
            </div>
          </div>
          <LanxiStage state="idle" overlayName={theme.live2dOverlay} />
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs tracking-[.2em] text-muted-foreground">FLEET THEMES</p>
              <h2 className="mt-1 text-2xl font-semibold">选择主团，工作台随之换肤</h2>
            </div>
            <span className="text-sm text-muted-foreground">当前：{theme.name}</span>
          </div>
          {runtimeFleet.status === "fallback" && (
            <p
              className="mb-4 rounded-lg border border-amber-400/40 bg-amber-50/70 px-4 py-3 text-sm text-amber-950"
              role="status"
            >
              {t("fleet.runtimeFallback")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {crews.map((crew) => {
              const crewTheme = runtimeFleet.index.themeById.get(crew.themeId)!
              return (
                <button
                  data-crew-id={crew.id}
                  key={crew.id}
                  type="button"
                  onClick={() => setActiveCrewId(crew.id)}
                  className={cn("xingchao-crew-card text-left", activeCrewId === crew.id && "is-active")}
                  style={
                    {
                      "--crew-color": crewTheme.primary,
                      "--crew-accent": crewTheme.accent,
                    } as React.CSSProperties
                  }
                >
                  <span className="mb-4 block h-1.5 w-12 rounded-full bg-[var(--crew-color)]" />
                  <strong className="block text-base">{crew.name}</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{crew.domain}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="grid grid-cols-[minmax(16rem,.7fr)_minmax(0,1.3fr)] gap-5 max-[900px]:grid-cols-1">
          <article className="xingchao-panel p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-[var(--xingchao-primary)] text-white">
                <Anchor className="size-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">当前主团</p>
                <h2 className="text-xl font-semibold">{activeCrew.name}</h2>
              </div>
            </div>
            <p className="mt-5 leading-7 text-muted-foreground">{activeCrew.description}</p>
            <blockquote className="mt-5 border-l-2 border-[var(--xingchao-secondary)] pl-4 font-serif text-lg">
              “{activeCrew.motto}”
            </blockquote>
            <div className="mt-5 flex flex-wrap gap-2">
              {activeCrew.routingSignals.slice(0, 6).map((signal) => (
                <span key={signal} className="rounded-full bg-muted px-3 py-1 text-xs">
                  {signal}
                </span>
              ))}
            </div>
          </article>
          <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1 xl:grid-cols-3">
            {members.map((agent) => (
              <article data-agent-id={agent.id} key={agent.id} className="xingchao-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--xingchao-primary)]">
                      {agent.role === "captain" ? "船长" : "船员"}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">{agent.name}</h3>
                    <p className="text-sm text-muted-foreground">{agent.title}</p>
                  </div>
                  <span className="size-3 rounded-full bg-[var(--xingchao-accent)]" />
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{agent.biography}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {agent.capabilities.map((capability) => (
                    <span key={capability.id} className="rounded bg-muted px-2 py-1 text-[11px]">
                      {capability.label}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
