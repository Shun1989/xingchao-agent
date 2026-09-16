import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"

const localRequire = createRequire(import.meta.url)
const builderRequire = createRequire(localRequire.resolve("electron-builder"))
const asar = createRequire(builderRequire.resolve("app-builder-lib"))("@electron/asar")
const verifyArchive = localRequire("./verify-packaged-archive.cjs") as (archive: string) => Promise<void>
let temporaryRoot: string | undefined
afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

async function fixture() {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "xingchao-archive-test-"))
  const source = path.join(temporaryRoot, "source")
  await mkdir(source)
  await writeFile(
    path.join(source, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0", main: "main.js" }),
  )
  await writeFile(path.join(source, "main.js"), "console.log('archive-content-marker')")
  const archive = path.join(temporaryRoot, "app.asar")
  await writeFile(path.join(source, "empty.txt"), "")
  await asar.createPackageWithOptions(source, archive, { unpack: "empty.txt" })
  return archive
}

it("accepts an intact archive and rejects a modified entry even when the manifest still parses", async () => {
  const archive = await fixture()
  await verifyArchive(archive)
  const bytes = await readFile(archive)
  const index = bytes.indexOf("archive-content-marker")
  expect(index).toBeGreaterThan(0)
  bytes[index] = "X".charCodeAt(0)
  await writeFile(archive, bytes)
  await expect(verifyArchive(archive)).rejects.toThrow(/integrity/i)
})

it("rejects invalid package metadata before a broken executable can be shipped", async () => {
  const archive = await fixture()
  const bytes = await readFile(archive)
  const index = bytes.indexOf('{"name":"fixture"')
  expect(index).toBeGreaterThan(0)
  bytes[index] = "|".charCodeAt(0)
  await writeFile(archive, bytes)
  await expect(verifyArchive(archive)).rejects.toThrow()
})

it("reads zero-byte unpacked entries from disk rather than trusting cached empty contents", async () => {
  const archive = await fixture()
  await verifyArchive(archive)
  await writeFile(path.join(`${archive}.unpacked`, "empty.txt"), "unexpected payload")
  await expect(verifyArchive(archive)).rejects.toThrow(/size mismatch/i)
})
