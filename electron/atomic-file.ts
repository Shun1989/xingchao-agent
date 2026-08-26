import { randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export interface AtomicWriteTextOptions {
  mode?: number
}

// Windows does not guarantee that concurrent rename-over-existing operations
// to the same path can all succeed. Serialize only identical target paths;
// unrelated stores continue writing in parallel.
const writeQueues = new Map<string, Promise<void>>()

/** 统一异步文本文件的同目录临时写入、原子替换和失败清理。 */
export function atomicWriteText(
  filePath: string,
  content: string,
  options: AtomicWriteTextOptions = {},
): Promise<void> {
  const queueKey = path.resolve(filePath)
  const previous = writeQueues.get(queueKey) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(() => writeTextAtomically(filePath, content, options))
  writeQueues.set(queueKey, current)
  return current.finally(() => {
    if (writeQueues.get(queueKey) === current) {
      writeQueues.delete(queueKey)
    }
  })
}

async function writeTextAtomically(filePath: string, content: string, options: AtomicWriteTextOptions): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      ...(options.mode === undefined ? {} : { mode: options.mode }),
    })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
