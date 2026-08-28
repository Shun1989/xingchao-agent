import assert from "node:assert/strict"
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "vitest"
import { metadataFileName } from "./constants.ts"
import { removeSkillDirectoryIfSafe, replaceDirectory, restoreQuarantinedTarget } from "./file-operations.ts"

async function exists(pathname: string): Promise<boolean> {
  try {
    await access(pathname)
    return true
  } catch {
    return false
  }
}

async function writeRegistrySkill(root: string, skillId: string, packageName: string): Promise<string> {
  const skillPath = path.join(root, skillId)
  await mkdir(skillPath, { recursive: true })
  await writeFile(path.join(skillPath, "SKILL.md"), `---\nname: ${skillId}\n---\n`, "utf8")
  await writeFile(
    path.join(skillPath, metadataFileName),
    JSON.stringify({
      kind: "registry",
      packageName,
      schemaVersion: 1,
      version: "1.0.0",
    }),
    "utf8",
  )
  return skillPath
}

test("removeSkillDirectoryIfSafe removes a matching registry skill directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const skillPath = await writeRegistrySkill(root, "example", "@oomol/example")

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    packageName: "@oomol/example",
    path: skillPath,
    skillId: "example",
  })

  assert.equal(result.status, "removed")
  assert.equal(await exists(skillPath), false)
})

test("removeSkillDirectoryIfSafe rejects paths outside allowed roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-outside-"))
  const skillPath = await writeRegistrySkill(outside, "example", "@oomol/example")

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    packageName: "@oomol/example",
    path: skillPath,
    skillId: "example",
  })

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "outside-allowed-roots")
  assert.equal(await exists(skillPath), true)
})

test("removeSkillDirectoryIfSafe rejects basename mismatches", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const skillPath = await writeRegistrySkill(root, "different", "@oomol/example")

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    packageName: "@oomol/example",
    path: skillPath,
    skillId: "example",
  })

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "basename-mismatch")
  assert.equal(await exists(skillPath), true)
})

test("removeSkillDirectoryIfSafe rejects registry package mismatches", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const skillPath = await writeRegistrySkill(root, "example", "@oomol/example")

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    packageName: "@other/example",
    path: skillPath,
    skillId: "example",
  })

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "package-name-mismatch")
  assert.equal(await exists(skillPath), true)
})

test("removeSkillDirectoryIfSafe rejects missing paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const skillPath = path.join(root, "example")

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    packageName: "@oomol/example",
    path: skillPath,
    skillId: "example",
  })

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "missing")
})

test("removeSkillDirectoryIfSafe rejects non-directory targets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const skillPath = path.join(root, "example")
  await writeFile(skillPath, "not a directory", "utf8")

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    packageName: "@oomol/example",
    path: skillPath,
    skillId: "example",
  })

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "not-directory")
  assert.equal(await exists(skillPath), true)
})

test("removeSkillDirectoryIfSafe rejects directories without skill definitions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const skillPath = path.join(root, "example")
  await mkdir(skillPath, { recursive: true })

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    path: skillPath,
    skillId: "example",
  })

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "skill-definition-missing")
  assert.equal(await exists(skillPath), true)
})

test("removeSkillDirectoryIfSafe rejects registry package checks when metadata is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const skillPath = path.join(root, "example")
  await mkdir(skillPath, { recursive: true })
  await writeFile(path.join(skillPath, "SKILL.md"), "---\nname: example\n---\n", "utf8")

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    packageName: "@oomol/example",
    path: skillPath,
    skillId: "example",
  })

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "package-name-mismatch")
  assert.equal(await exists(skillPath), true)
})

test("removeSkillDirectoryIfSafe rejects symlinks pointing outside allowed roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-remove-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-outside-"))
  const outsideSkillPath = await writeRegistrySkill(outside, "example", "@oomol/example")
  const linkPath = path.join(root, "example")
  await symlink(outsideSkillPath, linkPath, process.platform === "win32" ? "junction" : undefined)

  const result = await removeSkillDirectoryIfSafe({
    allowedRoots: [root],
    packageName: "@oomol/example",
    path: linkPath,
    skillId: "example",
  })

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "symlink-target-outside-allowed-roots")
  assert.equal(await exists(linkPath), true)
  assert.equal(await exists(outsideSkillPath), true)
})

