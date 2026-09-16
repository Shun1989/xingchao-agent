import type { ReleaseSizeMetadata } from "./release-size.ts"

import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
// vitest 同时导出 describe/it/beforeEach/afterEach；本项目测试统一跑在 vitest（见
// vitest.config.ts），不用 node:test runner。断言仍用 node:assert/strict，与其余测试一致。
import { afterEach, beforeEach, describe, it } from "vitest"
import {
  collectMacMetadata,
  collectWinMetadata,
  assertMetadataArtifactsExist,
  formatMiB,
  retargetArtifactFileName,
  renderDownloadsTable,
  sumFileBytesRecursive,
} from "./release-size.ts"

const GITHUB_RELEASE_BASE = "https://github.com/Shun1989/xingchao-agent/releases/download/v1.2.3"

describe("formatMiB", () => {
  it("formats exact MiB boundaries with one decimal", () => {
    assert.equal(formatMiB(0), "0.0 MiB")
    assert.equal(formatMiB(1024 * 1024), "1.0 MiB")
    assert.equal(formatMiB(1024 * 1024 * 10), "10.0 MiB")
  })

  it("rounds non-integer MiB to one decimal place", () => {
    assert.equal(formatMiB(113506914), "108.2 MiB")
    assert.equal(formatMiB(107986869), "103.0 MiB")
  })

  it("rejects negative, NaN, and Infinity", () => {
    assert.throws(() => formatMiB(-1), TypeError)
    assert.throws(() => formatMiB(Number.NaN), TypeError)
    assert.throws(() => formatMiB(Number.POSITIVE_INFINITY), TypeError)
    assert.throws(() => formatMiB("100" as unknown as number), TypeError)
  })
})

describe("sumFileBytesRecursive", () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "wanta-release-size-"))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("sums apparent file sizes across nested directories", async () => {
    await writeFile(path.join(dir, "a.bin"), Buffer.alloc(100))
    await mkdir(path.join(dir, "sub"))
    await writeFile(path.join(dir, "sub", "b.bin"), Buffer.alloc(250))
    await mkdir(path.join(dir, "sub", "deep"))
    await writeFile(path.join(dir, "sub", "deep", "c.bin"), Buffer.alloc(50))
    assert.equal(await sumFileBytesRecursive(dir), 400)
  })

  it("returns 0 when the directory does not exist", async () => {
    assert.equal(await sumFileBytesRecursive(path.join(dir, "missing")), 0)
  })

  it("returns 0 for an empty directory", async () => {
    assert.equal(await sumFileBytesRecursive(dir), 0)
  })
})

describe("collectMacMetadata", () => {
  let releaseDir: string
  beforeEach(async () => {
    releaseDir = await mkdtemp(path.join(tmpdir(), "wanta-release-size-mac-"))
  })
  afterEach(async () => {
    await rm(releaseDir, { recursive: true, force: true })
  })

  it("produces a two-artifact entry with the same expanded size for DMG and ZIP", async () => {
    const version = "9.8.7"
    await writeFile(path.join(releaseDir, `星潮航局-${version}.dmg`), Buffer.alloc(1000))
    await writeFile(path.join(releaseDir, `星潮航局-${version}.zip`), Buffer.alloc(800))
    const appDir = path.join(releaseDir, "mac-arm64", "星潮航局.app", "Contents", "MacOS")
    await mkdir(appDir, { recursive: true })
    await writeFile(path.join(appDir, "星潮航局"), Buffer.alloc(2048))

    const metadata = await collectMacMetadata({
      version,
      arch: "arm64",
      releaseDir,
    })
    assert.equal(metadata.platform, "darwin")
    assert.equal(metadata.arch, "arm64")
    assert.equal(metadata.artifacts.length, 2)
    assert.deepEqual(metadata.artifacts[0], {
      artifact: "DMG",
      fileName: `星潮航局-${version}.dmg`,
      downloadBytes: 1000,
      expandedBytes: 2048,
      expandedLabel: "app bundle",
    })
    assert.deepEqual(metadata.artifacts[1], {
      artifact: "ZIP",
      fileName: `星潮航局-${version}.zip`,
      downloadBytes: 800,
      expandedBytes: 2048,
      expandedLabel: "app bundle",
    })
  })

  it("fails fast when the unpacked .app bundle is missing", async () => {
    const version = "9.8.7"
    await writeFile(path.join(releaseDir, `星潮航局-${version}.dmg`), Buffer.alloc(1))
    await writeFile(path.join(releaseDir, `星潮航局-${version}.zip`), Buffer.alloc(1))
    await assert.rejects(collectMacMetadata({ version, arch: "arm64", releaseDir }), /unpacked \.app bundle/)
  })
})

