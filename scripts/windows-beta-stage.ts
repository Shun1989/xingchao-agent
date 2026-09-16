#!/usr/bin/env node

import type { ReleaseSizeMetadata } from "./release-size.ts"

import { load } from "js-yaml"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import { branding } from "../electron/branding.ts"
import { assertMetadataArtifactsExist, retargetArtifactFileName } from "./release-size.ts"

const betaVersionPattern = /^\d+\.\d+\.\d+-beta\.(?:0|[1-9]\d*)$/
const githubAssetNamePattern = /^[0-9A-Za-z._-]+$/
const noticeFiles = ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "TRADEMARKS.md"] as const

interface BetaUpdateMetadata {
  files?: Array<{ url?: unknown }>
  path?: unknown
  version?: unknown
}

export interface WindowsBetaStageOptions {
  appSignatureStatus: string
  candidateDir: string
  installerSignatureStatus: string
  releaseDir: string
  releaseNote: string
  repositoryDir: string
  version: string
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

async function requireFile(file: string, label: string): Promise<void> {
  try {
    const fileStats = await stat(file)
    if (!fileStats.isFile()) throw new Error("not a file")
  } catch (error) {
    throw new Error(`${label} is missing or is not a file: ${file}`, { cause: error })
  }
}

async function requireAbsent(file: string, label: string): Promise<void> {
  try {
    await stat(file)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return
    throw error
  }
  throw new Error(`${label} must not exist for an unsigned beta candidate: ${file}`)
}

async function listBundledLicenses(repositoryDir: string): Promise<Array<{ name: string; source: string }>> {
  const licensesDir = path.join(repositoryDir, "resources", "licenses")
  let entries
  try {
    entries = await readdir(licensesDir, { withFileTypes: true })
  } catch (error) {
    throw new Error(`Bundled license directory is missing: ${licensesDir}`, { cause: error })
  }
  const licenses = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => ({ name: entry.name, source: path.join(licensesDir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (licenses.length === 0) throw new Error(`Bundled license directory contains no .txt files: ${licensesDir}`)
  return licenses
}

function requireNotSigned(status: string, label: string): void {
  if (status !== "NotSigned") {
    throw new Error(`${label}: expected Authenticode status NotSigned, got ${JSON.stringify(status)}`)
  }
}

function parseBetaMetadata(
  text: string,
  version: string,
): { metadata: BetaUpdateMetadata; publishedInstallerName: string } {
  const metadata = load(text) as BetaUpdateMetadata
  if (!metadata || typeof metadata !== "object") throw new Error("beta.yml must contain an object")
  if (metadata.version !== version) {
    throw new Error(`beta.yml version mismatch: expected ${version}, got ${String(metadata.version)}`)
  }
  const publishedInstallerName = metadata.path
  const firstFileUrl = metadata.files?.[0]?.url
  if (typeof publishedInstallerName !== "string" || publishedInstallerName.length === 0) {
    throw new Error("beta.yml path must name the installer")
  }
  if (firstFileUrl !== publishedInstallerName) {
    throw new Error("beta.yml path and files[0].url must reference the same installer")
  }
  if (
    path.basename(publishedInstallerName) !== publishedInstallerName ||
    !githubAssetNamePattern.test(publishedInstallerName)
  ) {
    throw new Error(`beta.yml installer must use a GitHub-safe ASCII file name, got ${publishedInstallerName}`)
  }
  if (!publishedInstallerName.endsWith(".exe")) {
    throw new Error(`beta.yml installer must be an .exe, got ${publishedInstallerName}`)
  }
  return { metadata, publishedInstallerName }
}

async function sha256(file: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(file)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(hash.digest("hex")))
  })
}

async function listCandidateFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listCandidateFiles(root, absolute)))
    else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, "/"))
  }
  return files.sort()
}

