import type { SkillInventory } from "./common.ts"
import type { BigIntStats } from "node:fs"

import { JSON_SCHEMA, load as parseYaml } from "js-yaml"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import path from "node:path"

const maximumDocumentBytes = 64 * 1024

class PlanningSkillError extends Error {
  public constructor(code: "planning_skill_invalid" | "planning_skill_unavailable") {
    super(code)
  }
}

function invalid(): never {
  throw new PlanningSkillError("planning_skill_invalid")
}

function unavailable(): never {
  throw new PlanningSkillError("planning_skill_unavailable")
}

export interface PlanningSkillDocument {
  id: string
  name: string
  location: string
  text: string
  sha256: string
  version: string | null
  packageName: string | null
}

export function stripPlanningSkillFrontmatter(text: string): string {
  const range = frontmatterRange(text)
  return range ? text.slice(range.end) : text
}

export async function resolvePlanningSkillDocument(
  inventory: SkillInventory,
  id: string,
): Promise<PlanningSkillDocument> {
  try {
    const groups = inventory.groups.filter((group) => group.id === id)
    if (groups.length === 0) unavailable()
    if (groups.length !== 1) invalid()
    const hosts = groups[0]!.runtimeHosts.filter(
      (host) =>
        host.scope === "runtime" &&
        host.status === "installed" &&
        typeof host.path === "string" &&
        host.path.length > 0,
    )
    if (hosts.length === 0) unavailable()
    if (hosts.length !== 1) invalid()
    const host = hosts[0]!
    const root = host.path!
    if (!path.isAbsolute(root) || root.includes("\0") || root.split(/[\\/]/).some((segment) => segment === ".."))
      invalid()
    const absoluteRoot = path.resolve(root)
    if (absoluteRoot === path.parse(absoluteRoot).root) invalid()
    if (process.platform === "win32" && absoluteRoot.slice(path.parse(absoluteRoot).root.length).includes(":"))
      invalid()
    const hostVersion = asText(host.version)
    const hostPackageName = asText(host.packageName)
    const documentPath = path.join(absoluteRoot, "SKILL.md")
    const before = await inspectPath(documentPath)
    const canonicalRoot = await realpath(absoluteRoot)
    const canonicalDocument = await realpath(documentPath)
    if (!samePath(canonicalRoot, absoluteRoot) || !samePath(canonicalDocument, path.join(canonicalRoot, "SKILL.md")))
      invalid()
    const documentStat = before.at(-1)!.stat
    if (documentStat.size > BigInt(maximumDocumentBytes)) invalid()

    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    const handle = await open(documentPath, flags)
    let bytes: Buffer
    try {
      const opened = await handle.stat({ bigint: true })
      if (!sameFile(documentStat, opened)) invalid()
      const buffer = Buffer.alloc(maximumDocumentBytes + 1)
      let offset = 0
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
        if (bytesRead === 0) break
        offset += bytesRead
      }
      if (offset > maximumDocumentBytes || BigInt(offset) !== documentStat.size) invalid()
      bytes = buffer.subarray(0, offset)
      if (!sameFile(documentStat, await handle.stat({ bigint: true }))) invalid()
      const after = await inspectPath(documentPath)
      if (
        before.length !== after.length ||
        before.some((entry, index) => !sameIdentity(entry.stat, after[index]!.stat))
      )
        invalid()
      if (!sameFile(documentStat, after.at(-1)!.stat) || !samePath(await realpath(documentPath), canonicalDocument))
        invalid()
    } finally {
      await handle.close()
    }

    let text: string
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      invalid()
    }
    const frontmatter = readFrontmatter(text)
    const metadata = isRecord(frontmatter?.["metadata"]) ? frontmatter["metadata"] : undefined
    return {
      id,
      name: asText(frontmatter?.["name"]) ?? path.basename(canonicalRoot),
      location: canonicalDocument,
      text,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      version: asText(metadata?.["version"]) ?? hostVersion ?? null,
      packageName: asText(metadata?.["packageName"]) ?? hostPackageName ?? null,
    }
  } catch (error) {
    if (error instanceof PlanningSkillError) throw error
    unavailable()
  }
}

async function inspectPath(documentPath: string): Promise<Array<{ path: string; stat: BigIntStats }>> {
  const filesystemRoot = path.parse(documentPath).root
  const segments = documentPath.slice(filesystemRoot.length).split(path.sep).filter(Boolean)
  const entries: Array<{ path: string; stat: BigIntStats }> = []
  let current = filesystemRoot
  for (const segment of segments) {
    current = path.join(current, segment)
    const stat = await lstat(current, { bigint: true })
    if (stat.isSymbolicLink()) invalid()
    if (current === documentPath ? !stat.isFile() : !stat.isDirectory()) invalid()
    entries.push({ path: current, stat })
  }
  return entries
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return (
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

function frontmatterRange(text: string): { start: number; yamlEnd: number; end: number } | undefined {
  const opening = /^(?:\uFEFF)?---\r?\n/.exec(text)
  if (!opening) return undefined
  const closing = /(?:^|\r?\n)---(?:\r?\n|$)/.exec(text.slice(opening[0].length))
  if (!closing) invalid()
  return {
    start: opening[0].length,
    yamlEnd: opening[0].length + closing.index,
    end: opening[0].length + closing.index + closing[0].length,
  }
}

function readFrontmatter(text: string): Record<string, unknown> | undefined {
  const range = frontmatterRange(text)
  if (!range) return undefined
  try {
    const parsed: unknown = parseYaml(text.slice(range.start, range.yamlEnd), { schema: JSON_SCHEMA })
    if (!isRecord(parsed)) invalid()
    return parsed
  } catch {
    invalid()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}
