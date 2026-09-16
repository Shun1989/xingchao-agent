import { _electron as electron, expect } from "@playwright/test"
import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

if (process.platform !== "win32") throw new Error("This acceptance probe requires Windows")
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(await readFile(path.join(repository, "package.json"), "utf8"))
const executable = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repository, "release", manifest.version, "win-unpacked", `${manifest.displayName}.exe`)
await access(executable)
const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-packaged-smoke-"))
const profile = path.join(root, "profile")
const evidence = path.join(repository, ".wanta-dev", "packaged-acceptance")
await mkdir(evidence, { recursive: true })
let application: Awaited<ReturnType<typeof electron.launch>> | undefined
const environment: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)
delete environment.ELECTRON_RUN_AS_NODE
delete environment.VITE_DEV_SERVER_URL
delete environment.WANTA_USER_DATA_DIR
try {
  for (const phase of ["clean", "restart"] as const) {
    application = await electron.launch({
      executablePath: executable,
      args: [`--user-data-dir=${profile}`, "--lang=zh-CN"],
      env: environment,
      timeout: 60_000,
    })
    const runtime = await application.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      profile: app.getPath("userData"),
      version: app.getVersion(),
      appPath: app.getAppPath(),
    }))
    assert.equal(runtime.packaged, true)
    assert.equal(runtime.profile, profile)
    assert.equal(runtime.version, manifest.version)
    assert.match(runtime.appPath, /app\.asar$/)
    const page = await application.firstWindow()
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await expect(page.getByRole("heading", { name: "配置自己的运行环境" })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("button", { name: "开始使用自己的运行环境" })).toBeDisabled()
    await page.getByRole("button", { name: "配置模型", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "添加模型" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled()
    await expect(dialog.getByRole("textbox", { name: "OpenAI-compatible API base URL" })).toBeVisible()
    await page.screenshot({ path: path.join(evidence, `${phase}.png`), fullPage: true })
    await dialog.getByRole("button", { name: "取消", exact: true }).last().click()
    await expect(dialog).toHaveCount(0)
    assert.deepEqual(errors, [])
    if (phase === "clean") await writeFile(path.join(profile, "acceptance-marker.txt"), "preserve-across-restart")
    else assert.equal(await readFile(path.join(profile, "acceptance-marker.txt"), "utf8"), "preserve-across-restart")
    await application.close()
    application = undefined
  }
  console.log(
    "[packaged-smoke] PASS: packaged ASAR, clean onboarding, model dialog validation/cancel, restart and profile preservation; no model request",
  )
} finally {
  await application?.close()
  await rm(root, { recursive: true, force: true })
}
