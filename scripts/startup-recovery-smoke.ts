import { _electron as electron, expect } from "@playwright/test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Run after build:app. Uses only a disposable profile and never invokes a model.
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const profile = await mkdtemp(path.join(os.tmpdir(), "xingchao-startup-recovery-"))
const evidence = path.join(repository, ".wanta-dev", "startup-recovery")
let application: Awaited<ReturnType<typeof electron.launch>> | undefined
try {
  await mkdir(evidence, { recursive: true })
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.VITE_DEV_SERVER_URL
  environment.WANTA_USER_DATA_DIR = profile
  environment.WANTA_SKIP_PROTOCOL_REGISTRATION = "1"
  application = await electron.launch({
    executablePath: path.join(
      repository,
      ".electron-dist",
      process.platform === "win32"
        ? "electron.exe"
        : process.platform === "darwin"
          ? "Electron.app/Contents/MacOS/Electron"
          : "electron",
    ),
    args: [repository, "--lang=zh-CN"],
    env: environment,
    timeout: 60_000,
  })
  assert.equal(await application.evaluate(({ app }) => app.getPath("userData")), profile)
  const page = await application.firstWindow()
  const onboarding = page.getByRole("heading", { name: "配置自己的运行环境" })
  await expect(onboarding).toBeVisible({ timeout: 30_000 })
  // Fault-inject only this isolated process's connection handshake. The real
  // invocation handler remains installed, so reload exercises production getters.
  await application.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("xingchao:rpc:connect")
    let fail = true
    ipcMain.handle("xingchao:rpc:connect", () => {
      if (fail) {
        fail = false
        return { ok: false, error: "Synthetic startup handshake failure" }
      }
      return { ok: true, value: undefined }
    })
  })
  await page.reload()
  await expect(page.getByText("界面加载失败", { exact: true })).toBeVisible()
  const reload = page.getByRole("button", { name: "重新加载", exact: true })
  await expect(reload).toBeVisible()
  await page.screenshot({ path: path.join(evidence, "failure.png") })
  await reload.click()
  await expect(onboarding).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(evidence, "recovered.png") })
  console.log(
    "[startup-recovery] PASS: isolated profile, handshake failure shows reload, reload restores onboarding; no model request",
  )
} finally {
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
