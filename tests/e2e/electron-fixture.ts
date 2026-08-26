import type { ElectronApplication, Page } from "@playwright/test"

import { _electron as electron, test as base } from "@playwright/test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { storageKey } from "../../electron/branding.ts"

export interface FleetE2EDiagnostics {
  readonly consoleErrors: readonly string[]
  readonly mainProcessErrors: readonly string[]
  readonly missingResources: readonly string[]
  readonly pageErrors: readonly string[]
  readonly remoteRequests: readonly string[]
  readonly rendererCrashes: readonly string[]
}

export interface FleetE2EBridgeSnapshot {
  readonly initialStoredCrew: string | null
  readonly lifecycle: readonly string[]
  readonly failureHits: readonly string[]
  readonly speech: {
    readonly cancelCount: number
    readonly spoken: readonly {
      readonly lang: string
      readonly rate: number
      readonly text: string
      readonly volume: number
    }[]
  }
}

export interface AcceptancePageOptions {
  readonly clearStorage?: boolean
  readonly forcedColors?: boolean
  readonly queryCrewId?: string
  readonly reducedMotion?: boolean
  readonly waitForReady?: boolean
}

export interface FleetElectronApp {
  page(): Page
  bridge(): Promise<FleetE2EBridgeSnapshot>
  diagnostics(): FleetE2EDiagnostics
  restart(options?: Omit<AcceptancePageOptions, "clearStorage">): Promise<Page>
}

interface FleetFixtures {
  fleetApp: FleetElectronApp
}

interface FleetWorkerFixtures {
  fleetUserData: string
}

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(fixtureDirectory, "../..")
const visualEntry = pathToFileURL(path.join(repositoryRoot, "dist-visual/index.html"))
const bootstrapEntry = pathToFileURL(path.join(repositoryRoot, "dist-visual/electron-bootstrap.html"))
const activeCrewStorageKey = storageKey("activeCrew")

function acceptanceUrl(crewId: string, reducedMotion: boolean): string {
  const url = new URL(visualEntry)
  url.searchParams.set("crewId", crewId)
  url.searchParams.set("mode", "stage")
  url.searchParams.set("contrast", "standard")
  url.searchParams.set("reducedMotion", String(reducedMotion))
  url.hash = "fleet-e2e"
  return url.href
}

function electronMainSource(): string {
  const policyPath = path.join(repositoryRoot, "tests/visual/local-url-policy.cjs")
  const buildRoot = path.join(repositoryRoot, "dist-visual")
  return `
const { app, BrowserWindow, session } = require("electron")
const { createLocalVisualUrlPolicy } = require(${JSON.stringify(policyPath)})

const userData = process.env.FLEET_E2E_USER_DATA
if (!userData) throw new Error("FLEET_E2E_USER_DATA is required")
app.setPath("userData", userData)
const isAllowedVisualUrl = createLocalVisualUrlPolicy(${JSON.stringify(buildRoot)})
app.commandLine.appendSwitch("lang", "zh-CN")
app.commandLine.appendSwitch("disable-renderer-backgrounding")

let fleetWindow = null
app.whenReady().then(async () => {
  const isolatedSession = session.fromPartition("persist:fleet-e2e")
  isolatedSession.setPermissionCheckHandler(() => false)
  isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    const rendererResource = details.resourceType !== "mainFrame" && details.resourceType !== "subFrame"
    callback({ cancel: !isAllowedVisualUrl(details.url, rendererResource) })
  })
  fleetWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: "#071522",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      sandbox: true,
      session: isolatedSession,
    },
  })
  fleetWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  fleetWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedVisualUrl(url)) event.preventDefault()
  })
  fleetWindow.on("closed", () => {
    fleetWindow = null
  })
  await fleetWindow.loadURL(${JSON.stringify(bootstrapEntry.href)})
})

app.on("window-all-closed", () => app.quit())
`
}

async function installAcceptanceBoundary(page: Page, options: Required<AcceptancePageOptions>): Promise<void> {
  await page.addInitScript(
    ({ clearStorage, storageKey: key }) => {
      if (clearStorage) {
        localStorage.clear()
        localStorage.setItem(key, "watchtide")
      }
      const completionTimers = new Set<number>()
      const bridge = {
        enabled: true,
        failRequiredAsset: false,
        failureHits: [] as string[],
        initialStoredCrew: localStorage.getItem(key),
        lifecycle: [] as string[],
        speech: {
          cancelCount: 0,
          spoken: [] as Array<{ lang: string; rate: number; text: string; volume: number }>,
        },
      }
      Object.defineProperty(globalThis, "__fleetE2EBridge", { configurable: true, value: bridge })

      const observeCommitBoundary = (): boolean => {
        const root = document.documentElement
        if (!root) return false
        let lastSkin = ""
        let lastReady = ""
        const sample = () => {
          const skin = root.dataset.fleetSkin ?? "none"
          if (skin !== lastSkin) {
            lastSkin = skin
            bridge.lifecycle.push(`observed-skin:${skin}`)
          }
          const ready = document.querySelector<HTMLElement>('[data-testid="fleet-e2e-ready"]')?.dataset.ready ?? "none"
          if (ready !== lastReady) {
            lastReady = ready
            bridge.lifecycle.push(`observed-ready:${ready}:${skin}`)
          }
        }
        new MutationObserver(sample).observe(root, {
          attributeFilter: ["data-fleet-skin", "data-ready"],
          attributes: true,
          childList: true,
          subtree: true,
        })
        sample()
        return true
      }
      if (!observeCommitBoundary()) {
        const documentObserver = new MutationObserver(() => {
          if (observeCommitBoundary()) documentObserver.disconnect()
        })
        documentObserver.observe(document, { childList: true, subtree: true })
      }

      class FleetSpeechSynthesisUtterance {
        lang = ""
        onend: ((event: Event) => void) | null = null
        onerror: ((event: Event) => void) | null = null
        pitch = 1
        rate = 1
        text: string
        voice: SpeechSynthesisVoice | null = null
        volume = 1

        constructor(text = "") {
          this.text = String(text)
        }

        addEventListener(): void {}
        dispatchEvent(): boolean {
          return true
        }
        removeEventListener(): void {}
      }

      const speechSynthesis = {
        cancel() {
          bridge.speech.cancelCount += 1
          for (const timer of completionTimers) clearTimeout(timer)
          completionTimers.clear()
        },
        getVoices: () => [],
        onvoiceschanged: null,
        pause() {},
        paused: false,
        pending: false,
        resume() {},
        speak(utterance: FleetSpeechSynthesisUtterance) {
          bridge.speech.spoken.push({
            lang: utterance.lang,
            rate: utterance.rate,
            text: utterance.text,
            volume: utterance.volume,
          })
          const timer = window.setTimeout(() => {
            completionTimers.delete(timer)
            utterance.onend?.(new Event("end"))
          }, 250)
          completionTimers.add(timer)
        },
        speaking: false,
      }
      Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
        configurable: true,
        value: FleetSpeechSynthesisUtterance,
      })
      Object.defineProperty(globalThis, "speechSynthesis", { configurable: true, value: speechSynthesis })
    },
    { clearStorage: options.clearStorage, storageKey: activeCrewStorageKey },
  )

  await page.emulateMedia({
    colorScheme: "dark",
    forcedColors: options.forcedColors ? "active" : "none",
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
  })
}

function mutableDiagnostics(): {
  consoleErrors: string[]
  mainProcessErrors: string[]
  missingResources: string[]
  pageErrors: string[]
  remoteRequests: string[]
  rendererCrashes: string[]
} {
  return {
    consoleErrors: [],
    mainProcessErrors: [],
    missingResources: [],
    pageErrors: [],
    remoteRequests: [],
    rendererCrashes: [],
  }
}

function observePage(page: Page, diagnostics: ReturnType<typeof mutableDiagnostics>): void {
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message))
  page.on("crash", () => diagnostics.rendererCrashes.push(page.url()))
  page.on("request", (request) => {
    if (/^(?:https?|wss?):/iu.test(request.url())) diagnostics.remoteRequests.push(request.url())
  })
  page.on("requestfailed", (request) => {
    if (!/^(?:https?|wss?):/iu.test(request.url())) {
      diagnostics.missingResources.push(`${request.url()}: ${request.failure()?.errorText ?? "failed"}`)
    }
  })
  page.on("websocket", (socket) => {
    if (/^wss?:/iu.test(socket.url())) diagnostics.remoteRequests.push(socket.url())
  })
}

