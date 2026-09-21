import { _electron as electron, expect } from "@playwright/test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build } from "vite"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const profile = await mkdtemp(path.join(os.tmpdir(), "xingchao-ui-polish-"))
const evidence = path.join(repo, ".wanta-dev/ui-polish")
let application: Awaited<ReturnType<typeof electron.launch>> | undefined
try {
  await mkdir(evidence, { recursive: true })
  await build({
    configFile: path.join(repo, "vite.visual.config.ts"),
    logLevel: "error",
    build: {
      rollupOptions: {
        input: [path.join(repo, "tests/visual/index.html"), path.join(repo, "tests/visual/route-polish.html")],
      },
    },
  })
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    executablePath: path.join(repo, ".electron-dist/electron.exe"),
    args: [path.join(repo, "tests/visual/electron-main.cjs"), `--user-data-dir=${profile}`],
    env,
  })
  const page = await application.firstWindow()
  page.setDefaultTimeout(15_000)
  console.log("[ui-polish] opening production routes")
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(pathToFileURL(path.join(repo, "dist-visual/route-polish.html")).href)
  await expect(page.getByRole("heading", { name: "十团协作，不止角色扮演" })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, "fleet-dark.png") })
  await page.getByRole("button").filter({ hasText: "舵序团" }).click()
  await expect(page.locator("html")).toHaveAttribute("data-fleet-skin", "helm-order")
  await page.screenshot({ path: path.join(evidence, "fleet.png") })
  await page.getByRole("button", { name: "规划新航程" }).click()
  await expect(page.getByLabel("这次航程要交付什么？")).toBeInViewport()
  await page.screenshot({ path: path.join(evidence, "voyage.png") })
  await page.getByLabel("这次航程要交付什么？").fill("调研三款竞品并制作分析报告")
  await page.getByRole("button", { name: "推荐团队并生成航海图" }).click()
  await expect(page.getByRole("heading", { name: "确认编队" })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, "plan.png") })
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1024, 640)
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.getByRole("button", { name: "航海图", exact: true }).click()
  await page.getByLabel("这次航程要交付什么？").scrollIntoViewIfNeeded()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.equal(
    await page
      .locator(".fleet-button-primary")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  )
  await page.screenshot({ path: path.join(evidence, "compact.png") })
  await page.emulateMedia({ contrast: "more", reducedMotion: "reduce" })
  await expect(page.locator("html")).toHaveAttribute("data-fleet-contrast", "high")
  await page.screenshot({ path: path.join(evidence, "high-contrast.png") })
  assert.deepEqual(errors, [])
  console.log(
    "[ui-polish] PASS: production Fleet/Voyage routes, skin switching, mission planning, 1024x640 overflow and reduced motion; isolated profile, no model calls",
  )
} finally {
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
