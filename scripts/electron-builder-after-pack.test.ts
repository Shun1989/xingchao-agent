import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"

const afterPack = createRequire(import.meta.url)("./electron-builder-after-pack.cjs") as (context: {
  appOutDir: string
  electronPlatformName: string
}) => Promise<void>
const builderRequire = createRequire(createRequire(import.meta.url).resolve("electron-builder"))
const asar = createRequire(builderRequire.resolve("app-builder-lib"))("@electron/asar")
let output: string | undefined

afterEach(async () => {
  if (output) await rm(output, { recursive: true, force: true })
  output = undefined
})

it("retains Chromium attribution in the Windows application payload", async () => {
  output = await mkdtemp(path.join(os.tmpdir(), "xingchao-license-test-"))
  const license = path.join(output, "LICENSES.chromium.html")
  await writeFile(license, "<html>Bundled Chromium notices</html>")
  const source = path.join(output, "source")
  await mkdir(source)
  await mkdir(path.join(output, "resources"))
  await writeFile(
    path.join(source, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0", main: "main.js" }),
  )
  await writeFile(path.join(source, "main.js"), "console.log('fixture')")
  await asar.createPackage(source, path.join(output, "resources", "app.asar"))
  await afterPack({ appOutDir: output, electronPlatformName: "win32" })
  expect(await readFile(license, "utf8")).toBe("<html>Bundled Chromium notices</html>")
})

it("rejects a Windows payload that is missing Chromium notices", async () => {
  output = await mkdtemp(path.join(os.tmpdir(), "xingchao-license-test-"))
  await expect(afterPack({ appOutDir: output, electronPlatformName: "win32" })).rejects.toThrow()
})
