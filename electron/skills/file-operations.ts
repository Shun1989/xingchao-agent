import type { ManagedSkillGroup } from "./common.ts"
import type { FileHandle } from "node:fs/promises"

import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, rmdir, stat } from "node:fs/promises"
import path from "node:path"
import { logDiagnostic } from "../diagnostics-log.ts"
import { metadataFileName } from "./constants.ts"
import { normalizeMetadata } from "./metadata.ts"

export type SafeSkillDirectoryRemoveStatus = "removed" | "skipped"

export interface SafeSkillDirectoryRemoveResult {
  path: string
  reason?: string
  status: SafeSkillDirectoryRemoveStatus
}

export interface SafeSkillDirectoryRemoveRequest {
  allowedRoots: string[]
  packageName?: string
  path: string
  skillId: string
}

export function normalizeSkillId(skillId: string): string {
  const normalizedSkillId = skillId.trim()

  if (
    !normalizedSkillId ||
    normalizedSkillId.includes("/") ||
    normalizedSkillId.includes("\\") ||
    normalizedSkillId === "." ||
    normalizedSkillId === ".."
  ) {
    throw new Error(`Invalid Skill name: ${skillId}`)
  }

  return normalizedSkillId
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath)
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
}

export function readDeletableSkillTargetPaths(group: ManagedSkillGroup, skillRoots: string[]): string[] {
  const normalizedSkillId = normalizeSkillId(group.id)
  const normalizedSkillRoots = skillRoots.map((skillRoot) => path.resolve(skillRoot))
  const targetPaths = new Set<string>()

  for (const host of group.hosts) {
    const targetPath = host.path ? path.resolve(host.path) : undefined
    if (!targetPath || host.status !== "installed") {
      continue
    }

    if (path.basename(targetPath) !== normalizedSkillId) {
      continue
    }

    if (!normalizedSkillRoots.some((skillRoot) => isPathInside(skillRoot, targetPath))) {
      continue
    }

    targetPaths.add(targetPath)
  }

  return Array.from(targetPaths)
}

export async function removeSkillDirectoryIfSafe(
  request: SafeSkillDirectoryRemoveRequest,
): Promise<SafeSkillDirectoryRemoveResult> {
  const normalizedSkillId = normalizeSkillId(request.skillId)
  const targetPath = path.resolve(request.path)
  const allowedRoots = request.allowedRoots.map((skillRoot) => path.resolve(skillRoot))

  if (path.basename(targetPath) !== normalizedSkillId) {
    return skipped(targetPath, "basename-mismatch")
  }

  if (!allowedRoots.some((allowedRoot) => isPathInside(allowedRoot, targetPath))) {
    return skipped(targetPath, "outside-allowed-roots")
  }

  const targetStat = await lstat(targetPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  })
  if (!targetStat) {
    return skipped(targetPath, "missing")
  }
  if (!targetStat.isDirectory() && !targetStat.isSymbolicLink()) {
    return skipped(targetPath, "not-directory")
  }

  if (targetStat.isSymbolicLink() && !(await isRealPathInsideAllowedRoots(targetPath, allowedRoots))) {
    return skipped(targetPath, "symlink-target-outside-allowed-roots")
  }

  const quarantinePath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.remove-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  let quarantined = false

  try {
    await rename(targetPath, quarantinePath)
    quarantined = true

    const quarantinedStat = await lstat(quarantinePath)
    if (!isSameFile(targetStat, quarantinedStat)) {
      await restoreQuarantinedTarget(quarantinePath, targetPath)
      quarantined = false
      return skipped(targetPath, "target-changed")
    }

    const validationSkipReason = await validateQuarantinedSkillRemovalTarget({
      allowedRoots,
      packageName: request.packageName,
      path: quarantinePath,
    })
    if (validationSkipReason) {
      const restoreStatus = await restoreQuarantinedTarget(quarantinePath, targetPath)
      quarantined = false
      return skipped(targetPath, restoreStatus === "restored" ? validationSkipReason : "target-changed")
    }

    await rm(quarantinePath, { force: true, recursive: true })
    quarantined = false
    return {
      path: targetPath,
      status: "removed",
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return skipped(targetPath, "missing")
    }
    if (quarantined) {
      const restoreStatus = await restoreQuarantinedTarget(quarantinePath, targetPath)
      if (restoreStatus !== "restored") {
        throw new Error("Skill delete target changed while restoring quarantine.", { cause: error })
      }
    }
    throw error
  }
}