export const test = base.extend<FleetFixtures, FleetWorkerFixtures>({
  fleetUserData: [
    // eslint-disable-next-line no-empty-pattern -- Playwright worker fixtures require object destructuring.
    async ({}, fixtureUse) => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "wanta-fleet-e2e-"))
      const mainScript = path.join(directory, "electron-main.cjs")
      await fs.writeFile(mainScript, electronMainSource(), "utf8")
      await fixtureUse(directory)
      await fs.rm(directory, { recursive: true })
    },
    { scope: "worker" },
  ],
  fleetApp: async ({ fleetUserData }, fixtureUse) => {
    const diagnostics = mutableDiagnostics()
    const mainScript = path.join(fleetUserData, "electron-main.cjs")
    let electronApp: ElectronApplication
    let activePage: Page | undefined
    let activeRun: { expectedClose: boolean } | null = null

    const closeActiveApp = async (): Promise<void> => {
      if (activeRun === null) return
      activeRun.expectedClose = true
      await electronApp.close()
      activeRun = null
    }

    const launch = async (options: Required<AcceptancePageOptions>): Promise<Page> => {
      electronApp = await electron.launch({
        executablePath: path.join(repositoryRoot, ".electron-dist/electron.exe"),
        args: [mainScript],
        cwd: repositoryRoot,
        env: {
          ...process.env,
          ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
          FLEET_E2E_USER_DATA: fleetUserData,
          TZ: "Asia/Shanghai",
        },
      })
      const run = { expectedClose: false }
      activeRun = run
      const electronProcess = electronApp.process()
      electronProcess.stderr?.on("data", (chunk: Buffer | string) => {
        const message = String(chunk).trim()
        if (/\b(?:fatal|unhandled|uncaught|crash(?:ed)?)\b/iu.test(message)) diagnostics.mainProcessErrors.push(message)
      })
      electronProcess.on("exit", (code, signal) => {
        if (!run.expectedClose || (code !== null && code !== 0)) {
          diagnostics.mainProcessErrors.push(`unexpected Electron exit: code=${String(code)} signal=${String(signal)}`)
        }
      })
      try {
        activePage = await electronApp.firstWindow()
        observePage(activePage, diagnostics)
        await activePage.getByTestId("electron-bootstrap-ready").waitFor({ state: "attached" })
        await installAcceptanceBoundary(activePage, options)
        await activePage.goto(acceptanceUrl(options.queryCrewId, options.reducedMotion))
        if (options.waitForReady) {
          await activePage.waitForFunction(
            () => document.querySelector('[data-testid="fleet-e2e-ready"]')?.getAttribute("data-ready") === "true",
            undefined,
            { timeout: 15_000 },
          )
        }
        return activePage
      } catch (cause) {
        const renderedEvidence =
          activePage === undefined
            ? null
            : await activePage
                .evaluate(() => ({
                  body: document.body.textContent?.slice(0, 500) ?? "",
                  bridge: (globalThis as typeof globalThis & { __fleetE2EBridge?: unknown }).__fleetE2EBridge ?? null,
                  htmlSkin: document.documentElement.dataset.fleetSkin ?? null,
                  readyError:
                    document.querySelector<HTMLElement>('[data-testid="fleet-e2e-ready"]')?.dataset.readyError ?? null,
                  rendererSkin: document.querySelector<HTMLElement>("[data-captain-renderer]")?.dataset.skinId ?? null,
                  state: document.querySelector<HTMLElement>('[data-testid="fleet-e2e-state"]')?.dataset ?? null,
                }))
                .catch(() => null)
        const evidence = {
          diagnostics,
          page: activePage === undefined ? null : { closed: activePage.isClosed(), url: activePage.url() },
          rendered: renderedEvidence,
        }
        await closeActiveApp()
        throw new Error(`Fleet acceptance launch failed: ${JSON.stringify(evidence)}`, { cause })
      }
    }

    const defaults = (options: AcceptancePageOptions = {}): Required<AcceptancePageOptions> => ({
      clearStorage: options.clearStorage ?? true,
      forcedColors: options.forcedColors ?? false,
      queryCrewId: options.queryCrewId ?? "watchtide",
      reducedMotion: options.reducedMotion ?? false,
      waitForReady: options.waitForReady ?? true,
    })

    await launch(defaults())
    const controller: FleetElectronApp = {
      page: () => {
        if (activePage === undefined) throw new Error("Fleet E2E page is not active")
        return activePage
      },
      bridge: () => {
        if (activePage === undefined) throw new Error("Fleet E2E page is not active")
        return activePage.evaluate(() => {
          const bridge = (globalThis as typeof globalThis & { __fleetE2EBridge?: FleetE2EBridgeSnapshot })
            .__fleetE2EBridge
          if (!bridge) throw new Error("Fleet E2E bridge is missing")
          return structuredClone(bridge)
        })
      },
      diagnostics: () => ({
        consoleErrors: [...diagnostics.consoleErrors],
        mainProcessErrors: [...diagnostics.mainProcessErrors],
        missingResources: [...diagnostics.missingResources],
        pageErrors: [...diagnostics.pageErrors],
        remoteRequests: [...diagnostics.remoteRequests],
        rendererCrashes: [...diagnostics.rendererCrashes],
      }),
      restart: async (options = {}) => {
        await closeActiveApp()
        return launch(defaults({ ...options, clearStorage: false }))
      },
    }
    try {
      await fixtureUse(controller)
    } finally {
      await closeActiveApp()
    }
  },
})

export { expect } from "@playwright/test"
