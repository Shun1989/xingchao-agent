import { app } from "electron"
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { MissionRunServiceImpl } from "../electron/xingchao/mission-service.ts"
import { MissionRunStore } from "../electron/xingchao/mission-store.ts"
import { draftMission } from "../src/domain/xingchao/routing.ts"
import { builtinRuntimeFleetSnapshot } from "../src/domain/xingchao/runtime-fleet.ts"

const userDataDirectory = process.env["WANTA_MISSION_SMOKE_USER_DATA"]?.trim()
const phase = process.env["WANTA_MISSION_SMOKE_PHASE"]?.trim()
if (!userDataDirectory) throw new Error("WANTA_MISSION_SMOKE_USER_DATA is required")
if (!["seed", "recover", "verify"].includes(phase ?? "")) throw new Error("Invalid smoke phase")
app.setPath("userData", path.resolve(userDataDirectory))

async function run(): Promise<void> {
  await app.whenReady()
  const store = new MissionRunStore(app.getPath("userData"))
  const manager = new MissionRunServiceImpl({ store, runtimeFleet: async () => builtinRuntimeFleetSnapshot })
  if (phase === "seed") {
    const unfinished = await manager.admit({ mission: { ...draftMission("重启恢复验收"), id: "restart-mission" } })
    await manager.start({ runId: unfinished.runId, sessionId: "restart-session", generationId: "restart-generation" })
    const finished = await manager.admit({ mission: { ...draftMission("完成状态验收"), id: "completed-mission" } })
    await manager.start({ runId: finished.runId, sessionId: "completed-session", generationId: "completed-generation" })
    await manager.settleChatTurn({
      sessionId: "completed-session",
      generationId: "completed-generation",
      outcome: "completed",
      reason: "message_completed",
    })
    assert.equal((await store.read()).runs.find((item) => item.mission.id === "restart-mission")?.status, "running")
    return
  }
  const runs = await manager.list()
  const unfinished = runs.find((item) => item.missionId === "restart-mission")!
  const completed = runs.find((item) => item.missionId === "completed-mission")!
  const recoveryEvents = unfinished.events.filter((event) => event.type === "mission-recovery-blocked").length
  assert.equal(unfinished.status, "blocked")
  assert.equal(completed.status, "completed")
  assert.equal(recoveryEvents, 1)
  await writeFile(
    path.join(app.getPath("userData"), "mission-smoke-result.json"),
    JSON.stringify({ unfinished: unfinished.status, completed: completed.status, recoveryEvents }),
    "utf8",
  )
}

run()
  .then(() => app.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })
