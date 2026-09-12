import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { draftMission } from "../../src/domain/xingchao/routing.ts"
import { builtinRuntimeFleetSnapshot } from "../../src/domain/xingchao/runtime-fleet.ts"
import { MissionRunServiceImpl, MissionRunQueryService } from "./mission-service.ts"
import { MissionRunStore, emptyMissionRunState } from "./mission-store.ts"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.restoreAllMocks()
})
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mission-backup-test-"))
  roots.push(root)
  const store = new MissionRunStore(root)
  const create = () => new MissionRunServiceImpl({ store, runtimeFleet: async () => builtinRuntimeFleetSnapshot })
  return { root, store, create, ledger: path.join(root, "mission-runs.json") }
}

it("exports a validated complete ledger and preserves attempts on restart", async () => {
  const { create } = await fixture()
  const manager = create()
  const first = await manager.admit({ mission: draftMission("备份任务") })
  await manager.start({ runId: first.runId, sessionId: "original", generationId: "g1" })
  const snapshot = JSON.parse(await manager.exportHistory())
  expect(snapshot.runs[0].status).toBe("running")
  expect(snapshot.runs[0].mission.goal).toBe("备份任务")
  expect(await manager.storageStatus()).toMatchObject({ state: "ready", runCount: 1, maxRuns: 1024 })
})

it("restores corrupt bytes only after preserving an exact copy and blocks restored active runs", async () => {
  const { root, ledger, create } = await fixture()
  const seed = create()
  await seed.admit({ mission: draftMission("恢复备份") })
  const backup = await seed.exportHistory()
  const damaged = Buffer.from([0xff, 0xfe, 0x7b, 0x00])
  await writeFile(ledger, damaged)
  const manager = create()
  expect(await manager.storageStatus()).toMatchObject({ state: "corrupt" })
  await manager.restoreHistory(backup)
  expect((await manager.list())[0]?.status).toBe("blocked")
  const preserved = (await readdir(root)).find((name) => name.startsWith("mission-runs.corrupt-"))!
  expect(await readFile(path.join(root, preserved))).toEqual(damaged)
  expect((await create().list())[0]?.events.filter((event) => event.type === "mission-recovery-blocked")).toHaveLength(
    1,
  )
})

it("rejects invalid backup without touching the damaged ledger", async () => {
  const { ledger, root, create } = await fixture()
  await writeFile(ledger, "{broken")
  await expect(create().restoreHistory('{"version":2}')).rejects.toThrow()
  expect(await readFile(ledger, "utf8")).toBe("{broken")
  expect(await readdir(root)).toEqual(["mission-runs.json"])
})

it("does not replace healthy or missing history with an imported backup", async () => {
  const { create, store } = await fixture()
  const backup = JSON.stringify(emptyMissionRunState())
  await expect(create().restoreHistory(backup)).rejects.toThrow()
  await store.write(emptyMissionRunState())
  await expect(create().restoreHistory(backup)).rejects.toThrow()
})

it("treats permission failures as unavailable, not corruption eligible for recovery", async () => {
  const write = vi.fn()
  const manager = new MissionRunServiceImpl({
    runtimeFleet: async () => builtinRuntimeFleetSnapshot,
    store: {
      read: async () => {
        throw Object.assign(new Error("private path"), { code: "EACCES" })
      },
      write,
    },
  })
  expect(await manager.storageStatus()).toEqual({ state: "unavailable" })
  await expect(manager.restoreHistory(JSON.stringify(emptyMissionRunState()))).rejects.toThrow()
  expect(write).not.toHaveBeenCalled()
})

it("rejects recovery once this process owns live history even if the disk is changed externally", async () => {
  const { create, ledger } = await fixture()
  const manager = create()
  await manager.admit({ mission: draftMission("正在执行") })
  const backup = await manager.exportHistory()
  await writeFile(ledger, "{broken")
  await expect(manager.restoreHistory(backup)).rejects.toThrow()
  expect((await manager.list())[0]?.status).toBe("admitted")
})

it("cancelled native selection cannot replace the corrupt ledger", async () => {
  const { create, ledger } = await fixture()
  await writeFile(ledger, "{broken")
  const query = new MissionRunQueryService(create(), { save: vi.fn(), chooseBackup: async () => null })
  try {
    expect(await query.restoreHistory()).toBe("cancelled")
    expect(await readFile(ledger, "utf8")).toBe("{broken")
  } finally {
    query.dispose()
  }
})

it("failed replacement retains the original and its preserved copy", async () => {
  const { ledger, root } = await fixture()
  await writeFile(ledger, "{broken")
  const store = new MissionRunStore(root, {
    readText: (file) => readFile(file, "utf8"),
    writeText: async () => {
      throw new Error("disk full")
    },
  })
  await expect(store.restoreCorrupt(emptyMissionRunState())).rejects.toThrow("disk full")
  expect(await readFile(ledger, "utf8")).toBe("{broken")
  const preserved = (await readdir(root)).find((name) => name.startsWith("mission-runs.corrupt-"))!
  expect(await readFile(path.join(root, preserved), "utf8")).toBe("{broken")
})

it("pending terminal writes prevent misleading export snapshots", async () => {
  const { store } = await fixture()
  let fail = false
  const manager = new MissionRunServiceImpl({
    runtimeFleet: async () => builtinRuntimeFleetSnapshot,
    store: {
      read: () => store.read(),
      write: async (state) => {
        if (fail) throw new Error("disk full")
        await store.write(state)
      },
    },
  })
  const run = await manager.admit({ mission: draftMission("保存失败") })
  await manager.start({ runId: run.runId, sessionId: "s1", generationId: "g1" })
  fail = true
  await expect(
    manager.settleChatTurn({ sessionId: "s1", generationId: "g1", outcome: "completed", reason: "message_completed" }),
  ).rejects.toThrow()
  expect(await manager.storageStatus()).toMatchObject({ persistencePending: true })
  await expect(manager.exportHistory()).rejects.toThrow(/pending writes/i)
  fail = false
  await manager.retrySettlement(run.runId)
  expect(JSON.parse(await manager.exportHistory()).runs[0].status).toBe("completed")
})
