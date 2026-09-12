import type { RuntimeFleetSnapshot } from "../../src/domain/xingchao/runtime-fleet.ts"
import type {
  AdmitMissionRunRequest,
  FailMissionDispatchRequest,
  MissionRunChangedEvent,
  MissionRunEvent,
  MissionRunReason,
  MissionRunService,
  MissionRunStatus,
  MissionRunSummary,
  StartMissionRunRequest,
} from "./mission-common.ts"
import type {
  MissionRunBlueprint,
  MissionRunPersistence,
  PersistedMissionRun,
  PersistedMissionRunState,
} from "./mission-store.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { missionLaunchPrompt } from "../../src/domain/xingchao/routing.ts"
import { indexRuntimeFleet } from "../../src/domain/xingchao/runtime-fleet.ts"
import { ServiceEvent } from "../service-events.ts"
import { MissionRunService as MissionRunServiceName } from "./mission-common.ts"
import { missionRunBlueprintNodeSchema, missionRunBlueprintSchema, normalizeMissionRunState } from "./mission-store.ts"

const admissionNodeSchema = missionRunBlueprintNodeSchema
  .extend({ status: z.literal("pending", { error: "Mission nodes must be pending at admission" }) })
  .strict()

const missionAdmissionSchema = missionRunBlueprintSchema
  .omit({ nodes: true })
  .extend({
    approvals: z.array(z.unknown()).max(0, "Mission approvals must be empty at admission"),
    artifacts: z.array(z.unknown()).max(0, "Mission artifacts must be empty at admission"),
    nodes: z.array(admissionNodeSchema).min(1).max(64),
    status: z.literal("awaiting-confirmation", { error: "Mission must await confirmation at admission" }),
  })
  .strict()

export interface ChatTurnSettlement {
  generationId: string
  outcome: "completed" | "failed" | "cancelled"
  reason: "message_completed" | "agent_error" | "system_interrupted" | "user_stopped"
  sessionId: string
}

export interface MissionRunServiceDeps {
  createRunId?: () => string
  now?: () => number
  runtimeFleet(): Promise<RuntimeFleetSnapshot>
  store: MissionRunPersistence
}

function activeStatus(status: MissionRunStatus): boolean {
  return status === "admitted" || status === "running"
}

function parseMissionForAdmission(value: unknown): MissionRunBlueprint {
  const parsed = missionAdmissionSchema.parse(value)
  return {
    ...(parsed.budget ? { budget: parsed.budget } : {}),
    constraints: parsed.constraints,
    deliverables: parsed.deliverables,
    fleetRevision: parsed.fleetRevision,
    goal: parsed.goal,
    id: parsed.id,
    nodes: parsed.nodes.map(({ status: _status, ...node }) => node),
    primaryCrewId: parsed.primaryCrewId,
    risks: parsed.risks,
    supportCrewIds: parsed.supportCrewIds,
  }
}

function assertAcyclic(nodes: MissionRunBlueprint["nodes"]): void {
  const nodeIds = new Set(nodes.map(({ id }) => id))
  if (nodeIds.size !== nodes.length) throw new Error("Mission node ids must be unique")
  for (const node of nodes) {
    const dependencies = new Set(node.dependsOn)
    if (dependencies.size !== node.dependsOn.length) {
      throw new Error(`Mission node ${node.id} has duplicate dependencies`)
    }
    if (dependencies.has(node.id)) throw new Error(`Mission node ${node.id} cannot depend on itself`)
    for (const dependency of dependencies) {
      if (!nodeIds.has(dependency))
        throw new Error(`Mission node ${node.id} references unknown dependency ${dependency}`)
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) throw new Error(`Mission dependency cycle includes ${nodeId}`)
    if (visited.has(nodeId)) return
    visiting.add(nodeId)
    for (const dependency of byId.get(nodeId)?.dependsOn ?? []) visit(dependency)
    visiting.delete(nodeId)
    visited.add(nodeId)
  }
  for (const node of nodes) visit(node.id)
}

function assertMissionAgainstFleet(mission: MissionRunBlueprint, fleet: RuntimeFleetSnapshot): void {
  if (mission.fleetRevision !== fleet.revision) {
    throw new Error("Mission fleet revision does not match the active fleet revision")
  }
  const crewIds = new Set(fleet.crews.map(({ id }) => id))
  const agents = new Map(fleet.agents.map((agent) => [agent.id, agent]))
  const selectedCrews = [mission.primaryCrewId, ...mission.supportCrewIds]
  if (new Set(selectedCrews).size !== selectedCrews.length) {
    throw new Error("Mission primary and support crews must be unique")
  }
  for (const crewId of selectedCrews) {
    if (!crewIds.has(crewId)) throw new Error(`Mission references unknown crew ${crewId}`)
  }
  for (const node of mission.nodes) {
    if (!selectedCrews.includes(node.crewId)) {
      throw new Error(`Mission node ${node.id} references an unselected crew ${node.crewId}`)
    }
    const agent = agents.get(node.agentId)
    if (!agent) throw new Error(`Mission node ${node.id} references unknown Agent ${node.agentId}`)
    if (agent.crewId !== node.crewId) {
      throw new Error(`Mission node ${node.id} Agent does not belong to crew ${node.crewId}`)
    }
  }
  assertAcyclic(mission.nodes)
}