test("restoreQuarantinedTarget restores over an empty recreated target", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-restore-"))
  const quarantinePath = path.join(root, ".example.remove-test")
  const targetPath = path.join(root, "example")
  await mkdir(quarantinePath, { recursive: true })
  await writeFile(path.join(quarantinePath, "original.txt"), "original", "utf8")
  await mkdir(targetPath, { recursive: true })

  const result = await restoreQuarantinedTarget(quarantinePath, targetPath)

  assert.equal(result, "restored")
  assert.equal(await readFile(path.join(targetPath, "original.txt"), "utf8"), "original")
  assert.equal(await exists(quarantinePath), false)
})

test("restoreQuarantinedTarget refuses to overwrite a changed target", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-restore-"))
  const quarantinePath = path.join(root, ".example.remove-test")
  const targetPath = path.join(root, "example")
  await mkdir(quarantinePath, { recursive: true })
  await writeFile(path.join(quarantinePath, "original.txt"), "original", "utf8")
  await mkdir(targetPath, { recursive: true })
  await writeFile(path.join(targetPath, "new.txt"), "new", "utf8")

  const result = await restoreQuarantinedTarget(quarantinePath, targetPath)

  assert.equal(result, "target-changed")
  assert.equal(await readFile(path.join(targetPath, "new.txt"), "utf8"), "new")
  assert.equal(await readFile(path.join(quarantinePath, "original.txt"), "utf8"), "original")
})

