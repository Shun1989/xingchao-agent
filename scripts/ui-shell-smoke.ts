import { _electron as electron, expect } from "@playwright/test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const profile = await mkdtemp(path.join(os.tmpdir(), "xingchao-ui-shell-"))
const evidence = path.join(repo, ".wanta-dev/ui-shell", process.argv.includes("--before") ? "before" : "after")
let application: Awaited<ReturnType<typeof electron.launch>> | undefined
try {
  await mkdir(evidence, { recursive: true })
  await writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({ operatingMode: "self-managed", selfManagedSetupDismissed: true }),
  )
  const env = Object.fromEntries(Object.entries(process.env).filter((v): v is [string, string] => v[1] !== undefined))
  delete env.ELECTRON_RUN_AS_NODE
  delete env.VITE_DEV_SERVER_URL
  env.WANTA_USER_DATA_DIR = profile
  env.WANTA_SKIP_PROTOCOL_REGISTRATION = "1"
  application = await electron.launch({
    executablePath: path.join(repo, ".electron-dist/electron.exe"),
    args: [repo, "--lang=zh-CN"],
    env,
    timeout: 30_000,
  })
  assert.equal(await application.evaluate(({ app }) => app.getPath("userData")), profile)
  const page = await application.firstWindow()
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900))
  await expect(page.getByRole("button", { name: "舰队港口", exact: true })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(evidence, "01-chat.png") })
  console.log((await page.locator("button").allTextContents()).join(" | "))
  await page.getByRole("button", { name: "舰队港口", exact: true }).click()
  await expect(page.getByRole("heading", { name: "十团协作，不止角色扮演" })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, "02-fleet.png") })
  await page.getByRole("button", { name: "航海图", exact: true }).click()
  await expect(page.getByLabel("这次航程要交付什么？")).toBeVisible()
  await page.screenshot({ path: path.join(evidence, "03-voyage.png") })
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1024, 640))
  await page.screenshot({ path: path.join(evidence, "04-compact.png") })
  if (!process.argv.includes("--before")) {
    const controls = page.getByRole("button", { name: "舰长控制", exact: true })
    await controls.click()
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-captain-panel]")).toBeHidden()
    await controls.click()
    await expect(page.getByRole("slider")).toHaveCount(2)
    await page.screenshot({ path: path.join(evidence, "05-captain-controls.png") })
    await page.getByRole("slider").first().focus()
    await page.keyboard.press("Escape")
    await expect(controls).toBeFocused()
    await expect(page.locator("[data-captain-panel]")).toBeHidden()
  }
  await page.getByRole("button", { name: "本地工作区与设置菜单", exact: true }).click()
  await page.getByRole("menuitem", { name: "设置", exact: true }).click()
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, "06-settings.png") })
  console.log("settings", (await page.locator("button").allTextContents()).join(" | "))
  await page.getByRole("button", { name: "添加模型", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.screenshot({ path: path.join(evidence, "07-model-dialog.png") })
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "添加模型", exact: true })).toBeFocused()
  await page
    .locator("button")
    .filter({ hasText: /^浅色$/ })
    .click()
  await page.getByRole("button", { name: "返回应用", exact: true }).click()
  for (const [name, filename] of [
    ["连接", "07-connections.png"],
    ["技能", "08-skills.png"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click()
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-current", "page")
    await expect(page.locator("main")).toContainText(name!)
    if (name === "技能") {
      await page
        .locator("button")
        .filter({ hasText: /^本机 Skills$/ })
        .click()
      await expect(page.locator(".animate-pulse")).toHaveCount(0)
    }
    await page.screenshot({ path: path.join(evidence, filename!) })
  }
  assert.deepEqual(errors, [])
  console.log("[ui-shell] captured real AppShell without model calls", JSON.stringify(errors))
} finally {
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
