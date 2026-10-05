import type { AuthManager } from "../auth/node.ts"
import type { InvokeRequest } from "../ipc/connection.ts"

import assert from "node:assert/strict"
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, test, vi } from "vitest"
import { ConnectionServer } from "../ipc/connection.ts"
import { ServiceEvent } from "../service-events.ts"

const runtime = vi.hoisted(() => ({ root: "" }))

vi.mock("electron", () => ({
  app: {
    getPath: () => runtime.root,
    isReady: () => false,
    whenReady: () => new Promise<void>(() => {}),
  },
  shell: {},
}))
vi.mock("../agents/catalog.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/catalog.ts")>()),
  listDiscoveredAgents: async () => [],
  supportedAgents: [],
}))
vi.mock("../diagnostics-log.ts", () => ({
  logDiagnostic: () => {},
  logDiagnosticOnChange: () => {},
}))

const { SkillServiceImpl } = await import("./node.ts")
const roots: string[] = []
const services: InstanceType<typeof SkillServiceImpl>[] = []

afterEach(async () => {
  for (const service of services.splice(0)) service.dispose()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  runtime.root = await mkdtemp(path.join(os.tmpdir(), "wanta-planning-resolver-"))
  roots.push(runtime.root)
  const skillRoot = path.join(runtime.root, "agent", "workspace", ".opencode", "skills")
  const skillPath = path.join(skillRoot, "first")
  await mkdir(skillPath, { recursive: true })
  await writeFile(path.join(skillPath, "SKILL.md"), "---\nname: first\n---\nFirst body\n")
  const service = new SkillServiceImpl({
    stateChanged: new ServiceEvent(),
  } as unknown as AuthManager)
  services.push(service)
  return { root: runtime.root, service, skillRoot }
}

test("planning resolution refreshes actual inventory without writing manifest or installing skills", async () => {
  const { root, service, skillRoot } = await fixture()
  assert.equal((await service.resolvePlanningSkill("first")).text, "---\nname: first\n---\nFirst body\n")
  const latePath = path.join(skillRoot, "late")
  await mkdir(latePath)
  await writeFile(path.join(latePath, "SKILL.md"), "---\nname: late\n---\nLate body\n")
  assert.equal((await service.resolvePlanningSkill("late")).name, "late")
  await assert.rejects(access(path.join(root, "skills", "manifest.json")), { code: "ENOENT" })
  await assert.rejects(access(path.join(root, "agent", "oo-store")), { code: "ENOENT" })
  assert.equal(await readFile(path.join(latePath, "SKILL.md"), "utf8"), "---\nname: late\n---\nLate body\n")
})

test("planning resolution rejects a stale inventory entry after its directory disappears", async () => {
  const { service, skillRoot } = await fixture()
  await service.resolvePlanningSkill("first")
  await rm(path.join(skillRoot, "first"), { recursive: true })
  await assert.rejects(service.resolvePlanningSkill("first"), /^Error: planning_skill_unavailable$/)
})

test("planning resolver remains inaccessible to renderer IPC", async () => {
  const { service } = await fixture()
  let invoke: ((request: InvokeRequest) => Promise<unknown>) | undefined
  const server = new ConnectionServer({
    start: (handler) => {
      invoke = handler
    },
    broadcast: () => {},
    dispose: () => {},
  })
  server.registerService(service)
  server.start()
  await assert.rejects(
    invoke!({ service: service.definition.name, method: "resolvePlanningSkill", args: ["first"] }),
    /Unknown IPC method/,
  )
  server.dispose()
})