async function validateQuarantinedSkillRemovalTarget({
  allowedRoots,
  packageName,
  path: targetPath,
}: {
  allowedRoots: string[]
  packageName?: string
  path: string
}): Promise<string | undefined> {
  const targetStat = await lstat(targetPath)
  if (!targetStat.isDirectory() && !targetStat.isSymbolicLink()) {
    return "not-directory"
  }
  if (targetStat.isSymbolicLink() && !(await isRealPathInsideAllowedRoots(targetPath, allowedRoots))) {
    return "symlink-target-outside-allowed-roots"
  }
  const metadata = await readSkillDirectoryMetadata(targetPath)
  const hasSkillDocument = await localPathExists(path.join(targetPath, "SKILL.md"))
  if (!metadata && !hasSkillDocument) {
    return "skill-definition-missing"
  }
  const expectedPackageName = packageName?.trim()
  if (expectedPackageName && metadata?.packageName !== expectedPackageName) {
    return "package-name-mismatch"
  }
  return undefined
}

export async function restoreQuarantinedTarget(
  quarantinePath: string,
  targetPath: string,
): Promise<"restored" | "target-changed"> {
  const targetStat = await lstat(targetPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  })
  if (targetStat) {
    if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
      return "target-changed"
    }
    const entries = await readdir(targetPath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined
      }
      throw error
    })
    if (entries && entries.length > 0) {
      return "target-changed"
    }
    if (entries) {
      await rmdir(targetPath).catch((error: unknown) => {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ENOENT") {
          return
        }
        if (code === "ENOTEMPTY" || code === "EEXIST") {
          return
        }
        throw error
      })
      if (await localPathExists(targetPath)) {
        return "target-changed"
      }
    }
  }

  await rename(quarantinePath, targetPath)
  return "restored"
}

function isSameFile(left: { dev: number; ino: number }, right: { dev: number; ino: number }): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

export async function localPathExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname)
    return true
  } catch {
    return false
  }
}

async function isRealPathInsideAllowedRoots(targetPath: string, allowedRoots: string[]): Promise<boolean> {
  const [targetRealPath, ...rootRealPaths] = await Promise.all([
    realpath(targetPath),
    ...allowedRoots.map((allowedRoot) => realpath(allowedRoot).catch(() => allowedRoot)),
  ])
  return rootRealPaths.some((allowedRoot) => isPathInside(allowedRoot, targetRealPath))
}

