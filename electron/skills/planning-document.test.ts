import type { SkillInventory } from "./common.ts"

import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, test, vi } from "vitest"
import { buildSummary, groupInstalledSkills } from "./inventory.ts"
import { resolvePlanningSkillDocument, stripPlanningSkillFrontmatter } from "./planning-document.ts"
import { scanWantaInstalledSkills } from "./scan.ts"

const io = vi.hoisted(() => ({
  afterRead: undefined as (() => Promise<void>) | undefined,
  openError: undefined as Error | undefined,
}))

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      if (io.openError) throw io.openError
      const handle = await actual.open(...args)
      if (io.afterRead) {
        const read = handle.read.bind(handle)
        vi.spyOn(handle, "read").mockImplementation(async (...readArgs: Parameters<typeof handle.read>) => {
          const result = await read(...readArgs)
          const afterRead = io.afterRead
          io.afterRead = undefined
          await afterRead?.()
          return result
        })
      }
      return handle
    },
  }
})

const temporaryRoots: string[] = []

afterEach(async () => {
  io.afterRead = undefined
  io.openError = undefined
  vi.restoreAllMocks()
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

async function fixture(text = "---\nname: example\n---\n# Real instructions\n") {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-planning-document-"))
  temporaryRoots.push(root)
  const skillPath = path.join(root, "skills", "example")
  const documentPath = path.join(skillPath, "SKILL.md")
  await mkdir(skillPath, { recursive: true })
  await writeFile(documentPath, text)
  const installed = await scanWantaInstalledSkills({
    cacheSkillStoreRoot: path.join(root, "cache"),
    sharedSkillRoot: path.join(root, "skills"),
  })
  const groups = groupInstalledSkills(installed, { records: [], schemaVersion: 1 })
  const inventory: SkillInventory = { groups, summary: buildSummary(groups), updatedAt: "2026-10-05T00:00:00Z" }
  assert.equal(groups.length, 1)
  return { documentPath, inventory, root, skillPath, text }
}

test("resolves the selected runtime document with exact bytes and actual metadata", async () => {
  const text = "---\nname: example\nmetadata:\n  packageName: '@real/package'\n  version: '2.3.4'\n---\n# 执行正文\n"
  const item = await fixture(text)
  Object.assign(item.inventory.groups[0]!, { name: "Renderer title", packageName: "@fake/package", version: "9" })
  Object.assign(item.inventory.groups[0]!.runtimeHosts[0]!, { packageName: "@stale/package", version: "0" })
  assert.deepEqual(await resolvePlanningSkillDocument(item.inventory, "example"), {
    id: "example",
    name: "example",
    location: await realpath(item.documentPath),
    text,
    sha256: createHash("sha256").update(text).digest("hex"),
    version: "2.3.4",
    packageName: "@real/package",
  })
})

test("does not invent version or package from group metadata", async () => {
  const { inventory } = await fixture()
  Object.assign(inventory.groups[0]!, { version: "9.9.9", packageName: "@fake/package" })
  const document = await resolvePlanningSkillDocument(inventory, "example")
  assert.equal(document.version, null)
  assert.equal(document.packageName, null)
})

test("accepts actual refreshed host metadata when frontmatter does not contain it", async () => {
  const { inventory } = await fixture()
  Object.assign(inventory.groups[0]!.runtimeHosts[0]!, { version: "1.2.0", packageName: "@host/package" })
  const document = await resolvePlanningSkillDocument(inventory, "example")
  assert.equal(document.version, "1.2.0")
  assert.equal(document.packageName, "@host/package")
})

test("selects an exact ID even when another group has the same display name", async () => {
  const { inventory, root } = await fixture()
  const otherPath = path.join(root, "other")
  await mkdir(otherPath)
  await writeFile(path.join(otherPath, "SKILL.md"), "---\nname: other\n---\nOther body\n")
  const original = inventory.groups[0]!
  inventory.groups.unshift({
    ...original,
    id: "other-id",
    name: "example",
    runtimeHosts: [{ ...original.runtimeHosts[0]!, path: otherPath }],
  })
  assert.equal((await resolvePlanningSkillDocument(inventory, "example")).name, "example")
  assert.equal((await resolvePlanningSkillDocument(inventory, "other-id")).name, "other")
  await assert.rejects(resolvePlanningSkillDocument(inventory, " example "), /^Error: planning_skill_unavailable$/)
})

test("rejects duplicated exact group IDs", async () => {
  const { inventory } = await fixture()
  inventory.groups.push({ ...inventory.groups[0]! })
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects multiple installed runtime hosts even when their paths match", async () => {
  const { inventory } = await fixture()
  inventory.groups[0]!.runtimeHosts.push({ ...inventory.groups[0]!.runtimeHosts[0]!, agentId: "second" })
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("does not substitute an external host or sourcePath for the runtime path", async () => {
  const { inventory, skillPath } = await fixture()
  const group = inventory.groups[0]!
  group.externalHosts = [{ ...group.runtimeHosts[0]!, scope: "external", path: skillPath }]
  group.hosts = group.externalHosts
  group.runtimeHosts = [{ ...group.externalHosts[0]!, scope: "runtime", path: undefined, sourcePath: skillPath }]
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_unavailable$/)
  group.runtimeHosts = [{ ...group.externalHosts[0]! }]
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_unavailable$/)
})

test("rejects missing runtime document without leaking its location", async () => {
  const { documentPath, inventory } = await fixture()
  await rm(documentPath)
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_unavailable$/)
})

test("rejects a runtime host marked missing even when the file exists", async () => {
  const { inventory } = await fixture()
  inventory.groups[0]!.runtimeHosts[0]!.status = "missing"
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_unavailable$/)
})

