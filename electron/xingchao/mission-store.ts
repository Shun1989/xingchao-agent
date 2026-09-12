import type { MissionRunEvent, MissionRunStatus } from "./mission-common.ts"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { atomicWriteText } from "../atomic-file.ts"
import { isMissingFileError, logStoreReadFailure } from "../store-diagnostics.ts"

const idSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const fleetRevisionSchema = z
  .string()
  .min(1)
  .max(4_096)
  .regex(/^[a-z0-9][a-z0-9@|._-]*$/)
const boundedText = (max: number) => z.string().min(1).max(max)
const boundedTextArray = (maxItems: number, maxLength: number) => z.array(boundedText(maxLength)).max(maxItems)

export const missionRunBlueprintNodeSchema = z
  .object({
    agentId: idSchema,
    concurrencySafe: z.boolean(),
    crewId: idSchema,
    dependsOn: z.array(idSchema).max(64),
    description: boundedText(2_000),
    expectedArtifact: boundedText(1_000).optional(),
    id: idSchema,
    risk: z.enum(["low", "medium", "high"]),
    title: boundedText(500),
  })
  .strict()

export const missionRunBlueprintSchema = z
  .object({
    budget: z
      .object({
        currency: z
          .string()
          .min(1)
          .max(16)
          .regex(/^[A-Za-z0-9._-]+$/)
          .optional(),
        maxCost: z.number().finite().nonnegative().max(1_000_000_000).optional(),
        maxTokens: z.number().int().nonnegative().max(1_000_000_000).optional(),
      })
      .strict()
      .optional(),
    constraints: boundedTextArray(32, 1_000),
    deliverables: boundedTextArray(32, 1_000),
    fleetRevision: fleetRevisionSchema,
    goal: boundedText(4_000),
    id: idSchema,
    nodes: z.array(missionRunBlueprintNodeSchema).min(1).max(64),
    primaryCrewId: idSchema,
    risks: boundedTextArray(32, 1_000),
    supportCrewIds: z.array(idSchema).max(2),
  })
  .strict()

const missionRunEventSchema = z
  .object({
    userMessageId: idSchema.optional(),
    generationId: idSchema.optional(),
    at: z.number().int().nonnegative(),
    reason: z
      .enum([
        "message_completed",
        "send_failed",
        "send_rejected",
        "dispatch_not_direct",
        "agent_error",
        "system_interrupted",
        "user_stopped",
        "app_restarted",
      ])
      .optional(),
    sequence: z.number().int().positive(),
    sessionId: idSchema.optional(),
    status: z.enum(["admitted", "running", "blocked", "completed", "failed", "cancelled"]),
    type: z.enum([
      "mission-admitted",
      "mission-started",
      "mission-completed",
      "mission-failed",
      "mission-cancelled",
      "mission-recovery-blocked",
    ]),
  })
  .strict()

