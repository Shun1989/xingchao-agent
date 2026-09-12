import { ConnectionServer, ConnectionService } from "@oomol/connection"
import { ElectronServerAdapter } from "@oomol/connection-electron-adapter/server"
import { app, BrowserWindow, session } from "electron"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { MissionRunServiceImpl, MissionRunQueryService } from "../../../electron/xingchao/mission-service.ts"
import { MissionRunStore } from "../../../electron/xingchao/mission-store.ts"
import { draftMission } from "../../../src/domain/xingchao/routing.ts"
import { builtinRuntimeFleetSnapshot } from "../../../src/domain/xingchao/runtime-fleet.ts"
import { Controls } from "./controls.ts"

async function run(): Promise<void> {
  const root = process.env["MISSION_UI_SMOKE_ROOT"]
  if (!root || !path.isAbsolute(root)) throw new Error("Isolated smoke root is required")
  const corrupt = process.env["MISSION_UI_SMOKE_CORRUPT"] === "1"
  app.setPath("userData", path.join(root, corrupt ? "corrupt-profile" : "profile"))
  await app.whenReady()
  const store = new MissionRunStore(app.getPath("userData"))
  const deps = { store, runtimeFleet: async () => builtinRuntimeFleetSnapshot }
  const seed = new MissionRunServiceImpl(deps)
  const interrupted = await seed.admit({ mission: { ...draftMission("恢复中断任务"), id: "recovery-fixture" } })
  await seed.start({ runId: interrupted.runId, sessionId: "original-session", generationId: "original-generation" })
  if (corrupt) {
    await writeFile(path.join(root, "recovery-backup.json"), await seed.exportHistory())
    await writeFile(path.join(app.getPath("userData"), "mission-runs.json"), "{damaged-history")
  }
  let failNextWrite = false
  const manager = new MissionRunServiceImpl({
    ...deps,
    store: {
      read: () => store.read(),
      restoreCorrupt: (state) => store.restoreCorrupt(state),
      write: async (state) => {
        if (failNextWrite) {
          failNextWrite = false
          throw new Error("synthetic disk failure")
        }
        await store.write(state)
      },
    },
  })
  if (!corrupt) {
    await manager.list()
    const pending = await manager.admit({ mission: { ...draftMission("保存失败任务"), id: "saving-fixture" } })
    await manager.start({ runId: pending.runId, sessionId: "save-session", generationId: "save-generation" })
    failNextWrite = true
    await manager
      .settleChatTurn({
        sessionId: "save-session",
        generationId: "save-generation",
        outcome: "completed",
        reason: "message_completed",
      })
      .catch(() => undefined)
  }
  class TestControls extends ConnectionService<typeof Controls> {
    constructor() {
      super(Controls)
    }
    async retry(runId: string) {
      const next = await manager.admitRetry(runId, "original-session")
      await manager.start({ runId: next.runId, sessionId: "original-session", generationId: "retry-generation" })
      await manager.settleChatTurn({
        sessionId: "original-session",
        generationId: "retry-generation",
        outcome: "completed",
        reason: "message_completed",
      })
    }
  }
  const server = new ConnectionServer(new ElectronServerAdapter())
  server.registerService(
    new MissionRunQueryService(manager, {
      save: async (contents) => {
        await writeFile(path.join(root, "exported-history.json"), contents)
        return "done"
      },
      chooseBackup: async () => readFile(path.join(root, "recovery-backup.json"), "utf8"),
    }),
  )
  server.registerService(new TestControls())
  server.start()
  const rendererRoot = path.join(root, "renderer")
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = details.url.startsWith("data:")
    if (details.url.startsWith("file:")) {
      const url = new URL(details.url)
      if (!url.hostname) {
        const relative = path.relative(rendererRoot, fileURLToPath(url))
        allowed = relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      }
    }
    callback({ cancel: !allowed })
  })
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  const window = new BrowserWindow({
    width: 1100,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(root, "preload", "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())
  await window.loadFile(path.join(rendererRoot, "index.html"))
  app.on("window-all-closed", () => app.quit())
}
void run().catch((error: unknown) => {
  console.error(error)
  app.exit(1)
})