function originalSession(run: PersistedMissionRun, runs: PersistedMissionRun[]): string | undefined {
  return (
    run.sessionId ??
    runs
      .filter(
        (candidate) =>
          candidate.mission.id === run.mission.id && candidate.attempt < run.attempt && candidate.sessionId,
      )
      .sort((left, right) => right.attempt - left.attempt)[0]?.sessionId
  )
}

function publicRun(run: PersistedMissionRun, runs: PersistedMissionRun[] = []): MissionRunSummary {
  const userMessageId = run.events.find((event) => event.type === "mission-started")?.userMessageId
  const sessionId = originalSession(run, runs)
  return {
    ...(userMessageId ? { userMessageId } : {}),
    attempt: run.attempt,
    createdAt: run.createdAt,
    events: structuredClone(run.events),
    fleetRevision: run.mission.fleetRevision,
    goal: run.mission.goal,
    missionId: run.mission.id,
    runId: run.runId,
    ...(sessionId ? { sessionId } : {}),
    status: run.status,
    updatedAt: run.updatedAt,
  }
}

function eventFor(
  state: PersistedMissionRunState,
  at: number,
  status: MissionRunStatus,
  type: MissionRunEvent["type"],
  options: { reason?: MissionRunReason; sessionId?: string; generationId?: string; userMessageId?: string } = {},
): MissionRunEvent {
  const event: MissionRunEvent = {
    at,
    sequence: state.nextSequence,
    status,
    type,
    ...(options.reason ? { reason: options.reason } : {}),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options.generationId ? { generationId: options.generationId } : {}),
    ...(options.userMessageId ? { userMessageId: options.userMessageId } : {}),
  }
  state.nextSequence += 1
  return event
}

/** Not registered for RPC: all mutations belong to the main-process chat pipeline. */
export class MissionRunServiceImpl {
  public readonly changed = new ServiceEvent<MissionRunChangedEvent>()
  readonly #createRunId: () => string
  readonly #deps: MissionRunServiceDeps
  readonly #now: () => number
  #initialization: Promise<PersistedMissionRunState> | null = null
  #mutationQueue: Promise<void> = Promise.resolve()
  #state: PersistedMissionRunState | null = null
  readonly #pendingSettlements = new Map<string, ChatTurnSettlement>()

  public constructor(deps: MissionRunServiceDeps) {
    this.#deps = deps
    this.#createRunId = deps.createRunId ?? randomUUID
    this.#now = deps.now ?? Date.now
  }

