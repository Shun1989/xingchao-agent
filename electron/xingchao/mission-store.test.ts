import type { PersistedMissionRunState } from "./mission-store.ts"

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MissionRunStore, normalizeMissionRunState } from "./mission-store.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xingchao-mission-run-"))
  temporaryDirectories.push(directory)
  return directory
}

function persistedState(): PersistedMissionRunState {
  return {
    nextSequence: 3,
    runs: [
      {
        attempt: 1,
        createdAt: 1_000,
        events: [
          { at: 1_000, sequence: 1, status: "admitted", type: "mission-admitted" },
          {
            at: 1_100,
            sequence: 2,
            generationId: "generation-1",
            sessionId: "session-1",
            status: "running",
            type: "mission-started",
          },
        ],
        mission: {
          constraints: ["高风险动作必须审批"],
          deliverables: ["验收报告"],
          fleetRevision: "xingchao-original-fleet@1.0.0",
          goal: "完成一次可审计任务",
          id: "mission-1",
          nodes: [
            {
              agentId: "watchtide-captain",
              concurrencySafe: true,
              crewId: "watchtide",
              dependsOn: [],
              description: "制定计划",
              id: "watchtide-plan",
              risk: "low",
              title: "制定计划",
            },
          ],
          primaryCrewId: "watchtide",
          risks: [],
          supportCrewIds: [],
        },
        runId: "run-1",
        generationId: "generation-1",
        sessionId: "session-1",
        status: "running",
        updatedAt: 1_100,
      },
    ],
    version: 1,
  }
}

describe("MissionRunStore", () => {
  it("round-trips a validated event ledger atomically without temporary files", async () => {
    const directory = await temporaryDirectory()
    const store = new MissionRunStore(directory)
    const state = persistedState()

    await store.write(state)

    await expect(store.read()).resolves.toEqual(state)
    await expect(readdir(directory)).resolves.toEqual(["mission-runs.json"])
  })

  it("uses an empty versioned ledger only when the file is missing", async () => {
    const directory = await temporaryDirectory()

    await expect(new MissionRunStore(directory).read()).resolves.toEqual({ nextSequence: 1, runs: [], version: 1 })
  })

  it.each([
    ["malformed JSON", "{broken"],
    ["unsupported schema", JSON.stringify({ nextSequence: 1, runs: [], version: 2 })],
    [
      "invalid transition history",
      JSON.stringify({
        ...persistedState(),
        runs: [
          {
            ...persistedState().runs[0],
            events: [{ at: 1_000, sequence: 1, status: "completed", type: "mission-completed" }],
            status: "completed",
            updatedAt: 1_000,
          },
        ],
        nextSequence: 2,
      }),
    ],
  ])("fails closed for %s instead of replacing history with empty state", async (_label, contents) => {
    const directory = await temporaryDirectory()
    await writeFile(path.join(directory, "mission-runs.json"), contents, "utf8")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    await expect(new MissionRunStore(directory).read()).rejects.toThrow()
  })

  it("propagates operational read failures and never writes an empty replacement", async () => {
    const failure = Object.assign(new Error("access denied"), { code: "EACCES" })
    const writeText = vi.fn(async () => undefined)
    const store = new MissionRunStore("C:\\not-used", {
      readText: async () => Promise.reject(failure),
      writeText,
    })

    await expect(store.read()).rejects.toBe(failure)
    expect(writeText).not.toHaveBeenCalled()
  })

  it("rejects duplicate or non-monotonic global event sequences", () => {
    const state = persistedState()
    state.runs.push({
      ...structuredClone(state.runs[0]!),
      attempt: 2,
      runId: "run-2",
    })

    expect(() => normalizeMissionRunState(state)).toThrow(/sequence/i)
  })
})
