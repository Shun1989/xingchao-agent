import { Buffer } from "node:buffer"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { stageWindowsBetaCandidate } from "./windows-beta-stage.ts"

const version = "0.1.0-beta.1"
const localInstallerName = `星潮航局-${version}-Setup.exe`
const publishedInstallerName = `xingchao-navigation-setup-${version}.exe`

describe("stageWindowsBetaCandidate", () => {
  let root: string
  let releaseDir: string
  let candidateDir: string
  let releaseNote: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "xingchao-beta-stage-"))
    releaseDir = path.join(root, "release", version)
    candidateDir = path.join(root, "candidate")
    releaseNote = path.join(root, "docs", "releases", `${version}.md`)
    await mkdir(path.join(releaseDir, "win-unpacked"), { recursive: true })
    await mkdir(path.dirname(releaseNote), { recursive: true })
    await mkdir(path.join(root, "resources", "licenses"), { recursive: true })
    await writeFile(path.join(releaseDir, localInstallerName), Buffer.alloc(10))
    await writeFile(path.join(releaseDir, `${localInstallerName}.blockmap`), Buffer.alloc(5))
    await writeFile(path.join(releaseDir, "win-unpacked", "星潮航局.exe"), Buffer.alloc(4))
    await writeFile(
      path.join(releaseDir, "beta.yml"),
      [
        `version: ${version}`,
        `path: ${publishedInstallerName}`,
        `sha512: fixture`,
        `files:`,
        `  - url: ${publishedInstallerName}`,
        `    sha512: fixture`,
        "",
      ].join("\n"),
    )
    await writeFile(
      path.join(releaseDir, "release-size-win32-x64.json"),
      JSON.stringify({
        version,
        platform: "win32",
        arch: "x64",
        artifacts: [
          {
            artifact: "Setup EXE",
            fileName: localInstallerName,
            downloadBytes: 10,
            expandedBytes: 14,
            expandedLabel: "installed app payload",
          },
        ],
      }),
    )
    await writeFile(releaseNote, "# Beta 0.1.0-beta.1\n")
    for (const notice of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "TRADEMARKS.md"]) {
      await writeFile(path.join(root, notice), `${notice}\n`)
    }
    for (const license of ["Claude-Agent-SDK-LICENSE.txt", "khroma-LICENSE.txt", "Univer-telemetry-LICENSE.txt"]) {
      await writeFile(path.join(root, "resources", "licenses", license), `${license}\n`)
    }
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("stages exactly the beta update assets, unsigned status, notices, release notes, and checksums", async () => {
    await stageWindowsBetaCandidate({
      appSignatureStatus: "NotSigned",
      candidateDir,
      installerSignatureStatus: "NotSigned",
      releaseDir,
      releaseNote,
      repositoryDir: root,
      version,
    })

    expect((await readdir(candidateDir)).sort()).toEqual(
      [
        "LICENSE",
        "NOTICE",
        "RELEASE_NOTES.md",
        "SHA256SUMS.txt",
        "THIRD_PARTY_NOTICES.md",
        "TRADEMARKS.md",
        "UNSIGNED-STATUS.txt",
        "beta.yml",
        publishedInstallerName,
        `${publishedInstallerName}.blockmap`,
        "licenses",
        "release-size-win32-x64.json",
      ].sort(),
    )
    expect((await readdir(path.join(candidateDir, "licenses"))).sort()).toEqual(
      ["Claude-Agent-SDK-LICENSE.txt", "khroma-LICENSE.txt", "Univer-telemetry-LICENSE.txt"].sort(),
    )
    await expect(readFile(path.join(candidateDir, "latest.yml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    const sizeMetadata = JSON.parse(await readFile(path.join(candidateDir, "release-size-win32-x64.json"), "utf8"))
    expect(sizeMetadata.artifacts[0].fileName).toBe(publishedInstallerName)
    expect(await readFile(path.join(candidateDir, "UNSIGNED-STATUS.txt"), "utf8")).toContain(
      "Installer Authenticode status: NotSigned",
    )
    const checksums = await readFile(path.join(candidateDir, "SHA256SUMS.txt"), "utf8")
    expect(checksums).toContain(`  ${publishedInstallerName}`)
    expect(checksums).toContain(`  ${publishedInstallerName}.blockmap`)
    expect(checksums).toContain("  RELEASE_NOTES.md")
    expect(checksums).toContain("  licenses/Claude-Agent-SDK-LICENSE.txt")
    expect(checksums).toContain("  licenses/khroma-LICENSE.txt")
    expect(checksums).toContain("  licenses/Univer-telemetry-LICENSE.txt")
  })

  it.each(["UnknownError", "Valid", "HashMismatch"])(
    "rejects an installer signature status of %s instead of mislabeling it unsigned",
    async (installerSignatureStatus) => {
      await expect(
        stageWindowsBetaCandidate({
          appSignatureStatus: "NotSigned",
          candidateDir,
          installerSignatureStatus,
          releaseDir,
          releaseNote,
          repositoryDir: root,
          version,
        }),
      ).rejects.toThrow(/expected Authenticode status NotSigned/i)
    },
  )

  it("rejects an unknown application signature status instead of mislabeling it unsigned", async () => {
    await expect(
      stageWindowsBetaCandidate({
        appSignatureStatus: "UnknownError",
        candidateDir,
        installerSignatureStatus: "NotSigned",
        releaseDir,
        releaseNote,
        repositoryDir: root,
        version,
      }),
    ).rejects.toThrow(/expected Authenticode status NotSigned/i)
  })

  it("rejects a build that contains stable update metadata", async () => {
    await writeFile(path.join(releaseDir, "latest.yml"), "version: 0.1.0\n")

    await expect(
      stageWindowsBetaCandidate({
        appSignatureStatus: "NotSigned",
        candidateDir,
        installerSignatureStatus: "NotSigned",
        releaseDir,
        releaseNote,
        repositoryDir: root,
        version,
      }),
    ).rejects.toThrow(/latest\.yml/i)
  })
})