export async function stageWindowsBetaCandidate(options: WindowsBetaStageOptions): Promise<void> {
  if (!betaVersionPattern.test(options.version)) {
    throw new Error(`Beta candidate version must match X.Y.Z-beta.N, got ${options.version}`)
  }
  requireNotSigned(options.installerSignatureStatus, "Installer")
  requireNotSigned(options.appSignatureStatus, "Application executable")

  const localInstallerName = `${branding.appName}-${options.version}-Setup.exe`
  const installer = path.join(options.releaseDir, localInstallerName)
  const blockmap = `${installer}.blockmap`
  const appExecutable = path.join(options.releaseDir, "win-unpacked", `${branding.appName}.exe`)
  const betaMetadataFile = path.join(options.releaseDir, "beta.yml")
  const stableMetadataFile = path.join(options.releaseDir, "latest.yml")
  const sizeMetadataFile = path.join(options.releaseDir, "release-size-win32-x64.json")
  const bundledLicenses = await listBundledLicenses(options.repositoryDir)

  await Promise.all([
    requireFile(installer, "Installer"),
    requireFile(blockmap, "Installer blockmap"),
    requireFile(appExecutable, "Unpacked application executable"),
    requireFile(betaMetadataFile, "Beta update metadata"),
    requireFile(sizeMetadataFile, "Release-size metadata"),
    requireFile(options.releaseNote, "Beta release notes"),
    ...bundledLicenses.map((license) => requireFile(license.source, `Bundled license ${license.name}`)),
    ...noticeFiles.map((notice) =>
      requireFile(path.join(options.repositoryDir, notice), `Repository notice ${notice}`),
    ),
    requireAbsent(stableMetadataFile, "Stable update metadata latest.yml"),
    requireAbsent(options.candidateDir, "Candidate output directory"),
  ])

  const { publishedInstallerName } = parseBetaMetadata(await readFile(betaMetadataFile, "utf8"), options.version)
  await mkdir(options.candidateDir, { recursive: true })
  const candidateLicensesDir = path.join(options.candidateDir, "licenses")
  await mkdir(candidateLicensesDir)
  await Promise.all([
    copyFile(installer, path.join(options.candidateDir, publishedInstallerName)),
    copyFile(blockmap, path.join(options.candidateDir, `${publishedInstallerName}.blockmap`)),
    copyFile(betaMetadataFile, path.join(options.candidateDir, "beta.yml")),
    copyFile(options.releaseNote, path.join(options.candidateDir, "RELEASE_NOTES.md")),
    ...noticeFiles.map((notice) =>
      copyFile(path.join(options.repositoryDir, notice), path.join(options.candidateDir, notice)),
    ),
    ...bundledLicenses.map((license) => copyFile(license.source, path.join(candidateLicensesDir, license.name))),
  ])

  const sizeMetadata = JSON.parse(await readFile(sizeMetadataFile, "utf8")) as ReleaseSizeMetadata
  const stagedSizeMetadata = retargetArtifactFileName(sizeMetadata, localInstallerName, publishedInstallerName)
  await assertMetadataArtifactsExist(stagedSizeMetadata, options.candidateDir)
  await writeFile(
    path.join(options.candidateDir, "release-size-win32-x64.json"),
    JSON.stringify(stagedSizeMetadata, null, 2) + "\n",
    "utf8",
  )

  await writeFile(
    path.join(options.candidateDir, "UNSIGNED-STATUS.txt"),
    [
      "Windows beta candidate signing status",
      "Overall: Intentionally unsigned public beta",
      "Installer Authenticode status: NotSigned",
      "Application executable Authenticode status: NotSigned",
      "This status is emitted only after both files report exactly NotSigned.",
      "",
    ].join("\n"),
    "utf8",
  )

  const stagedFiles = (await listCandidateFiles(options.candidateDir)).filter((file) => file !== "SHA256SUMS.txt")
  const checksumLines: string[] = []
  for (const fileName of stagedFiles) {
    checksumLines.push(`${await sha256(path.join(options.candidateDir, fileName))}  ${fileName}`)
  }
  await writeFile(path.join(options.candidateDir, "SHA256SUMS.txt"), checksumLines.join("\n") + "\n", "ascii")
}

function required(values: Record<string, string | boolean | undefined>, key: string): string {
  const value = values[key]
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required --${key}`)
  return value
}

async function run(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: "string" },
      "release-dir": { type: "string" },
      "candidate-dir": { type: "string" },
      "release-note": { type: "string" },
      "installer-signature-status": { type: "string" },
      "app-signature-status": { type: "string" },
    },
  })
  await stageWindowsBetaCandidate({
    appSignatureStatus: required(values, "app-signature-status"),
    candidateDir: path.resolve(required(values, "candidate-dir")),
    installerSignatureStatus: required(values, "installer-signature-status"),
    releaseDir: path.resolve(required(values, "release-dir")),
    releaseNote: path.resolve(required(values, "release-note")),
    repositoryDir: process.cwd(),
    version: required(values, "version"),
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    await run(process.argv.slice(2))
  } catch (error) {
    console.error(`windows-beta-stage: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
