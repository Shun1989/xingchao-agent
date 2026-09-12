import type { AppLocale } from "../app-locale.ts"
import type { MissionFileDialogs } from "./mission-service.ts"

import { dialog } from "electron"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { atomicWriteText } from "../atomic-file.ts"
import { parseMissionBackup } from "./mission-store.ts"

export function createMissionFileDialogs(userData: string, locale: () => AppLocale): MissionFileDialogs {
  return {
    async save(contents) {
      const zh = locale() === "zh-CN"
      const picked = await dialog.showSaveDialog({
        title: zh ? "导出任务记录备份" : "Export mission history backup",
        defaultPath: `mission-history-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      })
      if (picked.canceled || !picked.filePath) return "cancelled"
      const [parent, profile] = await Promise.all([realpath(path.dirname(picked.filePath)), realpath(userData)])
      const relative = path.relative(profile, parent)
      if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)))
        throw new Error("Export must be outside application storage")
      await atomicWriteText(path.join(parent, path.basename(picked.filePath)), contents, { mode: 0o600 })
      return "done"
    },
    async chooseBackup() {
      const zh = locale() === "zh-CN"
      const picked = await dialog.showOpenDialog({
        title: zh ? "选择任务记录备份" : "Choose mission history backup",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      })
      if (picked.canceled || !picked.filePaths[0]) return null
      const file = picked.filePaths[0]
      const info = await stat(file)
      if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error("Invalid backup file")
      const text = await readFile(file, "utf8")
      const snapshot = parseMissionBackup(text)
      const confirmation = await dialog.showMessageBox({
        type: "warning",
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        buttons: zh ? ["取消", "恢复备份"] : ["Cancel", "Restore backup"],
        message: zh
          ? `恢复这份备份中的 ${snapshot.runs.length} 条任务记录？`
          : `Restore ${snapshot.runs.length} mission records from this backup?`,
        detail: zh
          ? "当前损坏文件会先原样保留在应用数据目录。备份之后的记录不会自动补回；未完成任务会标记为中断，不会自动执行。备份只包含任务记录，不包含对话、附件或 API Key。"
          : "The damaged file will be preserved in application storage first. Records newer than this backup cannot be recreated. Unfinished runs will be blocked, never executed automatically. Backups contain mission records, not chats, attachments or API keys.",
      })
      return confirmation.response === 1 ? text : null
    },
  }
}
