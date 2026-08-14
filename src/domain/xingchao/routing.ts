import type { CrewId, CrewProfile, Mission, MissionNode } from "./types.ts"

import { agents, crewById, crews } from "./crews.ts"

export interface CrewRecommendation {
  primary: CrewProfile
  support: CrewProfile[]
  scores: Array<{ crewId: CrewId; score: number; matchedSignals: string[] }>
  reason: string
}

function scoreCrew(input: string, crew: CrewProfile): { score: number; matchedSignals: string[] } {
  const normalized = input.toLocaleLowerCase()
  const matchedSignals = crew.routingSignals.filter((signal) => normalized.includes(signal.toLocaleLowerCase()))
  const supportMatches = crew.supportSignals.filter((signal) => normalized.includes(signal.toLocaleLowerCase()))
  const earliestPrimaryIntent = matchedSignals.reduce((earliest, signal) => {
    const index = normalized.indexOf(signal.toLocaleLowerCase())
    return index < 0 ? earliest : Math.min(earliest, index)
  }, Number.POSITIVE_INFINITY)
  const leadingIntentBonus = earliestPrimaryIntent < 8 ? 10 : 0
  return {
    score: matchedSignals.length * 3 + supportMatches.length + leadingIntentBonus,
    matchedSignals: [...matchedSignals, ...supportMatches],
  }
}

export function recommendCrews(input: string): CrewRecommendation {
  const fleetPriority = new Map(crews.map((crew, index) => [crew.id, index]))
  const scores = crews
    .map((crew) => ({ crew, ...scoreCrew(input, crew) }))
    .sort(
      (left, right) =>
        right.score - left.score || (fleetPriority.get(left.crew.id) ?? 0) - (fleetPriority.get(right.crew.id) ?? 0),
    )
  const primary = scores[0]?.score ? scores[0].crew : crewById.get("helm-order")!
  const support = scores
    .filter((item) => item.crew.id !== primary.id && item.score > 0)
    .slice(0, 2)
    .map((item) => item.crew)
  return {
    primary,
    support,
    scores: scores.map(({ crew, score, matchedSignals }) => ({ crewId: crew.id, score, matchedSignals })),
    reason: support.length
      ? `${primary.name}负责最终交付，${support.map((crew) => crew.name).join("、")}提供专项支援。`
      : `${primary.name}与当前任务的能力信号最匹配。`,
  }
}

export function draftMissionForCrews(goal: string, primaryCrewId: CrewId, supportCrewIds: CrewId[]): Mission {
  const primary = crewById.get(primaryCrewId) ?? crewById.get("helm-order")!
  const support = supportCrewIds
    .filter((crewId, index, values) => crewId !== primary.id && values.indexOf(crewId) === index)
    .slice(0, 2)
    .map((crewId) => crewById.get(crewId))
    .filter((crew): crew is CrewProfile => Boolean(crew))
  const selectedCrews = [primary, ...support]
  const nodes: MissionNode[] = selectedCrews.flatMap((crew, crewIndex): MissionNode[] => {
    const captain = agents.find((agent) => agent.id === crew.captainId)!
    const specialist = agents.find((agent) => agent.crewId === crew.id && agent.role === "crew")!
    return [
      {
        id: `${crew.id}-plan`,
        title: `${crew.name}制定子计划`,
        description: crew.standardWorkflow.slice(0, 2).join(" → "),
        agentId: captain.id,
        crewId: crew.id,
        dependsOn: [] as string[],
        status: "pending" as const,
        concurrencySafe: true,
        risk: "low" as const,
      },
      {
        id: `${crew.id}-execute`,
        title: `${specialist.title}执行`,
        description: specialist.professional.deliverables[0] ?? "阶段成果",
        agentId: specialist.id,
        crewId: crew.id,
        dependsOn: [`${crew.id}-plan`],
        status: "pending" as const,
        concurrencySafe: crewIndex > 0,
        risk: "medium" as const,
        expectedArtifact: specialist.professional.deliverables[0],
      },
    ]
  })
  nodes.push({
    id: "chief-review",
    title: "澜汐最终复核",
    description: "检查完整性、事实、格式、约束与未完成项",
    agentId: "chief-lanxi",
    crewId: primary.id,
    dependsOn: selectedCrews.map((crew) => `${crew.id}-execute`),
    status: "pending",
    concurrencySafe: false,
    risk: "low",
    expectedArtifact: "最终交付包",
  })
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `mission-${Date.now()}`,
    goal,
    deliverables: ["可直接验收的最终成果", "来源与未验证项", "执行记录"],
    constraints: ["主团唯一", "支援团不超过两个", "高风险动作必须审批", "最大安全并行数为四"],
    risks: [],
    primaryCrewId: primary.id,
    supportCrewIds: support.map((crew) => crew.id),
    nodes,
    status: "awaiting-confirmation",
    approvals: [],
    artifacts: [],
  }
}

export function draftMission(goal: string): Mission {
  const recommendation = recommendCrews(goal)
  return draftMissionForCrews(
    goal,
    recommendation.primary.id,
    recommendation.support.map((crew) => crew.id),
  )
}

export function missionLaunchPrompt(mission: Mission): string {
  const primary = crewById.get(mission.primaryCrewId)!
  const support = mission.supportCrewIds.map((crewId) => crewById.get(crewId)!).filter(Boolean)
  const nodeList = mission.nodes
    .map(
      (node) =>
        `- ${node.title}（负责人：${agents.find((agent) => agent.id === node.agentId)?.name ?? node.agentId}；依赖：${node.dependsOn.join("、") || "无"}）`,
    )
    .join("\n")
  return `用户已确认以下航海图，请立即进入执行阶段，不要再次询问是否选择团队。\n\n目标：${mission.goal}\n主团：${primary.name}\n支援团：${support.map((crew) => crew.name).join("、") || "无"}\n约束：${mission.constraints.join("；")}\n\n任务节点：\n${nodeList}\n\n按星潮航局协作协议执行：船长负责拆解与整合，安全节点最多四个并行；敏感操作走现有审批；最终必须交付真实文件、来源、失败项和执行记录。`
}
