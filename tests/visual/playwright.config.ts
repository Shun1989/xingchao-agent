import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "fleet-skins.visual.spec.ts",
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
      maxDiffPixels: 0,
    },
  },
})