  public async admit(request: AdmitMissionRunRequest): Promise<MissionRunSummary> {
    return this.#mutate(async (state) => {
      const mission = parseMissionForAdmission(request?.mission)
      assertMissionAgainstFleet(mission, await this.#deps.runtimeFleet())
      const sameMission = state.runs.filter((run) => run.mission.id === mission.id)
      const canonical = JSON.stringify(mission)
      const conflict = sameMission.find((run) => JSON.stringify(run.mission) !== canonical)
      if (conflict) throw new Error(`Mission id ${mission.id} was already used for a different blueprint`)
      const active = sameMission.find((run) => activeStatus(run.status))
      if (active) return { changed: false, value: publicRun(active) }

      const at = this.#now()
      const runId = this.#createRunId()
      if (state.runs.some((run) => run.runId === runId)) throw new Error(`Mission Run id already exists: ${runId}`)
      const run: PersistedMissionRun = {
        attempt: Math.max(0, ...sameMission.map(({ attempt }) => attempt)) + 1,
        createdAt: at,
        events: [eventFor(state, at, "admitted", "mission-admitted")],
        mission,
        runId,
        status: "admitted",
        updatedAt: at,
      }
      state.runs.push(run)
      return { changed: true, value: publicRun(run) }
    })
  }

  public async start(request: StartMissionRunRequest): Promise<MissionRunSummary> {
    return this.#mutate(async (state) => {
      const run = state.runs.find(({ runId }) => runId === request?.runId)
      if (!run) throw new Error("Mission Run does not exist")
      const sessionId = z
        .string()
        .min(1)
        .max(160)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
        .parse(request?.sessionId)
      const generationId = z
        .string()
        .min(1)
        .max(160)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
        .parse(request?.generationId)
      if (run.status === "running" && run.sessionId === sessionId && run.generationId === generationId) {
        return { changed: false, value: publicRun(run) }
      }
      if (run.status !== "admitted") throw new Error(`Mission Run cannot start from ${run.status}`)
      const original = originalSession(run, state.runs)
      if (original && original !== sessionId) throw new Error("Mission retry must use its original chat session")
      const conflicting = state.runs.find(
        (candidate) =>
          candidate.runId !== run.runId && candidate.status === "running" && candidate.sessionId === sessionId,
      )
      if (conflicting) throw new Error("Chat session already has a running Mission")
      assertMissionAgainstFleet(run.mission, await this.#deps.runtimeFleet())
      const at = Math.max(this.#now(), run.updatedAt)
      const userMessageId = z
        .string()
        .min(1)
        .max(160)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
        .optional()
        .parse(request.userMessageId)
      run.events.push(
        eventFor(state, at, "running", "mission-started", {
          sessionId,
          generationId,
          ...(userMessageId ? { userMessageId } : {}),
        }),
      )
      run.sessionId = sessionId
      run.generationId = generationId
      run.status = "running"
      run.updatedAt = at
      return { changed: true, value: publicRun(run) }
    })
  }

  public async admitRetry(runId: string, sessionId?: string): Promise<MissionRunSummary> {
    return this.#mutate(async (state) => {
      const previous = state.runs.find((run) => run.runId === runId)
      if (!previous || !["failed", "cancelled", "blocked"].includes(previous.status)) {
        throw new Error("Mission Run is not eligible for retry")
      }
      const original = originalSession(previous, state.runs)
      if (!original || sessionId !== original) {
        throw new Error("Mission retry must use its original chat session")
      }
      if (state.runs.some((run) => run.mission.id === previous.mission.id && run.attempt > previous.attempt)) {
        throw new Error("Only the latest Mission attempt can be retried")
      }
      assertMissionAgainstFleet(previous.mission, await this.#deps.runtimeFleet())
      const nextRunId = this.#createRunId()
      if (state.runs.some((run) => run.runId === nextRunId)) throw new Error("Mission Run id already exists")
      const at = Math.max(this.#now(), previous.updatedAt)
      const next: PersistedMissionRun = {
        attempt: previous.attempt + 1,
        createdAt: at,
        events: [eventFor(state, at, "admitted", "mission-admitted")],
        mission: structuredClone(previous.mission),
        runId: nextRunId,
        status: "admitted",
        updatedAt: at,
      }
      state.runs.push(next)
      return { changed: true, value: publicRun(next, state.runs) }
    })
  }

  public async failDispatch(request: FailMissionDispatchRequest): Promise<MissionRunSummary> {
    return this.#mutate(async (state) => {
      const run = state.runs.find(({ runId }) => runId === request?.runId)
      if (!run) throw new Error("Mission Run does not exist")
      const reason = z.enum(["send_failed", "send_rejected", "dispatch_not_direct"]).parse(request?.reason)
      if (run.status !== "admitted") return { changed: false, value: publicRun(run, state.runs) }
      const at = Math.max(this.#now(), run.updatedAt)
      run.events.push(eventFor(state, at, "failed", "mission-failed", { reason }))
      run.status = "failed"
      run.updatedAt = at
      return { changed: true, value: publicRun(run, state.runs) }
    })
  }

  public async list(): Promise<MissionRunSummary[]> {
    return this.#enqueue(async () => {
      const state = await this.#initialize()
      return [...state.runs]
        .sort((left, right) => right.createdAt - left.createdAt || right.attempt - left.attempt)
        .map((run) => ({
          ...publicRun(run, state.runs),
          ...(this.#pendingSettlements.has(run.runId) ? { persistencePending: true } : {}),
        }))
    })
  }

  public async retrySettlement(runId: string): Promise<void> {
    const pending = this.#pendingSettlements.get(runId)
    if (pending) await this.settleChatTurn(pending)
  }

  public async settleChatTurn(settlement: ChatTurnSettlement): Promise<MissionRunSummary | null> {
    return this.#mutate(async (state) => {
      const sessionId = z
        .string()
        .min(1)
        .max(160)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
        .parse(settlement?.sessionId)
      const run = state.runs.find(
        (candidate) =>
          candidate.status === "running" &&
          candidate.sessionId === sessionId &&
          candidate.generationId === settlement.generationId,
      )
      if (!run) return { changed: false, value: null }
      // Preserve the first verified terminal outcome across failed writes and late callbacks.
      const accepted = this.#pendingSettlements.get(run.runId) ?? settlement
      const terminal = {
        cancelled: { reason: "user_stopped", status: "cancelled", type: "mission-cancelled" },
        completed: { reason: "message_completed", status: "completed", type: "mission-completed" },
        failed: {
          reason: accepted.reason === "system_interrupted" ? "system_interrupted" : "agent_error",
          status: "failed",
          type: "mission-failed",
        },
      } as const
      const selected = terminal[accepted.outcome]
      if (accepted.reason !== selected.reason) {
        throw new Error(`Mission chat settlement reason ${accepted.reason} does not match ${accepted.outcome}`)
      }
      this.#pendingSettlements.set(run.runId, structuredClone(accepted))
      const at = Math.max(this.#now(), run.updatedAt)
      run.events.push(eventFor(state, at, selected.status, selected.type, { reason: selected.reason }))
      run.status = selected.status
      run.updatedAt = at
      return { changed: true, value: publicRun(run) }
    })
  }

  async #initialize(): Promise<PersistedMissionRunState> {
    if (this.#state) return this.#state
    this.#initialization ??= this.#loadAndRecover()
    try {
      this.#state = await this.#initialization
      return this.#state
    } catch (error) {
      this.#initialization = null
      throw error
    }
  }

  async #loadAndRecover(): Promise<PersistedMissionRunState> {
    const loaded = normalizeMissionRunState(await this.#deps.store.read())
    const state = structuredClone(loaded)
    const interrupted = state.runs.filter((run) => activeStatus(run.status))
    if (interrupted.length === 0) return state
    for (const run of interrupted) {
      const at = Math.max(this.#now(), run.updatedAt)
      run.events.push(
        eventFor(state, at, "blocked", "mission-recovery-blocked", {
          reason: "app_restarted",
        }),
      )
      run.status = "blocked"
      run.updatedAt = at
    }
    await this.#deps.store.write(state)
    return state
  }

  async #mutate<T extends MissionRunSummary | null>(
    operation: (state: PersistedMissionRunState) => Promise<{ changed: boolean; value: T }>,
  ): Promise<T> {
    return this.#enqueue(async () => {
      const current = await this.#initialize()
      const candidate = structuredClone(current)
      const result = await operation(candidate)
      if (!result.changed) return result.value
      normalizeMissionRunState(candidate)
      try {
        await this.#deps.store.write(candidate)
      } catch (error) {
        if (result.value && this.#pendingSettlements.has(result.value.runId)) {
          const previous = current.runs.find((run) => run.runId === result.value?.runId)
          if (previous) this.changed.emit({ runId: previous.runId, status: previous.status, persistencePending: true })
        }
        throw error
      }
      this.#state = candidate
      if (result.value) {
        if (!activeStatus(result.value.status)) this.#pendingSettlements.delete(result.value.runId)
        this.#broadcast(result.value)
      }
      return result.value
    })
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const scheduled = this.#mutationQueue.then(operation, operation)
    this.#mutationQueue = scheduled.then(
      () => undefined,
      () => undefined,
    )
    return scheduled
  }

  #broadcast(run: MissionRunSummary): void {
    const event = { runId: run.runId, status: run.status }
    this.changed.emit(event)
  }

  public async launchPrompt(runId: string): Promise<string> {
    return this.#enqueue(async () => {
      const state = await this.#initialize()
      const run = state.runs.find((item) => item.runId === runId)
      if (!run || run.status !== "admitted") throw new Error("Mission Run is not ready for dispatch")
      const fleet = await this.#deps.runtimeFleet()
      assertMissionAgainstFleet(run.mission, fleet)
      return missionLaunchPrompt(
        {
          ...run.mission,
          nodes: run.mission.nodes.map((node) => ({ ...node, status: "pending" })),
          approvals: [],
          artifacts: [],
          status: "awaiting-confirmation",
        },
        indexRuntimeFleet(fleet),
      )
    })
  }
}

/** Query/repair facade; callers cannot supply lifecycle outcomes or admission data. */
export class MissionRunQueryService
  extends ConnectionService<MissionRunService>
  implements IConnectionService<MissionRunService>
{
  readonly #manager: MissionRunServiceImpl
  readonly #unsubscribe: () => void
  public constructor(manager: MissionRunServiceImpl) {
    super(MissionRunServiceName)
    this.#manager = manager
    this.#unsubscribe = manager.changed.on((event) => {
      void this.send("missionRunChanged", event).catch(() => undefined)
    })
  }
  public list(): Promise<MissionRunSummary[]> {
    return this.#manager.list()
  }
  public retrySettlement(runId: string): Promise<void> {
    return this.#manager.retrySettlement(runId)
  }
  public override dispose(): void {
    this.#unsubscribe()
    super.dispose()
  }
}