test("replaceDirectory materializes in-tree directory links without requiring runtime symlinks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-replace-link-"))
  try {
    const sourcePath = path.join(root, "source")
    const linkedDirectory = path.join(sourcePath, "assets")
    const targetPath = path.join(root, "target")
    await mkdir(path.join(sourcePath, "shared"), { recursive: true })
    await writeFile(path.join(sourcePath, "shared", "guide.md"), "linked content", "utf8")
    await symlink(path.join(sourcePath, "shared"), linkedDirectory, process.platform === "win32" ? "junction" : "dir")

    await replaceDirectory(sourcePath, targetPath)

    assert.equal(await readFile(path.join(targetPath, "assets", "guide.md"), "utf8"), "linked content")
    assert.equal((await lstat(path.join(targetPath, "assets"))).isSymbolicLink(), false)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test("replaceDirectory retries transient Windows rename failures before replacing the managed target", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-replace-retry-"))
  try {
    const sourcePath = path.join(root, "source")
    const targetPath = path.join(root, "target")
    await mkdir(sourcePath, { recursive: true })
    await mkdir(targetPath, { recursive: true })
    await writeFile(path.join(sourcePath, "SKILL.md"), "new", "utf8")
    await writeFile(path.join(targetPath, "SKILL.md"), "old", "utf8")
    let transientFailures = 0

    await replaceDirectory(sourcePath, targetPath, {
      rename: async (fromPath, toPath) => {
        if (fromPath === targetPath && transientFailures < 2) {
          transientFailures += 1
          throw Object.assign(new Error("directory is temporarily busy"), { code: "EPERM" })
        }
        await rename(fromPath, toPath)
      },
      wait: async () => undefined,
    })

    assert.equal(transientFailures, 2)
    assert.equal(await readFile(path.join(targetPath, "SKILL.md"), "utf8"), "new")
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test("replaceDirectory rejects links that escape the external Skill root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-replace-escape-"))
  try {
    const sourcePath = path.join(root, "source")
    const outsidePath = path.join(root, "outside")
    const targetPath = path.join(root, "target")
    await mkdir(sourcePath, { recursive: true })
    await mkdir(outsidePath, { recursive: true })
    await writeFile(path.join(outsidePath, "secret.md"), "outside", "utf8")
    await symlink(outsidePath, path.join(sourcePath, "assets"), process.platform === "win32" ? "junction" : "dir")

    await assert.rejects(() => replaceDirectory(sourcePath, targetPath), /escapes its source directory/)

    assert.equal(await exists(targetPath), false)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test("replaceDirectory restores the previous target when publishing the staged copy fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-replace-rollback-"))
  try {
    const sourcePath = path.join(root, "source")
    const targetPath = path.join(root, "target")
    await mkdir(sourcePath, { recursive: true })
    await mkdir(targetPath, { recursive: true })
    await writeFile(path.join(sourcePath, "SKILL.md"), "new", "utf8")
    await writeFile(path.join(targetPath, "SKILL.md"), "old", "utf8")

    await assert.rejects(
      () =>
        replaceDirectory(sourcePath, targetPath, {
          rename: async (fromPath, toPath) => {
            if (path.basename(String(fromPath)).startsWith(".target.tmp-")) {
              throw Object.assign(new Error("publish failed"), { code: "EINVAL" })
            }
            await rename(fromPath, toPath)
          },
          wait: async () => undefined,
        }),
      /publish failed/,
    )

    assert.equal(await readFile(path.join(targetPath, "SKILL.md"), "utf8"), "old")
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test("replaceDirectory rejects a source directory swapped to an escaping junction during traversal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-replace-directory-race-"))
  try {
    const sourcePath = path.join(root, "source")
    const assetsPath = path.join(sourcePath, "assets")
    const outsidePath = path.join(root, "outside")
    const targetPath = path.join(root, "target")
    await mkdir(assetsPath, { recursive: true })
    await mkdir(outsidePath, { recursive: true })
    await writeFile(path.join(assetsPath, "safe.md"), "safe", "utf8")
    await writeFile(path.join(outsidePath, "secret.md"), "outside", "utf8")
    let swapped = false

    await assert.rejects(
      () =>
        replaceDirectory(sourcePath, targetPath, {
          rename,
          readdir: async (directoryPath) => {
            if (String(directoryPath) === assetsPath && !swapped) {
              swapped = true
              await rm(assetsPath, { force: true, recursive: true })
              await symlink(outsidePath, assetsPath, process.platform === "win32" ? "junction" : "dir")
            }
            return readdir(directoryPath)
          },
          wait: async () => undefined,
        }),
      /changed during mirroring|escapes its source directory/,
    )

    assert.equal(swapped, true)
    assert.equal(await exists(targetPath), false)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test("replaceDirectory rejects a source file swapped back after its replacement is opened", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-replace-file-race-"))
  try {
    const sourcePath = path.join(root, "source")
    const sourceFile = path.join(sourcePath, "SKILL.md")
    const replacementFile = path.join(root, "replacement.md")
    const targetPath = path.join(root, "target")
    await mkdir(sourcePath, { recursive: true })
    await writeFile(sourceFile, "safe", "utf8")
    await writeFile(replacementFile, "replaced", "utf8")
    let swapped = false

    await assert.rejects(
      () =>
        replaceDirectory(sourcePath, targetPath, {
          openSourceFile: async (pathname) => {
            if (pathname === sourceFile && !swapped) {
              swapped = true
              const originalFile = path.join(root, "original.md")
              await rename(sourceFile, originalFile)
              await rename(replacementFile, sourceFile)
              const replacementHandle = await open(sourceFile, "r")
              await rm(sourceFile)
              await rename(originalFile, sourceFile)
              return replacementHandle
            }
            return open(pathname, "r")
          },
          rename,
          wait: async () => undefined,
        }),
      /changed during mirroring/,
    )

    assert.equal(swapped, true)
    assert.equal(await exists(targetPath), false)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test.runIf(process.platform !== "win32")("replaceDirectory preserves executable source file modes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wanta-skill-replace-mode-"))
  try {
    const sourcePath = path.join(root, "source")
    const sourceFile = path.join(sourcePath, "run.sh")
    const targetPath = path.join(root, "target")
    await mkdir(sourcePath, { recursive: true })
    await writeFile(sourceFile, "#!/bin/sh\n", "utf8")
    await chmod(sourceFile, 0o773)

    await replaceDirectory(sourcePath, targetPath)

    assert.equal((await stat(path.join(targetPath, "run.sh"))).mode & 0o777, 0o773)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