async function readSkillDirectoryMetadata(
  targetPath: string,
): Promise<ReturnType<typeof normalizeMetadata> | undefined> {
  try {
    return normalizeMetadata(await readFile(path.join(targetPath, metadataFileName), "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

function skipped(pathname: string, reason: string): SafeSkillDirectoryRemoveResult {
  return {
    path: pathname,
    reason,
    status: "skipped",
  }
}

export async function assertCanReplaceSharedSkillTarget(
  targetPath: string,
  options: { force: boolean },
): Promise<void> {
  if (!(await localPathExists(targetPath))) {
    return
  }

  if (options.force) {
    return
  }

  if (await localPathExists(path.join(targetPath, metadataFileName))) {
    return
  }

  throw new Error("A local Skill with the same name already exists in the shared Agent Skills directory.")
}

interface ReplaceDirectoryDependencies {
  openSourceFile: (sourcePath: string) => Promise<FileHandle>
  readdir: (directoryPath: string) => Promise<string[]>
  rename: (sourcePath: string, targetPath: string) => Promise<void>
  wait: (milliseconds: number) => Promise<void>
}

const defaultReplaceDirectoryDependencies: ReplaceDirectoryDependencies = {
  openSourceFile: (sourcePath) => open(sourcePath, "r"),
  readdir,
  rename,
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}

export async function replaceDirectory(
  sourcePath: string,
  targetPath: string,
  dependencyOverrides: Partial<ReplaceDirectoryDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultReplaceDirectoryDependencies, ...dependencyOverrides }
  const parentPath = path.dirname(targetPath)
  const targetName = path.basename(targetPath)
  const operationId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const tempPath = path.join(parentPath, `.${targetName}.tmp-${operationId}`)
  const backupPath = path.join(parentPath, `.${targetName}.backup-${operationId}`)
  let hasBackup = false
  let preserveBackup = false

  await mkdir(parentPath, { recursive: true })
  await rm(tempPath, { force: true, recursive: true })
  await rm(backupPath, { force: true, recursive: true })

  try {
    await copyDirectoryMaterialized(sourcePath, tempPath, dependencies)

    if (await localPathExists(targetPath)) {
      await renameWithTransientRetry(targetPath, backupPath, dependencies)
      hasBackup = true
    }

    try {
      await renameWithTransientRetry(tempPath, targetPath, dependencies)
    } catch (cause) {
      if (hasBackup) {
        try {
          await renameWithTransientRetry(backupPath, targetPath, dependencies)
          hasBackup = false
        } catch (rollbackError) {
          preserveBackup = true
          console.warn("[wanta] replaceDirectory rollback failed; backup preserved", {
            backupPath,
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          })
          logDiagnostic(
            "skills",
            "replaceDirectory rollback failed; backup preserved",
            { backupPath, error: rollbackError },
            "error",
          )
        }
      }
      throw cause
    }

    if (hasBackup) {
      await rm(backupPath, { force: true, recursive: true })
      hasBackup = false
    }
  } finally {
    await cleanupDirectory(tempPath, "temporary skill directory")
    if (hasBackup && !preserveBackup) {
      await cleanupDirectory(backupPath, "skill backup directory")
    }
  }
}

async function renameWithTransientRetry(
  sourcePath: string,
  targetPath: string,
  dependencies: ReplaceDirectoryDependencies,
): Promise<void> {
  const retryDelays = [25, 50, 100]
  for (let attempt = 0; ; attempt += 1) {
    try {
      await dependencies.rename(sourcePath, targetPath)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const delay = retryDelays[attempt]
      if (delay === undefined || (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")) {
        throw error
      }
      await dependencies.wait(delay)
    }
  }
}

async function copyDirectoryMaterialized(
  sourcePath: string,
  targetPath: string,
  dependencies: ReplaceDirectoryDependencies,
): Promise<void> {
  const sourceRoot = await realpath(sourcePath)
  await copyMaterializedEntry(sourcePath, targetPath, sourceRoot, new Set<string>(), dependencies)
}

async function copyMaterializedEntry(
  sourcePath: string,
  targetPath: string,
  sourceRoot: string,
  activeDirectories: Set<string>,
  dependencies: ReplaceDirectoryDependencies,
): Promise<void> {
  const sourceStat = await lstat(sourcePath)
  const resolvedSourcePath = sourceStat.isSymbolicLink() ? await realpath(sourcePath) : sourcePath
  const resolvedStat = sourceStat.isSymbolicLink() ? await stat(sourcePath) : sourceStat
  const resolvedRealPath = await realpath(resolvedSourcePath)
  const snapshot = {
    resolvedRealPath,
    resolvedStat,
    sourceStat,
  }

  if (resolvedRealPath !== sourceRoot && !isPathInside(sourceRoot, resolvedRealPath)) {
    throw new Error(`External Skill link escapes its source directory: ${sourcePath}`)
  }

  if (resolvedStat.isDirectory()) {
    if (activeDirectories.has(resolvedRealPath)) {
      throw new Error(`External Skill link creates a directory cycle: ${sourcePath}`)
    }
    activeDirectories.add(resolvedRealPath)
    try {
      await mkdir(targetPath, { recursive: true })
      const entries = await dependencies.readdir(resolvedSourcePath)
      for (const entry of entries) {
        await copyMaterializedEntry(
          path.join(resolvedSourcePath, entry),
          path.join(targetPath, entry),
          sourceRoot,
          activeDirectories,
          dependencies,
        )
      }
      await assertSourceEntryUnchanged(sourcePath, snapshot)
      const currentEntries = await dependencies.readdir(resolvedSourcePath)
      if (!sameDirectoryEntries(entries, currentEntries)) {
        throw new Error(`External Skill directory changed during mirroring: ${sourcePath}`)
      }
    } finally {
      activeDirectories.delete(resolvedRealPath)
    }
    return
  }

  if (!resolvedStat.isFile()) {
    throw new Error(`External Skill contains an unsupported filesystem entry: ${sourcePath}`)
  }
  await copyFromStableSourceHandle(resolvedSourcePath, targetPath, snapshot.resolvedStat, dependencies)
  await assertSourceEntryUnchanged(sourcePath, snapshot)
}

async function copyFromStableSourceHandle(
  sourcePath: string,
  targetPath: string,
  expectedStat: { dev: number; ino: number; mode: number },
  dependencies: ReplaceDirectoryDependencies,
): Promise<void> {
  const sourceHandle = await dependencies.openSourceFile(sourcePath)
  try {
    if (!isSameFile(await sourceHandle.stat(), expectedStat)) {
      throw new Error(`External Skill entry changed during mirroring: ${sourcePath}`)
    }
    const targetHandle = await open(targetPath, "wx", expectedStat.mode & 0o777)
    try {
      await targetHandle.chmod(expectedStat.mode & 0o777)
      const buffer = Buffer.allocUnsafe(64 * 1024)
      for (;;) {
        const { bytesRead } = await sourceHandle.read(buffer, 0, buffer.length, null)
        if (bytesRead === 0) {
          break
        }
        let written = 0
        while (written < bytesRead) {
          const result = await targetHandle.write(buffer, written, bytesRead - written)
          if (result.bytesWritten === 0) {
            throw new Error(`External Skill staging write made no progress: ${targetPath}`)
          }
          written += result.bytesWritten
        }
      }
    } finally {
      await targetHandle.close()
    }
  } finally {
    await sourceHandle.close()
  }
}

async function assertSourceEntryUnchanged(
  sourcePath: string,
  snapshot: {
    resolvedRealPath: string
    resolvedStat: { dev: number; ino: number }
    sourceStat: { dev: number; ino: number; isSymbolicLink(): boolean }
  },
): Promise<void> {
  try {
    const currentSourceStat = await lstat(sourcePath)
    const currentResolvedRealPath = await realpath(sourcePath)
    const currentResolvedStat = await stat(sourcePath)
    if (
      currentSourceStat.isSymbolicLink() !== snapshot.sourceStat.isSymbolicLink() ||
      !isSameFile(currentSourceStat, snapshot.sourceStat) ||
      currentResolvedRealPath !== snapshot.resolvedRealPath ||
      !isSameFile(currentResolvedStat, snapshot.resolvedStat)
    ) {
      throw new Error(`External Skill entry changed during mirroring: ${sourcePath}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("External Skill entry changed")) {
      throw error
    }
    throw new Error(`External Skill entry changed during mirroring: ${sourcePath}`, { cause: error })
  }
}

function sameDirectoryEntries(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((entry, index) => entry === sortedRight[index])
}

async function cleanupDirectory(targetPath: string, scope: string): Promise<void> {
  try {
    await rm(targetPath, { force: true, recursive: true })
  } catch (error) {
    console.warn(`[wanta] failed to clean up ${scope}:`, error)
    logDiagnostic("skills", "failed to clean up directory", { error, path: targetPath, scope }, "warn")
  }
}