describe("collectWinMetadata", () => {
  let releaseDir: string
  beforeEach(async () => {
    releaseDir = await mkdtemp(path.join(tmpdir(), "wanta-release-size-win-"))
  })
  afterEach(async () => {
    await rm(releaseDir, { recursive: true, force: true })
  })

  it("produces Setup EXE entries with the same expanded size", async () => {
    const version = "9.8.7"
    await writeFile(path.join(releaseDir, `星潮航局-${version}-Setup.exe`), Buffer.alloc(500))
    const unpackedDir = path.join(releaseDir, "win-unpacked", "resources")
    await mkdir(unpackedDir, { recursive: true })
    await writeFile(path.join(unpackedDir, "app.asar"), Buffer.alloc(4096))

    const metadata = await collectWinMetadata({
      version,
      arch: "x64",
      releaseDir,
    })
    assert.equal(metadata.platform, "win32")
    assert.equal(metadata.arch, "x64")
    assert.equal(metadata.artifacts.length, 1)
    assert.deepEqual(metadata.artifacts[0], {
      artifact: "Setup EXE",
      fileName: `星潮航局-${version}-Setup.exe`,
      downloadBytes: 500,
      expandedBytes: 4096,
      expandedLabel: "installed app payload",
    })
  })

  it("fails fast when win-unpacked is missing", async () => {
    const version = "9.8.7"
    await writeFile(path.join(releaseDir, `星潮航局-${version}-Setup.exe`), Buffer.alloc(1))
    await assert.rejects(collectWinMetadata({ version, arch: "x64", releaseDir }), /Windows unpacked payload/)
  })
})

describe("staged Windows metadata", () => {
  let candidateDir: string
  beforeEach(async () => {
    candidateDir = await mkdtemp(path.join(tmpdir(), "xingchao-candidate-metadata-"))
  })
  afterEach(async () => {
    await rm(candidateDir, { recursive: true, force: true })
  })

  it("retargets the local Chinese installer name to the staged GitHub asset and validates it exists", async () => {
    const publishedName = "xingchao-navigation-setup-1.2.3.exe"
    await writeFile(path.join(candidateDir, publishedName), Buffer.alloc(1))
    const metadata: ReleaseSizeMetadata = {
      version: "1.2.3",
      platform: "win32",
      arch: "x64",
      artifacts: [
        {
          artifact: "Setup EXE",
          fileName: "星潮航局-1.2.3-Setup.exe",
          downloadBytes: 1,
          expandedBytes: 2,
          expandedLabel: "installed app payload",
        },
      ],
    }

    const staged = retargetArtifactFileName(metadata, "星潮航局-1.2.3-Setup.exe", publishedName)

    assert.equal(staged.artifacts[0]?.fileName, publishedName)
    await assert.doesNotReject(assertMetadataArtifactsExist(staged, candidateDir))
  })

  it("rejects metadata that points at an artifact absent from the candidate", async () => {
    const metadata: ReleaseSizeMetadata = {
      version: "1.2.3",
      platform: "win32",
      arch: "x64",
      artifacts: [
        {
          artifact: "Setup EXE",
          fileName: "xingchao-navigation-setup-1.2.3.exe",
          downloadBytes: 1,
          expandedBytes: 2,
          expandedLabel: "installed app payload",
        },
      ],
    }

    await assert.rejects(assertMetadataArtifactsExist(metadata, candidateDir), /missing staged artifact/i)
  })
})

describe("renderDownloadsTable", () => {
  const winMetadata: ReleaseSizeMetadata = {
    version: "1.2.3",
    platform: "win32",
    arch: "x64",
    artifacts: [
      {
        artifact: "Setup EXE",
        fileName: "星潮航局-1.2.3-Setup.exe",
        downloadBytes: 90000000,
        expandedBytes: 250000000,
        expandedLabel: "installed app payload",
      },
    ],
  }

  it("renders the supported Windows candidate without requiring macOS metadata", () => {
    const table = renderDownloadsTable({
      version: "1.2.3",
      downloadBase: GITHUB_RELEASE_BASE,
      metadata: [winMetadata],
    })
    assert.ok(table.includes("Windows x64"))
  })

  it("emits Markdown table header, formatted sizes, and GitHub release download links", () => {
    const table = renderDownloadsTable({
      version: "1.2.3",
      downloadBase: GITHUB_RELEASE_BASE,
      metadata: [winMetadata],
    })
    assert.ok(table.includes("| Platform | Artifact | Download Size | Expanded / Installed Size | Link |"))
    assert.ok(table.includes("85.8 MiB"))
    assert.ok(table.includes(`${GITHUB_RELEASE_BASE}/星潮航局-1.2.3-Setup.exe`))
    assert.ok(table.includes("installed app payload"))
  })

  it("fails fast when a metadata file disagrees with the release version", () => {
    const stale = { ...winMetadata, version: "0.0.1" }
    assert.throws(
      () =>
        renderDownloadsTable({
          version: "1.2.3",
          downloadBase: GITHUB_RELEASE_BASE,
          metadata: [stale],
        }),
      /version mismatch/i,
    )
  })
})
