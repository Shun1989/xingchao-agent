import type { BuiltinCrewId } from "../../src/domain/xingchao/types.ts"
import type { ElectronApplication, Page } from "@playwright/test"

import { _electron as electron, expect, test as base } from "@playwright/test"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { BUILTIN_CREW_IDS } from "../../src/domain/xingchao/types.ts"

type VisualMode = "stage" | "companion" | "compact"
type VisualContrast = "standard" | "high"

interface VisualCase {
  readonly crewId: BuiltinCrewId
  readonly mode: VisualMode
  readonly contrast: VisualContrast
  readonly reducedMotion: boolean
}

interface VisualFixtures {
  page: Page
}

interface VisualWorkerFixtures {
  electronApp: ElectronApplication
}

const visualTestDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(visualTestDirectory, "../..")
const visualEntryUrl = pathToFileURL(path.join(repositoryRoot, "dist-visual/index.html"))

function harnessUrl(visualCase: VisualCase): string {
  const url = new URL(visualEntryUrl)
  url.searchParams.set("crewId", visualCase.crewId)
  url.searchParams.set("mode", visualCase.mode)
  url.searchParams.set("contrast", visualCase.contrast)
  url.searchParams.set("reducedMotion", String(visualCase.reducedMotion))
  return url.href
}

function baselineName({ crewId, mode, contrast, reducedMotion }: VisualCase): string {
  if (reducedMotion) return `${crewId}-companion-reduced-motion.png`
  if (contrast === "high") return `${crewId}-companion-high-contrast.png`
  return `${crewId}-${mode}.png`
}

async function expectVisualCaseReady(page: Page): Promise<void> {
  await expect(page.getByTestId("visual-case-ready")).toHaveAttribute("data-ready", "true")
  const runningAnimations = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === "running" || animation.playState === "pending")
      .map((animation) => {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null
        return `${target instanceof HTMLElement ? target.className : "unknown"}:${animation.playState}`
      }),
  )
  expect(runningAnimations, "visual harness must be still before capture").toEqual([])
}

const test = base.extend<VisualFixtures, VisualWorkerFixtures>({
  electronApp: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixture factories require object destructuring.
    async ({}, fixtureUse) => {
      const electronApp = await electron.launch({
        executablePath: path.join(repositoryRoot, ".electron-dist/electron.exe"),
        args: [path.join(visualTestDirectory, "electron-main.cjs")],
        cwd: repositoryRoot,
        env: {
          ...process.env,
          ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
          TZ: "Asia/Shanghai",
        },
      })
      await fixtureUse(electronApp)
      await electronApp.close()
    },
    { scope: "worker" },
  ],
  page: async ({ electronApp }, fixtureUse) => {
    const page = await electronApp.firstWindow()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" })
    await fixtureUse(page)
  },
})

test("rejects query values outside the closed visual-case unions", async ({ page }) => {
  const invalidUrl = new URL(visualEntryUrl)
  invalidUrl.search = "?crewId=remote&mode=fullscreen&contrast=sepia&reducedMotion=maybe"
  await page.goto(invalidUrl.href)
  await expect(page.getByTestId("visual-case-error")).toContainText("Invalid visual case")
})

test("isolates the harness from the authenticated app and network", async ({ page }) => {
  const visualCase = {
    crewId: BUILTIN_CREW_IDS[0],
    mode: "stage",
    contrast: "standard",
    reducedMotion: false,
  } as const
  await page.goto(harnessUrl(visualCase))
  await expectVisualCaseReady(page)

  expect(await page.evaluate(() => typeof globalThis.wanta)).toBe("undefined")
  expect(
    await page.evaluate(async () => {
      try {
        await fetch("https://visual-harness.invalid/network-probe")
        return false
      } catch {
        return true
      }
    }),
  ).toBe(true)
})

for (const crewId of BUILTIN_CREW_IDS) {
  for (const mode of ["stage", "companion", "compact"] as const) {
    const visualCase = { crewId, mode, contrast: "standard", reducedMotion: false } as const
    test(`${crewId}-${mode}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "dark" })
      await page.goto(harnessUrl(visualCase))
      await expectVisualCaseReady(page)
      await expect(page).toHaveScreenshot(baselineName(visualCase))
    })
  }

  const reducedMotionCase = { crewId, mode: "companion", contrast: "standard", reducedMotion: true } as const
  test(`${crewId}-companion-reduced-motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" })
    await page.goto(harnessUrl(reducedMotionCase))
    await expectVisualCaseReady(page)
    await expect(page).toHaveScreenshot(baselineName(reducedMotionCase))
  })

  const highContrastCase = { crewId, mode: "companion", contrast: "high", reducedMotion: false } as const
  test(`${crewId}-companion-high-contrast`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "dark" })
    await page.goto(harnessUrl(highContrastCase))
    await expectVisualCaseReady(page)
    await expect(page).toHaveScreenshot(baselineName(highContrastCase))
  })
}