const persistedMissionRunSchema = z
  .object({
    generationId: idSchema.optional(),
    attempt: z.number().int().positive(),
    createdAt: z.number().int().nonnegative(),
    events: z.array(missionRunEventSchema).min(1).max(512),
    mission: missionRunBlueprintSchema,
    runId: idSchema,
    sessionId: idSchema.optional(),
    status: z.enum(["admitted", "running", "blocked", "completed", "failed", "cancelled"]),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict()

const persistedMissionRunStateSchema = z
  .object({
    nextSequence: z.number().int().positive(),
    runs: z.array(persistedMissionRunSchema).max(1_024),
    version: z.literal(1),
  })
  .strict()

export type MissionRunBlueprint = z.infer<typeof missionRunBlueprintSchema>
export type PersistedMissionRun = z.infer<typeof persistedMissionRunSchema>
export type PersistedMissionRunState = z.infer<typeof persistedMissionRunStateSchema>

export interface MissionRunPersistence {
  read(): Promise<PersistedMissionRunState>
  write(state: PersistedMissionRunState): Promise<void>
}

export interface MissionRunStoreDeps {
  readText(filePath: string): Promise<string>
  writeText(filePath: string, content: string): Promise<void>
}

const defaultDeps: MissionRunStoreDeps = {
  readText: (filePath) => readFile(filePath, "utf8"),
  writeText: (filePath, content) => atomicWriteText(filePath, content, { mode: 0o600 }),
}

export function emptyMissionRunState(): PersistedMissionRunState {
  return { nextSequence: 1, runs: [], version: 1 }
}

function assertEventTransition(previous: MissionRunStatus | null, event: MissionRunEvent, index: number): void {
  const invalid = (message: string): never => {
    throw new Error(`Invalid Mission Run event transition at index ${index}: ${message}`)
  }
  switch (event.type) {
    case "mission-admitted":
      if (previous !== null || event.status !== "admitted" || event.reason || event.sessionId) {
        invalid("mission-admitted must be the first event")
      }
      return
    case "mission-started":
      if (
        previous !== "admitted" ||
        event.status !== "running" ||
        event.reason ||
        !event.sessionId ||
        !event.generationId
      ) {
        invalid("mission-started must bind an admitted run to a session")
      }
      return
    case "mission-completed":
      if (previous !== "running" || event.status !== "completed" || event.reason !== "message_completed") {
        invalid("mission-completed requires a running run and message_completed reason")
      }
      return
    case "mission-failed":
      if (
        (previous !== "admitted" && previous !== "running") ||
        event.status !== "failed" ||
        !["send_failed", "send_rejected", "dispatch_not_direct", "agent_error", "system_interrupted"].includes(
          event.reason ?? "",
        )
      ) {
        invalid("mission-failed requires an active run and a closed failure reason")
      }
      return
    case "mission-cancelled":
      if (previous !== "running" || event.status !== "cancelled" || event.reason !== "user_stopped") {
        invalid("mission-cancelled requires a running run and user_stopped reason")
      }
      return
    case "mission-recovery-blocked":
      if (
        (previous !== "admitted" && previous !== "running") ||
        event.status !== "blocked" ||
        event.reason !== "app_restarted"
      ) {
        invalid("mission-recovery-blocked requires a non-terminal run and app_restarted reason")
      }
  }
}

function assertRunHistory(run: PersistedMissionRun): void {
  let previous: MissionRunStatus | null = null
  let startedSessionId: string | undefined
  let startedGenerationId: string | undefined
  let previousSequence = 0
  let previousAt = -1
  for (const [index, event] of run.events.entries()) {
    if (event.at < previousAt) throw new Error(`Invalid Mission Run timestamp order for ${run.runId}`)
    if (event.sequence <= previousSequence) throw new Error("Mission Run event sequence must increase")
    previousSequence = event.sequence
    assertEventTransition(previous, event, index)
    if (event.type === "mission-started") startedSessionId = event.sessionId
    if (event.type === "mission-started") startedGenerationId = event.generationId
    if (event.type !== "mission-started" && (event.sessionId || event.generationId)) {
      throw new Error("Only a start event may bind a session and generation")
    }
    previous = event.status
    previousAt = event.at
  }
  const first = run.events[0]!
  const last = run.events.at(-1)!
  if (run.createdAt !== first.at || run.updatedAt !== last.at || run.status !== last.status) {
    throw new Error(`Mission Run ${run.runId} summary does not match its event history`)
  }
  if (run.sessionId !== startedSessionId || run.generationId !== startedGenerationId) {
    throw new Error(`Mission Run ${run.runId} session does not match its start event`)
  }
}

export function normalizeMissionRunState(value: unknown): PersistedMissionRunState {
  const state = persistedMissionRunStateSchema.parse(value)
  const runIds = new Set<string>()
  const sequences = new Set<number>()
  const missionIdentity = new Map<string, string>()
  const attemptsByMission = new Map<string, Set<number>>()
  let maximumSequence = 0
  for (const run of state.runs) {
    if (runIds.has(run.runId)) throw new Error(`Duplicate Mission Run id: ${run.runId}`)
    runIds.add(run.runId)
    assertRunHistory(run)
    const canonicalMission = JSON.stringify(run.mission)
    const priorMission = missionIdentity.get(run.mission.id)
    if (priorMission && priorMission !== canonicalMission) {
      throw new Error(`Mission id ${run.mission.id} has conflicting persisted blueprints`)
    }
    missionIdentity.set(run.mission.id, canonicalMission)
    const attempts = attemptsByMission.get(run.mission.id) ?? new Set<number>()
    if (attempts.has(run.attempt)) throw new Error(`Duplicate Mission attempt ${run.mission.id}#${run.attempt}`)
    attempts.add(run.attempt)
    attemptsByMission.set(run.mission.id, attempts)
    for (const event of run.events) {
      if (sequences.has(event.sequence)) throw new Error(`Duplicate Mission Run event sequence ${event.sequence}`)
      sequences.add(event.sequence)
      maximumSequence = Math.max(maximumSequence, event.sequence)
    }
  }
  const ordered = [...sequences].sort((left, right) => left - right)
  if (ordered.some((sequence, index) => sequence !== index + 1) || state.nextSequence !== maximumSequence + 1) {
    throw new Error("Mission Run event sequence is not contiguous and monotonic")
  }
  return state
}

export class MissionRunStore implements MissionRunPersistence {
  readonly #deps: MissionRunStoreDeps
  readonly #file: string

  public constructor(userDataDirectory: string, deps: MissionRunStoreDeps = defaultDeps) {
    this.#deps = deps
    this.#file = path.join(userDataDirectory, "mission-runs.json")
  }

  public async read(): Promise<PersistedMissionRunState> {
    try {
      const text = await this.#deps.readText(this.#file)
      if (Buffer.byteLength(text, "utf8") > 16 * 1024 * 1024) throw new Error("Mission ledger exceeds 16 MiB")
      return normalizeMissionRunState(JSON.parse(text))
    } catch (error) {
      logStoreReadFailure("Mission Run ledger", this.#file, error)
      if (isMissingFileError(error)) return emptyMissionRunState()
      throw error
    }
  }

  public async write(state: PersistedMissionRunState): Promise<void> {
    const validated = normalizeMissionRunState(state)
    const text = `${JSON.stringify(validated, null, 2)}\n`
    if (Buffer.byteLength(text, "utf8") > 16 * 1024 * 1024)
      throw new Error("Mission ledger is full; archive support is required")
    await this.#deps.writeText(this.#file, text)
  }
}