test("accepts exactly 64 KiB and rejects a larger complete document", async () => {
  const { documentPath, inventory } = await fixture()
  const header = "---\nname: example\n---\n"
  const text = header + "a".repeat(64 * 1024 - Buffer.byteLength(header))
  await writeFile(documentPath, text)
  assert.equal((await resolvePlanningSkillDocument(inventory, "example")).text, text)
  await writeFile(documentPath, text + "b")
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects a directory in place of SKILL.md", async () => {
  const { documentPath, inventory } = await fixture()
  await rm(documentPath)
  await mkdir(documentPath)
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects a junction or symlink runtime root", async () => {
  const { inventory, root, skillPath } = await fixture()
  const link = path.join(root, "linked-skill")
  await symlink(skillPath, link, process.platform === "win32" ? "junction" : "dir")
  inventory.groups[0]!.runtimeHosts[0]!.path = link
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects a junction or symlink in a parent path", async () => {
  const { inventory, root } = await fixture()
  const link = path.join(root, "linked-parent")
  await symlink(path.join(root, "skills"), link, process.platform === "win32" ? "junction" : "dir")
  inventory.groups[0]!.runtimeHosts[0]!.path = path.join(link, "example")
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects a symlink SKILL.md even when its target stays in the runtime root", async (context) => {
  const { documentPath, inventory, skillPath, text } = await fixture()
  const target = path.join(skillPath, "actual.md")
  await writeFile(target, text)
  await rm(documentPath)
  try {
    await symlink(target, documentPath, "file")
  } catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") {
      context.skip()
      return
    }
    throw error
  }
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects path traversal and a relative runtime host path", async () => {
  const { inventory, root } = await fixture()
  for (const pathname of [
    path.join(root, "skills") + `${path.sep}..${path.sep}skills${path.sep}example`,
    "skills/example",
  ]) {
    inventory.groups[0]!.runtimeHosts[0]!.path = pathname
    await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
  }
})

test("rejects invalid UTF8 instead of hashing replacement text", async () => {
  const { documentPath, inventory } = await fixture()
  await writeFile(documentPath, Buffer.from([0xc3, 0x28]))
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects content modified while the document is read", async () => {
  const { documentPath, inventory } = await fixture()
  io.afterRead = () => writeFile(documentPath, "---\nname: example\n---\nReplaced longer content\n")
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects same-length content modified while the document is read", async () => {
  const { documentPath, inventory, text } = await fixture()
  io.afterRead = () => writeFile(documentPath, text.replace("Real", "Fake"))
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("rejects an inode replacement while the document is read", async () => {
  const { documentPath, inventory, text } = await fixture()
  io.afterRead = async () => {
    await rm(documentPath)
    await writeFile(documentPath, text)
  }
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("redacts injected filesystem errors", async () => {
  const { inventory, documentPath } = await fixture()
  io.openError = new Error(`secret body and path: ${documentPath}`)
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_unavailable$/)
})

test("strips only the actual frontmatter range while preserving body whitespace", () => {
  assert.equal(
    stripPlanningSkillFrontmatter("---\r\nname: example\r\n---\r\n\r\n# Body\r\n  \r\n"),
    "\r\n# Body\r\n  \r\n",
  )
  assert.equal(stripPlanningSkillFrontmatter("# Body\n---\n"), "# Body\n---\n")
})

test("rejects malformed frontmatter instead of using group metadata", async () => {
  const { documentPath, inventory } = await fixture()
  await writeFile(documentPath, "---\nname: [broken\n---\nBody\n")
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
  await writeFile(documentPath, "---\nname: example\nBody without closing delimiter\n")
  await assert.rejects(resolvePlanningSkillDocument(inventory, "example"), /^Error: planning_skill_invalid$/)
})

test("uses the actual directory name when frontmatter has no valid name", async () => {
  const { documentPath, inventory } = await fixture()
  inventory.groups[0]!.name = "Claimed renderer name"
  await writeFile(
    documentPath,
    "---\nname: 17\nmetadata:\n  version: false\n  packageName: ['fake']\n---\nActual body\n",
  )
  const document = await resolvePlanningSkillDocument(inventory, "example")
  assert.equal(document.name, "example")
  assert.equal(document.version, null)
  assert.equal(document.packageName, null)
})
