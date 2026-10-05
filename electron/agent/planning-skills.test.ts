import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentManager } from "./manager.ts"
import { OpencodeAgentAdapter } from "./opencode-adapter.ts"
import { OpencodeSidecar } from "./sidecar.ts"

afterEach(() => vi.restoreAllMocks())

const skillLocation = path.resolve("planning-fixture", "frontend", "SKILL.md")
const loadedSkill = {
  name: "frontend",
  description: "Planning fixture",
  location: skillLocation,
  content: "\n# Frontend planning\nUse the approved design procedure.\n",
}

function planningFixture(
  options: {
    skills?: unknown
    tools?: unknown
    skillsStatus?: number
    toolsStatus?: number
    ready?: boolean
  } = {},
) {
  const manager = new AgentManager({
    linkRuntime: null,
    modelAccess: { kind: "local" },
    opencodeBinPath: "/unused/opencode",
    rootDir: "/unused/planning-fixture",
  })
  const requests: string[] = []
  const client = createOpencodeClient({
    baseUrl: "http://planning-sidecar.invalid",
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const url = new URL(request.url)
      requests.push(`${request.method} ${url.pathname}`)
      if (request.method !== "GET") throw new Error(`Unexpected mutation: ${request.method} ${url.pathname}`)
      const fixture =
        url.pathname === "/skill"
          ? { data: options.skills === undefined ? [loadedSkill] : options.skills, status: options.skillsStatus ?? 200 }
          : url.pathname === "/experimental/tool/ids"
            ? {
                data: options.tools === undefined ? ["read", "skill"] : options.tools,
                status: options.toolsStatus ?? 200,
              }
            : undefined
      if (!fixture) throw new Error(`Unexpected endpoint: ${url.pathname}`)
      return new Response(JSON.stringify(fixture.data), {
        status: fixture.status,
        headers: { "Content-Type": "application/json" },
      })
    },
  })
  const state = manager as unknown as { started: boolean; sidecar: unknown }
  state.started = options.ready ?? true
  state.sidecar = { client }
  return { manager, adapter: new OpencodeAgentAdapter(manager), requests }
}

