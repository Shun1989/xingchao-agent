import { createRequire } from "node:module"
import path from "node:path"
import { describe, expect, it } from "vitest"

const builderRequire = createRequire(require.resolve("electron-builder"))
const { createUpdateInfoTasks } = builderRequire("app-builder-lib/out/publish/updateInfoBuilder") as {
  createUpdateInfoTasks: (event: unknown, publishConfigs: unknown[]) => Promise<Array<{ file: string }>>
}
const { Platform } = builderRequire("app-builder-lib/out/core") as {
  Platform: { WINDOWS: unknown }
}

function updateEvent() {
  return {
    arch: 0,
    file: "fixture-installer.exe",
    safeArtifactName: "xingchao-navigation-setup-0.1.0-beta.1.exe",
    target: { outDir: "fixture-output" },
    updateInfo: { sha512: "fixture-sha512" },
    packager: {
      appInfo: { version: "0.1.0-beta.1" },
      config: { generateUpdatesFilesForAllChannels: false },
      getResource: async () => null,
      metadata: { dependencies: { "electron-updater": "6.8.9" } },
      platform: Platform.WINDOWS,
      platformSpecificBuildOptions: { generateUpdatesFilesForAllChannels: false },
    },
  }
}

describe("installed electron-builder beta update metadata boundary", () => {
  it("emits beta.yml only when the GitHub publish channel is explicitly beta", async () => {
    const tasks = await createUpdateInfoTasks(updateEvent(), [
      {
        provider: "github",
        owner: "Shun1989",
        repo: "xingchao-agent",
        channel: "beta",
        releaseType: "prerelease",
      },
    ])

    expect(tasks.map((task) => path.basename(task.file))).toEqual(["beta.yml"])
  })

  it("shows that releaseType prerelease alone still emits stable latest.yml", async () => {
    const tasks = await createUpdateInfoTasks(updateEvent(), [
      {
        provider: "github",
        owner: "Shun1989",
        repo: "xingchao-agent",
        releaseType: "prerelease",
      },
    ])

    expect(tasks.map((task) => path.basename(task.file))).toEqual(["latest.yml"])
  })
})
