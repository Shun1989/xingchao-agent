import type { BuiltinCrewId } from "../../src/domain/xingchao/types.ts"
import type { FleetElectronApp } from "./electron-fixture.ts"
import type { Page } from "@playwright/test"

import { storageKey } from "../../electron/branding.ts"
import { BUILTIN_CREW_IDS } from "../../src/domain/xingchao/types.ts"
import { expect, test } from "./electron-fixture.ts"
import { FAILING_REQUIRED_ASSET_ID } from "./fixtures/failing-required-asset.ts"

const activeCrewStorageKey = storageKey("activeCrew")

const EXPECTED_SKIN_SIGNATURES = {
  watchtide: { audio: "bell", material: "glass", navigation: "frame", primary: "#2B6F9F" },
  "ink-sail": { audio: "paper", material: "paper", navigation: "ticket", primary: "#8B3444" },
  "brocade-harbor": { audio: "glass", material: "ceramic", navigation: "pill", primary: "#4FA6A0" },
  "forge-vessel": { audio: "relay", material: "metal", navigation: "frame", primary: "#277AB8" },
  "golden-scale": { audio: "scale", material: "metal", navigation: "underline", primary: "#267255" },
  "helm-order": { audio: "stamp", material: "paper", navigation: "ticket", primary: "#385D7A" },
  "iron-code": { audio: "gavel", material: "paper", navigation: "frame", primary: "#7F2938" },
  lighthouse: { audio: "beacon", material: "paper", navigation: "underline", primary: "#4A5FA5" },
  "phantom-wave": { audio: "wave", material: "glass", navigation: "pill", primary: "#7257D8" },
  "rest-harbor": { audio: "breeze", material: "fabric", navigation: "pill", primary: "#557A64" },
} as const satisfies Readonly<
  Record<
    BuiltinCrewId,
    { readonly audio: string; readonly material: string; readonly navigation: string; readonly primary: string }
  >
>

interface SkinSignature {
  readonly activeCrew: string | null
  readonly audio: string
  readonly backdrop: string
  readonly material: string
  readonly navigation: string
  readonly persistedCrew: string | null
  readonly phase: string | null
  readonly primary: string
  readonly rendererSkin: string | null
  readonly rootSkin: string | null
  readonly uniform: string
}

async function signature(page: Page): Promise<SkinSignature> {
  return page.evaluate((storageKeyValue) => {
    const root = document.documentElement
    const style = getComputedStyle(root)
    const state = document.querySelector<HTMLElement>('[data-testid="fleet-e2e-state"]')
    const renderer = document.querySelector<HTMLElement>("[data-captain-renderer]")
    const uniform = document.querySelector<HTMLImageElement>(
      '[data-captain-presentation="uniform"] .captain-layer__image--person',
    )
    return {
      activeCrew: state?.dataset.activeCrew ?? null,
      audio: style.getPropertyValue("--fleet-audio-cue").trim(),
      backdrop: style.getPropertyValue("--fleet-scene-backdrop").trim(),
      material: style.getPropertyValue("--fleet-surface-card-material").trim(),
      navigation: style.getPropertyValue("--fleet-navigation-selected-shape").trim(),
      persistedCrew: localStorage.getItem(storageKeyValue),
      phase: state?.dataset.phase ?? null,
      primary: style.getPropertyValue("--fleet-color-primary").trim(),
      rendererSkin: renderer?.dataset.skinId ?? null,
      rootSkin: root.dataset.fleetSkin ?? null,
      uniform: uniform?.currentSrc ?? uniform?.src ?? "",
    }
  }, activeCrewStorageKey)
}

async function waitForCommittedCrew(page: Page, crewId: BuiltinCrewId): Promise<void> {
  const state = page.getByTestId("fleet-e2e-state")
  await expect(state).toHaveAttribute("data-active-crew", crewId)
  await expect(state).toHaveAttribute("data-phase", "idle")
  await expect(page.locator("html")).toHaveAttribute("data-fleet-skin", crewId)
  await expect(page.locator("[data-captain-renderer]")).toHaveAttribute("data-skin-id", crewId)
}

function expectNoRuntimeErrors(fleetApp: FleetElectronApp): void {
  expect(fleetApp.diagnostics()).toEqual({
    consoleErrors: [],
    mainProcessErrors: [],
    missingResources: [],
    pageErrors: [],
    remoteRequests: [],
    rendererCrashes: [],
  })
}

test("commits every complete fleet skin atomically", async ({ fleetApp }) => {
  const page = fleetApp.page()
  await page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __fleetAtomicFrames?: SkinSignature[]
      __fleetAtomicFrame?: number
    }
    host.__fleetAtomicFrames = []
    const sample = () => {
      const root = document.documentElement
      const style = getComputedStyle(root)
      const state = document.querySelector<HTMLElement>('[data-testid="fleet-e2e-state"]')
      const renderer = document.querySelector<HTMLElement>("[data-captain-renderer]")
      const uniform = document.querySelector<HTMLImageElement>(
        '[data-captain-presentation="uniform"] .captain-layer__image--person',
      )
      host.__fleetAtomicFrames!.push({
        activeCrew: state?.dataset.activeCrew ?? null,
        audio: style.getPropertyValue("--fleet-audio-cue").trim(),
        backdrop: style.getPropertyValue("--fleet-scene-backdrop").trim(),
        material: style.getPropertyValue("--fleet-surface-card-material").trim(),
        navigation: style.getPropertyValue("--fleet-navigation-selected-shape").trim(),
        persistedCrew: null,
        phase: state?.dataset.phase ?? null,
        primary: style.getPropertyValue("--fleet-color-primary").trim(),
        rendererSkin: renderer?.dataset.skinId ?? null,
        rootSkin: root.dataset.fleetSkin ?? null,
        uniform: uniform?.currentSrc ?? uniform?.src ?? "",
      })
      host.__fleetAtomicFrame = requestAnimationFrame(sample)
    }
    sample()
  })

  const backdrops = new Set<string>()
  const committedSignatures = new Map<BuiltinCrewId, SkinSignature>()
  const uniforms = new Set<string>()
  for (const crewId of BUILTIN_CREW_IDS) {
    await page.getByTestId(`fleet-select-${crewId}`).click()
    await waitForCommittedCrew(page, crewId)
    const actual = await signature(page)
    const expected = EXPECTED_SKIN_SIGNATURES[crewId]
    expect(actual).toMatchObject({
      activeCrew: crewId,
      audio: expected.audio,
      material: expected.material,
      navigation: expected.navigation,
      persistedCrew: crewId,
      phase: "idle",
      primary: expected.primary,
      rendererSkin: crewId,
      rootSkin: crewId,
    })
    expect(actual.backdrop).toMatch(/^url\("file:\/\/\//u)
    expect(actual.uniform).toMatch(/^file:\/\/\//u)
    backdrops.add(actual.backdrop)
    committedSignatures.set(crewId, actual)
    uniforms.add(actual.uniform)
  }
  expect(backdrops.size).toBe(10)
  expect(uniforms.size).toBe(10)

  const frames = await page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __fleetAtomicFrames?: SkinSignature[]
      __fleetAtomicFrame?: number
    }
    if (host.__fleetAtomicFrame !== undefined) cancelAnimationFrame(host.__fleetAtomicFrame)
    return host.__fleetAtomicFrames ?? []
  })
  for (const frame of frames.filter((candidate) => candidate.rootSkin && candidate.rendererSkin)) {
    const crewId = frame.rootSkin as BuiltinCrewId
    expect(frame.rendererSkin, `renderer at visible ${crewId} frame`).toBe(crewId)
    expect(frame.primary, `primary at visible ${crewId} frame`).toBe(EXPECTED_SKIN_SIGNATURES[crewId].primary)
    expect(frame.material, `material at visible ${crewId} frame`).toBe(EXPECTED_SKIN_SIGNATURES[crewId].material)
    expect(frame.audio, `audio at visible ${crewId} frame`).toBe(EXPECTED_SKIN_SIGNATURES[crewId].audio)
    expect(frame.backdrop, `backdrop at visible ${crewId} frame`).toBe(committedSignatures.get(crewId)?.backdrop)
    expect(frame.uniform, `uniform at visible ${crewId} frame`).toBe(committedSignatures.get(crewId)?.uniform)
  }
  expectNoRuntimeErrors(fleetApp)
})

test("preserves one captain host while routes change its adaptive mode", async ({ fleetApp }) => {
  const page = fleetApp.page()
  await page.getByTestId("fleet-select-golden-scale").click()
  await waitForCommittedCrew(page, "golden-scale")
  await expect(page.locator("[data-captain-host]")).toHaveAttribute("data-captain-mode", "stage")
  await page.evaluate(() => {
    ;(globalThis as typeof globalThis & { __fleetHostNode?: Element }).__fleetHostNode =
      document.querySelector("[data-captain-host]") ?? undefined
  })

  for (const [route, mode, branch] of [
    ["fleet", "stage", "workspace"],
    ["voyage", "stage", "workspace"],
    ["connections", "companion", "workspace"],
    ["settings", "compact", "settings"],
    ["fleet", "stage", "workspace"],
  ] as const) {
    await page.getByTestId(`route-${route}`).click()
    await expect(page.getByTestId("fleet-e2e-state")).toHaveAttribute("data-route", route)
    await expect(page.locator("[data-fleet-acceptance-root]")).toHaveAttribute("data-route-branch", branch)
    await expect(page.locator("[data-captain-host]")).toHaveAttribute("data-captain-mode", mode)
    expect(
      await page.evaluate(() => {
        const host = globalThis as typeof globalThis & { __fleetHostNode?: Element }
        return (
          host.__fleetHostNode?.isConnected === true &&
          host.__fleetHostNode === document.querySelector("[data-captain-host]")
        )
      }),
    ).toBe(true)
    expect(await signature(page)).toMatchObject({
      activeCrew: "golden-scale",
      persistedCrew: "golden-scale",
      rendererSkin: "golden-scale",
      rootSkin: "golden-scale",
    })
  }
  expectNoRuntimeErrors(fleetApp)
})

test("restores the committed fleet across an isolated Electron restart", async ({ fleetApp }) => {
  let page = fleetApp.page()
  await page.getByTestId("fleet-select-phantom-wave").click()
  await waitForCommittedCrew(page, "phantom-wave")

  page = await fleetApp.restart({ queryCrewId: "watchtide" })
  await waitForCommittedCrew(page, "phantom-wave")
  const bridge = await fleetApp.bridge()
  expect(bridge.initialStoredCrew).toBe("phantom-wave")
  expect(bridge.lifecycle.indexOf("committed:phantom-wave")).toBeGreaterThanOrEqual(0)
  expect(bridge.lifecycle.indexOf("ready:phantom-wave")).toBeGreaterThan(
    bridge.lifecycle.indexOf("committed:phantom-wave"),
  )
  await expect
    .poll(async () => (await fleetApp.bridge()).lifecycle.indexOf("observed-ready:true:phantom-wave"))
    .toBeGreaterThan(bridge.lifecycle.indexOf("observed-skin:phantom-wave"))
  expect(bridge.lifecycle).not.toContain("ready:watchtide")
  expect((await signature(page)).persistedCrew).toBe("phantom-wave")
  expectNoRuntimeErrors(fleetApp)
})

test("keeps voice muted until a critical app event and preserves captions on mute", async ({ fleetApp }) => {
  const page = fleetApp.page()
  const enable = page.getByRole("button", { name: "开启舰长语音" })
  await expect(enable).toHaveAttribute("aria-pressed", "false")
  expect((await fleetApp.bridge()).speech.spoken).toEqual([])

  await enable.click()
  await page.getByTestId("route-connections").click()
  await page.getByTestId("task-start").click()
  expect((await fleetApp.bridge()).speech.spoken).toEqual([])

  await page.getByTestId("task-complete").click()
  await expect.poll(async () => (await fleetApp.bridge()).speech.spoken.length).toBe(1)
  expect((await fleetApp.bridge()).speech.spoken).toEqual([
    { lang: "zh-CN", rate: 1, text: "任务已经完成。", volume: 0.85 },
  ])
  const cancellations = (await fleetApp.bridge()).speech.cancelCount
  await page.getByRole("button", { name: "一键静音" }).click()
  await expect.poll(async () => (await fleetApp.bridge()).speech.cancelCount).toBeGreaterThan(cancellations)
  await expect(page.locator('[aria-live="polite"]')).not.toBeEmpty()
  await expect(page.locator('[aria-live="polite"]')).toBeAttached()
  expectNoRuntimeErrors(fleetApp)
})

test("rolls back an uncached required asset failure without persisting the target", async ({ fleetApp }) => {
  const page = fleetApp.page()
  const before = await signature(page)
  await page.evaluate(() => {
    const bridge = (globalThis as typeof globalThis & { __fleetE2EBridge?: { failRequiredAsset: boolean } })
      .__fleetE2EBridge
    if (!bridge) throw new Error("Fleet E2E bridge is missing")
    bridge.failRequiredAsset = true
  })
  await page.getByTestId("fleet-select-ink-sail").click()
  await expect(page.getByTestId("fleet-e2e-state")).toHaveAttribute("data-phase", "error")
  const after = await signature(page)
  expect(after).toMatchObject({
    ...before,
    phase: "error",
  })
  expect((await fleetApp.bridge()).failureHits).toEqual([FAILING_REQUIRED_ASSET_ID])
  expectNoRuntimeErrors(fleetApp)
})

test("supports keyboard controls, reduced motion, and system high contrast", async ({ fleetApp }) => {
  const page = await fleetApp.restart({ forcedColors: true, reducedMotion: true })
  await expect(page.locator("html")).toHaveAttribute("data-fleet-contrast", "high")
  const highContrastTokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const value = (name: string) => style.getPropertyValue(name).trim()
    return {
      background: value("--background"),
      canvas: value("--fleet-a11y-high-contrast-canvas"),
      border: value("--border"),
      focus: value("--fleet-a11y-high-contrast-focus"),
      ring: value("--ring"),
    }
  })
  expect(highContrastTokens.background).toBe(highContrastTokens.canvas)
  expect(highContrastTokens.border).toBe(highContrastTokens.focus)
  expect(highContrastTokens.ring).toBe(highContrastTokens.focus)
  expect(highContrastTokens.focus).not.toBe("")
  await expect(page.locator("[data-captain-renderer]")).toHaveAttribute("data-reduced-motion", "true")
  expect(
    await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running" || animation.playState === "pending")
        .map((animation) => animation.playState),
    ),
  ).toEqual([])

  const voiceControl = page.getByRole("button", { name: "开启舰长语音" })
  await voiceControl.focus()
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Tab")
  await expect(voiceControl).toBeFocused()
  expect(
    await page.getByRole("button", { name: "开启舰长语音" }).evaluate((element) => {
      const style = getComputedStyle(element)
      return (
        style.outlineStyle === "solid" &&
        Number.parseFloat(style.outlineWidth) >= 3 &&
        style.outlineColor !== "transparent"
      )
    }),
  ).toBe(true)
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "关闭舰长语音" })).toBeFocused()
  const cancellations = (await fleetApp.bridge()).speech.cancelCount
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "一键静音" })).toBeFocused()
  await page.keyboard.press("Space")
  await expect.poll(async () => (await fleetApp.bridge()).speech.cancelCount).toBeGreaterThan(cancellations)

  for (const contentSize of [
    { width: 1024, height: 640 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ] as const) {
    expect(await fleetApp.resize(contentSize)).toEqual(contentSize)
    const layout = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("[data-captain-host]")
      const root = document.documentElement
      const hostRect = host?.getBoundingClientRect()
      return {
        captainConnected: host?.isConnected ?? false,
        captainInsideViewport:
          hostRect !== undefined &&
          hostRect.left >= 0 &&
          hostRect.top >= 0 &&
          hostRect.right <= window.innerWidth &&
          hostRect.bottom <= window.innerHeight,
        horizontalOverflow: root.scrollWidth > window.innerWidth,
        skin: root.dataset.fleetSkin ?? null,
      }
    })
    expect(layout).toEqual({
      captainConnected: true,
      captainInsideViewport: true,
      horizontalOverflow: false,
      skin: "watchtide",
    })
  }
  expectNoRuntimeErrors(fleetApp)
})