describe("OpenCode planning skill discovery", () => {
  it("returns the sidecar's loaded body and registration through the concrete adapter", async () => {
    const { adapter, requests } = planningFixture()

    await expect(adapter.getPlanningSkills()).resolves.toEqual({
      toolAvailable: true,
      skills: [
        {
          name: "frontend",
          location: skillLocation,
          content: "\n# Frontend planning\nUse the approved design procedure.\n",
        },
      ],
    })
    expect(requests.sort()).toEqual(["GET /experimental/tool/ids", "GET /skill"])
  })

  it("does not infer skill tool registration from a discovered skill", async () => {
    const { manager } = planningFixture({ tools: ["read", "bash"] })
    await expect(manager.getPlanningSkills()).resolves.toEqual({
      toolAvailable: false,
      skills: [
        {
          name: "frontend",
          location: skillLocation,
          content: "\n# Frontend planning\nUse the approved design procedure.\n",
        },
      ],
    })
  })

  it("keeps OpenCode's real built-in skill sentinel alongside loaded file skills", async () => {
    const { manager } = planningFixture({
      skills: [
        loadedSkill,
        {
          name: "customize-opencode",
          description: "Built-in configuration guide",
          location: "<built-in>",
          content: "# Configuration guide\n",
        },
      ],
    })
    await expect(manager.getPlanningSkills()).resolves.toEqual({
      toolAvailable: true,
      skills: [
        {
          name: "frontend",
          location: skillLocation,
          content: "\n# Frontend planning\nUse the approved design procedure.\n",
        },
        { name: "customize-opencode", location: "<built-in>", content: "# Configuration guide\n" },
      ],
    })
  })

  it("distinguishes successful empty discovery from an unavailable runtime", async () => {
    const { manager } = planningFixture({ skills: [], tools: ["skill"] })
    await expect(manager.getPlanningSkills()).resolves.toEqual({ toolAvailable: true, skills: [] })
    const { adapter, requests } = planningFixture({ ready: false })
    await expect(adapter.getPlanningSkills()).rejects.toThrow(/not started|not ready/i)
    expect(requests).toEqual([])
  })

  it("invalidates a loaded snapshot immediately when disposal begins", async () => {
    const { manager, adapter } = planningFixture()
    let completeDisposal!: () => void
    const sidecarDisposal = new Promise<void>((resolve) => {
      completeDisposal = resolve
    })
    ;(manager as unknown as { sidecar: { dispose: () => Promise<void> } }).sidecar.dispose = () => sidecarDisposal
    const loadedRevision = adapter.runtimeRevision
    const stopping = manager.dispose()
    try {
      expect(adapter.runtimeRevision).toBeGreaterThan(loadedRevision)
      await expect(adapter.getPlanningSkills()).rejects.toThrow(/not ready/i)
    } finally {
      completeDisposal()
      await stopping
    }
  })

  it("invalidates a loaded snapshot before unexpected-exit recovery finishes", async () => {
    const { manager, adapter } = planningFixture()
    const runtime = manager as unknown as {
      handleSidecarExit: (info: { code: number }) => void
      recoverRuntime: () => Promise<void>
    }
    let completeRecovery!: () => void
    runtime.recoverRuntime = () =>
      new Promise<void>((resolve) => {
        completeRecovery = resolve
      })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const loadedRevision = adapter.runtimeRevision
    try {
      runtime.handleSidecarExit({ code: 1 })
      expect(adapter.runtimeRevision).toBeGreaterThan(loadedRevision)
      await expect(adapter.getPlanningSkills()).rejects.toThrow(/not ready/i)
    } finally {
      completeRecovery()
    }
  })

  it("publishes a new revision only after sidecar startup succeeds", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "wanta-planning-revision-"))
    const toolRuntime = path.join(rootDir, "tool.js")
    await writeFile(toolRuntime, "export {}\n")
    await writeFile(path.join(rootDir, ".connector-output-redaction-v1"), "{}")
    let finishStartup!: () => void
    const startup = new Promise<void>((resolve) => {
      finishStartup = resolve
    })
    const start = vi.spyOn(OpencodeSidecar.prototype, "start").mockImplementation(() => startup)
    vi.spyOn(OpencodeSidecar.prototype, "client", "get").mockReturnValue(planningFixture().manager.client)
    const manager = new AgentManager({
      linkRuntime: null,
      modelAccess: { kind: "local" },
      opencodeBinPath: "/unused/opencode",
      bundledToolRuntimePath: toolRuntime,
      rootDir,
      customModels: [
        {
          id: "fixture",
          providerId: "openai-compatible",
          providerName: "Fixture",
          modelName: "fixture",
          baseUrl: "http://127.0.0.1:9/v1",
          apiKey: "fixture",
          apiKeyConfigured: true,
        },
      ],
      defaultModel: { kind: "custom", id: "fixture" },
    })
    const adapter = new OpencodeAgentAdapter(manager)
    const previousRevision = adapter.runtimeRevision
    const starting = manager.start()
    try {
      await vi.waitFor(() => expect(start).toHaveBeenCalled())
      expect(adapter.runtimeRevision).toBe(previousRevision)
      finishStartup()
      await starting
      expect(adapter.runtimeRevision).toBeGreaterThan(previousRevision)
      await expect(adapter.getPlanningSkills()).resolves.toMatchObject({ toolAvailable: true })
    } finally {
      finishStartup()
      await starting
      await manager.dispose()
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it.each([
    { skillsStatus: 500, skills: { message: "skill lookup unavailable" }, operation: "app.skills" },
    { toolsStatus: 500, tools: { message: "tool registry unavailable" }, operation: "tool.ids" },
  ])("rejects an unsuccessful $operation response", async ({ operation, ...options }) => {
    const { adapter } = planningFixture(options)
    await expect(adapter.getPlanningSkills()).rejects.toThrow(`${operation} failed`)
  })

  it.each([
    { title: "non-array skill data", skills: {} },
    { title: "null skill", skills: [null] },
    { title: "empty name", skills: [{ ...loadedSkill, name: "" }] },
    { title: "untrimmed name", skills: [{ ...loadedSkill, name: " frontend" }] },
    { title: "relative location", skills: [{ ...loadedSkill, location: "frontend/SKILL.md" }] },
    { title: "missing content", skills: [{ name: "frontend", location: skillLocation }] },
    { title: "non-string content", skills: [{ ...loadedSkill, content: {} }] },
    { title: "duplicate name", skills: [loadedSkill, { ...loadedSkill, location: path.resolve("other", "SKILL.md") }] },
    { title: "duplicate location", skills: [loadedSkill, { ...loadedSkill, name: "other" }] },
  ])("fails closed on $title", async ({ skills }) => {
    const { manager } = planningFixture({ skills })
    await expect(manager.getPlanningSkills()).rejects.toThrow(/app.skills.*invalid|app.skills.*duplicate/)
  })

  it.each([
    { title: "non-array tool IDs", tools: {} },
    { title: "non-string tool ID", tools: ["skill", null] },
    { title: "empty tool ID", tools: ["skill", ""] },
    { title: "untrimmed tool ID", tools: ["skill "] },
    { title: "duplicate tool ID", tools: ["skill", "skill"] },
  ])("fails closed on $title", async ({ tools }) => {
    const { adapter } = planningFixture({ tools })
    await expect(adapter.getPlanningSkills()).rejects.toThrow(/tool.ids.*invalid|tool.ids.*duplicate/)
  })
})
