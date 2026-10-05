import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { loadActuatorLegionKnowledge } from "./actuator-knowledge.ts"

const sourceDirectory = fileURLToPath(new URL("../../docs/actuator-design-legion/", import.meta.url))
const documentNames = ["knowledge.md", "cases.json", "acceptance.md", "sources.json", "design-input.json"]
const sourceIds = [
  "SRC-INPUT-01",
  "SRC-EVIDENCE-01",
  "SRC-GEOMETRY-01",
  "SRC-ASSEMBLY-01",
  "SRC-PORTABLE-01",
  "SRC-STEP-CHECK-01",
  "SRC-ACTUATOR-STEP-01",
  "SRC-ACTUATOR-SCOPE-01",
  "SRC-HAND-REOPEN-01",
  "SRC-HAND-PATH-01",
  "SRC-HAND-POSE-01",
  "SRC-ENGINE-MOTION-01",
  "SRC-ENGINE-KINEMATICS-01",
  "SRC-LIBRARY-GAPS-01",
]
const digest = "0e3e2d0276f207fac845d1339162798111c86594a3d0d63b165a5e5a1803c44b"
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-actuator-knowledge-"))
  temporaryDirectories.push(root)
  return root
}

async function copyKnowledge(): Promise<string> {
  const root = await temporaryRoot()
  const directory = path.join(root, "knowledge")
  await mkdir(directory)
  await Promise.all(documentNames.map((name) => copyFile(path.join(sourceDirectory, name), path.join(directory, name))))
  return directory
}

async function expectRejected(directory: string, reason: RegExp): Promise<void> {
  const error = await loadActuatorLegionKnowledge(directory).catch((cause: unknown) => cause)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toMatch(reason)
  expect((error as Error).message).not.toContain(directory)
  expect((error as Error).message).not.toContain("knowledge.md")
  expect(error).not.toHaveProperty("cause")
}

describe("app-owned Actuator knowledge reader", () => {
  it("returns the verified public document bodies and source IDs from the real directory", async () => {
    const bundle = await loadActuatorLegionKnowledge(sourceDirectory)
    expect(bundle).toMatchObject({ id: "actuator-design-legion-knowledge", version: "1.0.0", digest, sourceIds })
    expect(bundle.documents.map((document) => document.name)).toEqual(documentNames)
    for (const document of bundle.documents) {
      const raw = await readFile(path.join(sourceDirectory, document.name))
      expect(document.text).toBe(raw.toString("utf8"))
      expect(document.sha256).toBe(createHash("sha256").update(raw).digest("hex"))
    }
  })

  it("loads an identical app-owned copy without relying on the repository path or public index", async () => {
    const directory = await copyKnowledge()
    expect(await loadActuatorLegionKnowledge(directory)).toEqual(await loadActuatorLegionKnowledge(sourceDirectory))
  })

  it.each(documentNames)("rejects a missing required document (%s)", async (name) => {
    const directory = await copyKnowledge()
    await rm(path.join(directory, name))
    await expectRejected(directory, /unavailable/i)
  })

  it.each(documentNames)("rejects a changed raw byte before returning its body (%s)", async (name) => {
    const directory = await copyKnowledge()
    const file = path.join(directory, name)
    const raw = await readFile(file)
    raw[0] = raw[0]! ^ 1
    await writeFile(file, raw)
    await expectRejected(directory, /integrity/i)
  })

  it.each(documentNames)("rejects a document above the 16 KiB limit (%s)", async (name) => {
    const directory = await copyKnowledge()
    await writeFile(path.join(directory, name), Buffer.alloc(16 * 1024 + 1))
    await expectRejected(directory, /size limit/i)
  })

  it("rejects a required document that is a directory instead of a regular file", async () => {
    const directory = await copyKnowledge()
    await rm(path.join(directory, "knowledge.md"))
    await mkdir(path.join(directory, "knowledge.md"))
    await expectRejected(directory, /path rejected/i)
  })

  it("rejects a file symlink or Windows junction under an allowed document name", async () => {
    const directory = await copyKnowledge()
    const linkedDocument = path.join(directory, "knowledge.md")
    await rm(linkedDocument)
    if (process.platform === "win32") {
      const targetDirectory = path.join(path.dirname(directory), "outside")
      await mkdir(targetDirectory)
      await copyFile(path.join(sourceDirectory, "knowledge.md"), path.join(targetDirectory, "knowledge.md"))
      await symlink(targetDirectory, linkedDocument, "junction")
    } else {
      await symlink(path.join(sourceDirectory, "knowledge.md"), linkedDocument, "file")
    }
    await expectRejected(directory, /path rejected/i)
  })

  it.each(["root", "ancestor"])(
    "rejects a linked directory before reading its document bodies (%s)",
    async (location) => {
      const directory = await copyKnowledge()
      const linkedDirectory = path.join(path.dirname(directory), "linked")
      const target = location === "root" ? directory : path.dirname(directory)
      await symlink(target, linkedDirectory, process.platform === "win32" ? "junction" : "dir")
      await expectRejected(
        location === "root" ? linkedDirectory : path.join(linkedDirectory, "knowledge"),
        /path rejected/i,
      )
    },
  )

  it("does not read or reject files outside the fixed document allowlist", async () => {
    const directory = await copyKnowledge()
    await mkdir(path.join(directory, "README.md"))
    await mkdir(path.join(directory, "growth.md"))
    await writeFile(path.join(directory, "runtime-binding.json"), "not a trusted index")
    const bundle = await loadActuatorLegionKnowledge(directory)
    expect(bundle.digest).toBe(digest)
    expect(bundle.documents.map((document) => document.name)).toEqual(documentNames)
    expect(bundle.sourceIds).toEqual(sourceIds)
  })

  it("does not let a public runtime index authorize altered document bytes or additional paths", async () => {
    const directory = await copyKnowledge()
    const forgedBody = "An unverified public-index replacement"
    await writeFile(path.join(directory, "knowledge.md"), forgedBody)
    await writeFile(
      path.join(directory, "runtime-binding.json"),
      JSON.stringify({
        id: "actuator-design-legion-knowledge",
        version: "1.0.0",
        documents: [
          { name: "knowledge.md", sha256: createHash("sha256").update(forgedBody).digest("hex") },
          { name: "../../outside.md", sha256: "0".repeat(64) },
        ],
      }),
    )
    await expectRejected(directory, /integrity/i)
  })

  it("redacts filesystem errors when the knowledge directory is unavailable", async () => {
    const root = await temporaryRoot()
    await expectRejected(path.join(root, "missing"), /unavailable/i)
  })
})
