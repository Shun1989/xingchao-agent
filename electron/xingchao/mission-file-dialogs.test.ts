import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { createMissionFileDialogs } from "./mission-file-dialogs.ts"
import { emptyMissionRunState } from "./mission-store.ts"
const dialogs = vi.hoisted(() => ({ showSaveDialog: vi.fn(), showOpenDialog: vi.fn(), showMessageBox: vi.fn() }))
vi.mock("electron", () => ({ dialog: dialogs }))
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.resetAllMocks()
})
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mission-dialogs-"))
  roots.push(root)
  const profile = path.join(root, "profile")
  await mkdir(profile)
  return { root, profile, files: createMissionFileDialogs(profile, () => "zh-CN") }
}
it("exports only to a native-selected file outside application storage", async () => {
  const { root, profile, files } = await fixture()
  const snapshot = JSON.stringify(emptyMissionRunState())
  dialogs.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: path.join(profile, "mission-runs.json") })
  await expect(files.save(snapshot)).rejects.toThrow(/outside/)
  dialogs.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: path.join(root, "backup.json") })
  expect(await files.save(snapshot)).toBe("done")
  expect(await readFile(path.join(root, "backup.json"), "utf8")).toBe(snapshot)
})
it("cancelled save and cancelled restore have no file effects", async () => {
  const { files } = await fixture()
  dialogs.showSaveDialog.mockResolvedValueOnce({ canceled: true })
  dialogs.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
  expect(await files.save("unused")).toBe("cancelled")
  expect(await files.chooseBackup()).toBeNull()
  expect(dialogs.showMessageBox).not.toHaveBeenCalled()
})
it("invalid backups are rejected before confirmation and valid backups require explicit confirmation", async () => {
  const { root, files } = await fixture()
  const file = path.join(root, "backup.json")
  dialogs.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })
  await writeFile(file, "{broken")
  await expect(files.chooseBackup()).rejects.toThrow()
  expect(dialogs.showMessageBox).not.toHaveBeenCalled()
  const snapshot = JSON.stringify(emptyMissionRunState())
  await writeFile(file, snapshot)
  dialogs.showMessageBox.mockResolvedValueOnce({ response: 0 }).mockResolvedValueOnce({ response: 1 })
  expect(await files.chooseBackup()).toBeNull()
  expect(await files.chooseBackup()).toBe(snapshot)
  expect(dialogs.showMessageBox.mock.calls[0]?.[0]).toMatchObject({ defaultId: 0, cancelId: 0 })
})
