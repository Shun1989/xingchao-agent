import type { CrewId, Mission } from "@/domain/xingchao/types.ts"

import { CheckCircle2, Circle, GitBranch, Play, ShieldAlert, Users } from "lucide-react"
import * as React from "react"
import { useRuntimeFleet } from "@/components/runtime-fleet-context.ts"
import { useXingchaoTheme } from "@/components/xingchao-theme-context.ts"
import { draftMissionForCrews, recommendCrews } from "@/domain/xingchao/routing.ts"
import { cn } from "@/lib/utils"

export function VoyageRoute({ onLaunch }: { onLaunch: (mission: Mission) => Promise<void> }) {
  const runtimeFleet = useRuntimeFleet()
  const { setActiveCrewId } = useXingchaoTheme()
  const [goal, setGoal] = React.useState("")
  const [primaryCrewId, setPrimaryCrewId] = React.useState<CrewId>("helm-order")
  const [supportCrewIds, setSupportCrewIds] = React.useState<CrewId[]>([])
  const [mission, setMission] = React.useState<Mission | null>(null)
  const [launching, setLaunching] = React.useState(false)

  const buildPlan = React.useCallback(
    (nextGoal: string) => {
      const recommendation = recommendCrews(nextGoal, runtimeFleet.index)
      const nextMission = draftMissionForCrews(
        nextGoal,
        recommendation.primary.id,
        recommendation.support.map((crew) => crew.id),
        runtimeFleet.index,
      )
      setPrimaryCrewId(nextMission.primaryCrewId)
      setSupportCrewIds(nextMission.supportCrewIds)
      setMission(nextMission)
    },
    [runtimeFleet.index],
  )
  const createPlan = () => {
    const trimmedGoal = goal.trim()
    if (!trimmedGoal) return
    buildPlan(trimmedGoal)
  }
  const refreshMission = (primary: CrewId, support: CrewId[]) =>
    setMission(draftMissionForCrews(mission?.goal ?? goal.trim(), primary, support, runtimeFleet.index))
  const choosePrimary = (crewId: CrewId) => {
    const support = supportCrewIds.filter((id) => id !== crewId)
    setPrimaryCrewId(crewId)
    setSupportCrewIds(support)
    refreshMission(crewId, support)
  }
  const toggleSupport = (crewId: CrewId) => {
    if (crewId === primaryCrewId) return
    const next = supportCrewIds.includes(crewId)
      ? supportCrewIds.filter((id) => id !== crewId)
      : [...supportCrewIds, crewId].slice(-2)
    setSupportCrewIds(next)
    refreshMission(primaryCrewId, next)
  }
  React.useEffect(() => {
    if (!mission || mission.fleetRevision === runtimeFleet.snapshot.revision) return
    buildPlan(mission.goal)
  }, [buildPlan, mission, runtimeFleet.snapshot.revision])

  const launch = async () => {
    if (!mission || mission.fleetRevision !== runtimeFleet.snapshot.revision) return
    setLaunching(true)
    setActiveCrewId(mission.primaryCrewId)
    try {
      await onLaunch(mission)
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="fleet-route h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[100rem] gap-6 px-8 py-8">
        <header>
          <p className="text-xs tracking-[.2em] text-primary">MISSION CHART</p>
          <h1 className="mt-1 text-3xl font-semibold">航海图</h1>
          <p className="mt-2 text-muted-foreground">澜汐先推荐团队；你确认或修改后，主团主题才会生效并进入执行。</p>
        </header>
        <section className="fleet-panel grid gap-4 p-5">
          <label className="text-sm font-medium" htmlFor="mission-goal">
            这次航程要交付什么？
          </label>
          <textarea
            id="mission-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            rows={4}
            placeholder="例如：调研三款竞品，形成带来源的分析报告，并制作一份可演示的 PPT。"
            className="fleet-input w-full resize-y border p-4 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
          />
          <div>
            <button type="button" className="fleet-button-primary" disabled={!goal.trim()} onClick={createPlan}>
              <GitBranch className="size-4" /> 推荐团队并生成航海图
            </button>
          </div>
        </section>
        {mission ? (
          <>
            <section className="fleet-panel p-5">
              <div className="mb-4 flex items-center gap-2">
                <Users className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">确认编队</h2>
                <span className="ml-auto text-xs text-muted-foreground">1 个主团 · 最多 2 个支援团</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                {runtimeFleet.snapshot.crews.map((crew) => (
                  <div
                    key={crew.id}
                    className={cn(
                      "rounded-xl border p-3",
                      primaryCrewId === crew.id &&
                        "border-primary bg-[color-mix(in_oklab,var(--primary)_12%,transparent)]",
                    )}
                  >
                    <strong className="text-sm">{crew.name}</strong>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{crew.domain}</p>
                    <div className="mt-3 flex gap-1">
                      <button
                        type="button"
                        className="rounded-md border px-2 py-1 text-[11px]"
                        onClick={() => choosePrimary(crew.id)}
                      >
                        主团
                      </button>
                      <button
                        type="button"
                        disabled={primaryCrewId === crew.id}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px]",
                          supportCrewIds.includes(crew.id) && "bg-secondary text-secondary-foreground",
                        )}
                        onClick={() => toggleSupport(crew.id)}
                      >
                        支援
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="fleet-panel p-5">
              <div className="mb-5 flex items-center gap-2">
                <GitBranch className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">任务 DAG</h2>
              </div>
              <div className="grid gap-3">
                {mission.nodes.map((node, index) => {
                  const agent = runtimeFleet.index.agentById.get(node.agentId)
                  const crew = runtimeFleet.index.crewById.get(node.crewId)
                  return (
                    <article
                      key={node.id}
                      className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-background/55 p-4"
                    >
                      <div className="relative grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{node.title}</h3>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{crew?.name}</span>
                          {node.risk === "medium" ? <ShieldAlert className="size-3.5 text-amber-600" /> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {agent?.name} · {node.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {node.dependsOn.length ? (
                          <>
                            <Circle className="size-3" />
                            依赖 {node.dependsOn.length}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="size-3" />
                            可开始
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
            <section className="flex items-center justify-between gap-4 rounded-2xl bg-primary p-5 text-primary-foreground">
              <div>
                <strong>确认后将切换至 {runtimeFleet.index.crewById.get(primaryCrewId)?.name} 主题</strong>
                <p className="mt-1 text-sm opacity-75">随后由现有 Agent 内核执行，危险操作仍会逐项审批。</p>
              </div>
              <button
                type="button"
                disabled={launching || mission.fleetRevision !== runtimeFleet.snapshot.revision}
                onClick={() => void launch()}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-background px-4 py-2.5 text-sm font-semibold text-primary"
              >
                <Play className="size-4" />
                {launching ? "正在启航…" : "确认并开始执行"}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
