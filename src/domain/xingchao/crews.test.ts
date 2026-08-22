import { describe, expect, it } from "vitest"
import { originalFleetPack, validateContentPack } from "./content-pack.ts"
import { agents, crews } from "./crews.ts"
import { draftMission, recommendCrews } from "./routing.ts"
import { BUILTIN_CREW_IDS } from "./types.ts"

describe("星潮原创舰队", () => {
  it("包含十团六十名不重复角色", () => {
    expect(crews).toHaveLength(10)
    expect(agents).toHaveLength(60)
    expect(new Set(agents.map((agent) => agent.id)).size).toBe(60)
    expect(crews.every((crew) => crew.memberIds.length === 6)).toBe(true)
  })

  it("仅定义受信任的内建航海团 ID", () => {
    expect(crews.map((crew) => crew.id)).toEqual(BUILTIN_CREW_IDS)
  })

  it("每名角色分离人格与专业能力并有三项评测", () => {
    for (const agent of agents) {
      expect(agent.persona.decisionStyle.length).toBeGreaterThan(5)
      expect(agent.professional.capabilities.length).toBeGreaterThanOrEqual(3)
      expect(agent.professional.allowedTools.length).toBeGreaterThanOrEqual(4)
      expect(agent.professional.prohibitedActions.length).toBeGreaterThanOrEqual(3)
      expect(agent.evaluations).toHaveLength(3)
    }
  })

  it("通过内容包校验并禁止可执行代码", () => {
    const pack = validateContentPack(originalFleetPack)
    expect(pack.executableCode).toBe(false)
    expect(pack.visibility).toBe("public-original")
  })
})

describe("航海团路由", () => {
  it("把竞品论文调研交给望潮团", () => {
    const result = recommendCrews("请做一份包含论文证据和竞品对照的行业调研")
    expect(result.primary.id).toBe("watchtide")
  })

  it("主团唯一且支援团不超过两个", () => {
    const mission = draftMission("调研一个产品，写营销稿并设计品牌页面")
    expect(mission.primaryCrewId).toBe("watchtide")
    expect(mission.supportCrewIds.length).toBeLessThanOrEqual(2)
    expect(new Set([mission.primaryCrewId, ...mission.supportCrewIds]).size).toBe(1 + mission.supportCrewIds.length)
    expect(mission.nodes.at(-1)?.agentId).toBe("chief-lanxi")
  })
})
