import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { originalFleetPack, validateContentPack } from "./content-pack.ts"
import { draftMissionForCrews, missionLaunchPrompt, recommendCrews } from "./routing.ts"
import { buildRuntimeContentCatalog } from "./runtime-catalog.ts"
import { indexRuntimeFleet, projectRuntimeFleetCatalog } from "./runtime-fleet.ts"

const manifestUrl = new URL("../../../content-packs/actuator-design-legion/manifest.json", import.meta.url)

function legionFleet() {
  const input: unknown = existsSync(manifestUrl) ? JSON.parse(readFileSync(manifestUrl, "utf8")) : null
  expect(input, "The approved Actuator Design Legion pack must exist").not.toBeNull()
  const pack = validateContentPack(input)
  return indexRuntimeFleet(projectRuntimeFleetCatalog(buildRuntimeContentCatalog(originalFleetPack, [pack])))
}

describe("Actuator Design Legion content delivery", () => {
  it("adds a six-member professional roster without replacing the original fleet", () => {
    const fleet = legionFleet()
    expect(fleet.snapshot.crews).toHaveLength(11)
    expect(fleet.snapshot.agents).toHaveLength(66)
    const crew = fleet.crewById.get("actuator-design-legion--actuator-legion")!
    expect(crew.name).toBe("执行器设计军团")
    expect(new Set(crew.memberIds).size).toBe(6)
    expect(fleet.agentById.get(crew.captainId)?.role).toBe("captain")
    expect(crew.memberIds.map((id) => fleet.agentById.get(id)?.title)).toEqual([
      "总设计与需求负责人",
      "传动选型与计算专家",
      "SolidWorks 参数化建模专家",
      "装配与接口检查专家",
      "工程图与 BOM 专家",
      "验收与经验复盘专家",
    ])
    expect(fleet.crewById.has("forge-vessel")).toBe(true)
  })

  it.each(["SolidWorks 执行器参数化建模", "执行器齿轮传动与装配检查", "减速器工程图与 BOM"])(
    "routes the domain goal '%s' to the legion",
    (goal) => {
      const recommendation = recommendCrews(goal, legionFleet())
      expect(recommendation.primary.id).toBe("actuator-design-legion--actuator-legion")
    },
  )

  it("plans valid namespaced responsibilities and preserves the explicit knowledge-reading goal", () => {
    const fleet = legionFleet()
    const goal = "SolidWorks 执行器：先读取 docs/actuator-design-legion/README.md，仅做输入与验收计划，不执行 CAD。"
    const mission = draftMissionForCrews(goal, "actuator-design-legion--actuator-legion", [], fleet)
    expect(mission.status).toBe("awaiting-confirmation")
    expect(mission.nodes).toHaveLength(3)
    expect(mission.nodes.every((node) => fleet.agentById.get(node.agentId)?.crewId === mission.primaryCrewId)).toBe(
      true,
    )
    const prompt = missionLaunchPrompt(mission, fleet)
    const data = JSON.parse(prompt.match(/<content_pack_data>\n([\s\S]+)\n<\/content_pack_data>/)![1]!)
    expect(data.userGoal).toBe(goal)
    expect(data.primaryCrew.id).toBe("actuator-design-legion--actuator-legion")
    expect(prompt).not.toContain('"allowedTools"')
    expect(prompt).not.toContain('"persona"')
  })
})
