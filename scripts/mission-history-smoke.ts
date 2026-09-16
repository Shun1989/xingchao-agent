import type {} from "../tests/e2e/mission/controls.ts"

import { _electron as electron, expect } from "@playwright/test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "xingchao-mission-ui-"))
const fixture = path.join(repo, "tests/e2e/mission")
let application: Awaited<ReturnType<typeof electron.launch>> | undefined
try {
  await build({
    configFile: path.join(repo, "vite.visual.config.ts"),
    root: fixture,
    logLevel: "error",
    build: { outDir: path.join(temporaryRoot, "renderer"), rollupOptions: { input: path.join(fixture, "index.html") } },
  })
  for (const target of ["main", "preload"]) {
    await build({
      configFile: false,
      logLevel: "error",
      ssr: { noExternal: true },
      define: {
        __OO_ENDPOINT__: JSON.stringify("example.invalid"),
        __PACKAGE_ASSETS_BASE_URL__: JSON.stringify("https://example.invalid"),
      },
      build: {
        outDir: path.join(temporaryRoot, target),
        target: "node22",
        ssr: path.join(fixture, `${target}.ts`),
        rollupOptions: {
          external: ["electron"],
          output: {
            entryFileNames: target === "main" ? "main.mjs" : "preload.cjs",
            format: target === "main" ? "es" : "cjs",
          },
        },
      },
    })
  }
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  environment["MISSION_UI_SMOKE_ROOT"] = temporaryRoot
  delete environment["ELECTRON_RUN_AS_NODE"]
  application = await electron.launch({
    executablePath: path.join(
      repo,
      ".electron-dist",
      process.platform === "win32"
        ? "electron.exe"
        : process.platform === "darwin"
          ? "Electron.app/Contents/MacOS/Electron"
          : "electron",
    ),
    args: [path.join(temporaryRoot, "main/main.mjs")],
    env: environment,
    timeout: 30_000,
  })
  const page = await application.firstWindow()
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.waitForFunction(() => Boolean(window.ipcSmoke))
  const ipcChecks = await page.evaluate(() => window.ipcSmoke.invokeChecks())
  assert.deepEqual(ipcChecks.values.slice(0, 3), ["slow", "fast", null])
  assert.equal(ipcChecks.preservedUndefined, true)
  assert.deepEqual(ipcChecks.completionOrder, ["fast", "slow"])
  assert.equal(ipcChecks.errors.length, 2)
  assert.match(ipcChecks.errors[0]!, /ipc smoke synchronous failure/)
  assert.match(ipcChecks.errors[1]!, /ipc smoke asynchronous failure/)
  assert.ok(ipcChecks.denied, "Internal service methods must reject over IPC")
  assert.doesNotMatch(ipcChecks.denied, /must never cross IPC/)
  await page.evaluate(async () => {
    window.ipcSmoke.subscribe()
    await window.ipcSmoke.emit("first")
  })
  await expect.poll(() => page.evaluate(() => window.ipcSmoke.events)).toEqual(["first"])
  await page.evaluate(async () => {
    window.ipcSmoke.unsubscribe()
    await window.ipcSmoke.emit("unsubscribed")
  })
  // A round trip after the send lets its queued notification pass while unsubscribed.
  await page.evaluate(() => window.ipcSmoke.invokeChecks())
  await page.evaluate(async () => {
    window.ipcSmoke.subscribe()
    await window.ipcSmoke.emit("resubscribed")
  })
  await expect.poll(() => page.evaluate(() => window.ipcSmoke.events)).toEqual(["first", "resubscribed"])
  await page.reload()
  await page.waitForFunction(() => Boolean(window.ipcSmoke))
  assert.deepEqual(await page.evaluate(() => window.ipcSmoke.events), [])
  const reloadedChecks = await page.evaluate(() => window.ipcSmoke.invokeChecks())
  assert.equal(reloadedChecks.preservedUndefined, true)
  assert.equal(reloadedChecks.errors.length, 2)
  await page.evaluate(async () => {
    window.ipcSmoke.subscribe()
    await window.ipcSmoke.emit("after-reload")
  })
  await expect.poll(() => page.evaluate(() => window.ipcSmoke.events)).toEqual(["after-reload"])
  const recovery = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "恢复中断任务", exact: true }) })
    .first()
  await expect(recovery).toContainText("已中断，待处理")
  await expect(recovery.getByRole("button", { name: "重新执行", exact: true })).toHaveCount(0)
  await recovery.getByRole("button", { name: "打开原对话" }).click()
  await expect(page.getByTestId("selected-session")).toHaveText("original-session")
  await recovery.getByRole("button", { name: "重新执行", exact: true }).click()
  await recovery.getByRole("button", { name: "取消", exact: true }).click()
  assert.equal(JSON.parse(await readFile(path.join(temporaryRoot, "profile/mission-runs.json"), "utf8")).runs.length, 3)
  const saving = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "保存失败任务", exact: true }) })
  await saving.getByRole("button", { name: "重试保存" }).click()
  await expect(saving).toContainText("本轮执行结束")
  await expect(saving.getByRole("button", { name: "重试保存" })).toHaveCount(0)
  const dispatch = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "启动结果保存失败任务", exact: true }) })
  await dispatch.getByRole("button", { name: "重试保存" }).click()
  await expect(dispatch.getByRole("button", { name: "重试保存" })).toHaveCount(0)
  const repairedLedger = JSON.parse(await readFile(path.join(temporaryRoot, "profile/mission-runs.json"), "utf8"))
  assert.equal(repairedLedger.runs.length, 3)
  const repairedDispatch = repairedLedger.runs.find(
    (run: { mission: { id: string } }) => run.mission.id === "dispatch-saving-fixture",
  )
  assert.equal(repairedDispatch.status, "failed")
  assert.equal(repairedDispatch.events.at(-1).reason, "send_failed")
  await recovery.getByRole("button", { name: "重新执行", exact: true }).click()
  await recovery.getByRole("button", { name: "确认重新执行", exact: true }).click()
  await expect(page.locator("article")).toHaveCount(4)
  const retry = page.locator("article").filter({ hasText: "第 2 次尝试" })
  await expect(retry).toContainText("本轮执行结束")
  const ledger = JSON.parse(await readFile(path.join(temporaryRoot, "profile/mission-runs.json"), "utf8"))
  assert.equal(ledger.runs.filter((run: { status: string }) => run.status === "completed").length, 2)
  assert.equal(ledger.runs.filter((run: { status: string }) => run.status === "blocked").length, 1)
  assert.deepEqual(errors, [])
  await page.setViewportSize({ width: 1024, height: 640 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await mkdir(path.join(repo, ".wanta-dev"), { recursive: true })
  await page.screenshot({ path: path.join(repo, ".wanta-dev/mission-history-acceptance.png"), fullPage: true })
  await page.getByRole("button", { name: "导出备份", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("备份已导出")
  assert.equal(JSON.parse(await readFile(path.join(temporaryRoot, "exported-history.json"), "utf8")).runs.length, 4)
  await application.close()
  environment["MISSION_UI_SMOKE_CORRUPT"] = "1"
  application = await electron.launch({
    executablePath: path.join(
      repo,
      ".electron-dist",
      process.platform === "win32"
        ? "electron.exe"
        : process.platform === "darwin"
          ? "Electron.app/Contents/MacOS/Electron"
          : "electron",
    ),
    args: [path.join(temporaryRoot, "main/main.mjs")],
    env: environment,
    timeout: 30_000,
  })
  const restoredPage = await application.firstWindow()
  await expect(restoredPage.getByText("任务记录文件损坏或格式不受支持。", { exact: false })).toBeVisible()
  await restoredPage.getByRole("button", { name: "从备份恢复", exact: true }).click()
  await expect(restoredPage.getByRole("status")).toContainText("备份已恢复")
  await expect(restoredPage.locator("article")).toHaveCount(1)
  await expect(restoredPage.locator("article")).toContainText("已中断，待处理")
  const preserved = (await readdir(path.join(temporaryRoot, "corrupt-profile"))).find((name) =>
    name.startsWith("mission-runs.corrupt-"),
  )!
  assert.equal(await readFile(path.join(temporaryRoot, "corrupt-profile", preserved), "utf8"), "{damaged-history")
  await restoredPage.screenshot({ path: path.join(repo, ".wanta-dev/mission-backup-acceptance.png"), fullPage: true })
  console.log(
    "[mission-history] PASS: sandboxed Electron IPC, concurrent invokes, null/undefined, sync/async errors, denied internal method, event unsubscribe/resubscribe/reload, recovered history, original session, cancel, chat and dispatch save repair without new execution, preserved retry attempts, no overflow at 1024x640, complete export, corrupt-ledger restore with original bytes preserved",
  )
} finally {
  await application?.close()
  await rm(temporaryRoot, { recursive: true, force: true })
}
