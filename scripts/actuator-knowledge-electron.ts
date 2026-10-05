import { app, session } from "electron"
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadActuatorLegionKnowledge } from "../electron/xingchao/actuator-knowledge.ts"
import { MissionRunServiceImpl } from "../electron/xingchao/mission-service.ts"
import { MissionRunStore } from "../electron/xingchao/mission-store.ts"
import { ContentPackRuntimeManager } from "../electron/xingchao/runtime-manager.ts"
import { draftMissionForCrews } from "../src/domain/xingchao/routing.ts"
import { indexRuntimeFleet, projectRuntimeFleetCatalog } from "../src/domain/xingchao/runtime-fleet.ts"

const root = process.env["XINGCHAO_KNOWLEDGE_SMOKE_ROOT"]!
const phase = process.env["XINGCHAO_KNOWLEDGE_SMOKE_PHASE"]!
const appVersion = process.env["XINGCHAO_KNOWLEDGE_SMOKE_VERSION"]!
if (!root || !["seed", "retry"].includes(phase) || !appVersion) throw new Error("Invalid isolated smoke configuration")
app.setPath("userData", path.join(root, "profile"))

async function run() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((_details, callback) => callback({ cancel: true }))
  const packs = new ContentPackRuntimeManager({ appVersion, userDataDirectory: app.getPath("userData") })
  if (phase === "seed") {
    const installed = await packs.install(await readFile(path.join(root, "pack.xcp")))
    await packs.setSelection({ id: installed.id, version: installed.version, selected: true }, async () => true)
  }
  const fleet = projectRuntimeFleetCatalog(await packs.runtimeCatalog())
  const store = new MissionRunStore(app.getPath("userData"))
  const knowledgeDirectory = path.join(root, "knowledge/actuator-design-legion/1.0.0")
  const manager = new MissionRunServiceImpl({
    store,
    runtimeFleet: async () => fleet,
    actuatorKnowledge: () => loadActuatorLegionKnowledge(knowledgeDirectory),
  })
  if (phase === "seed") {
    const mission = draftMissionForCrews(
      "准备设计输入清单与检查计划，不执行CAD",
      "actuator-design-legion--actuator-legion",
      [],
      indexRuntimeFleet(fleet),
    )
    const first = await manager.admit({ mission })
    const prompt = await manager.launchPrompt(first.runId)
    await writeFile(path.join(root, "first-prompt.txt"), prompt)
    await manager.start({ runId: first.runId, sessionId: "smoke-chat", generationId: "generation-one" })
    await manager.settleChatTurn({
      sessionId: "smoke-chat",
      generationId: "generation-one",
      outcome: "cancelled",
      reason: "user_stopped",
    })
    return
  }
  const first = (await manager.list())[0]!
  assert.equal(first.status, "cancelled")
  const retry = await manager.admitRetry(first.runId, "smoke-chat")
  const prompt = await manager.launchPrompt(retry.runId)
  assert.equal(prompt, await readFile(path.join(root, "first-prompt.txt"), "utf8"))
  const data = JSON.parse(prompt.split("<mission_knowledge_data>\n")[1]!.split("\n</mission_knowledge_data>")[0]!)
  assert.equal(data.version, "1.0.0")
  assert.ok(
    data.documents
      .find((document: { name: string }) => document.name === "cases.json")
      .text.includes('"currentCadReview": "not-run"'),
  )
  const record = (await store.read()).runs[1]!
  assert.ok(record.mission.constraints.at(-1)!.includes(data.digest))
  await writeFile(
    path.join(root, "result.json"),
    JSON.stringify({
      appVersion,
      packVersion: "1.0.1",
      knowledgeVersion: data.version,
      digest: data.digest,
      crews: fleet.crews.length,
      documents: data.documents.length,
      sourceIds: data.sourceIds.length,
      attempts: (await store.read()).runs.length,
      sameKnowledge: true,
      cadExecuted: false,
    }),
  )
}

run()
  .then(() => app.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })
