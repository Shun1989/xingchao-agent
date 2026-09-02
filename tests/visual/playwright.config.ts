import { defineConfig } from "@playwright/test"

export default defineConfig({
  outputDir: "test-results",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  expect: {
    timeout: 30_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      // Electron's GPU/WebP rasterization can vary by a few edge pixels between
      // otherwise identical captures on Windows. Keep the allowance below the
      // smallest visually meaningful change while avoiding a non-repeatable
      // zero-pixel gate (observed local variance: at most 51 pixels).
      maxDiffPixels: 64,
    },
  },
  projects: [
    {
      name: "fleet-visual",
      testDir: ".",
      testMatch: "fleet-skins.visual.spec.ts",
    },
    {
      name: "fleet-e2e",
      testDir: "../e2e",
      testMatch: "fleet-skins.electron.spec.ts",
    },
  ],
})
