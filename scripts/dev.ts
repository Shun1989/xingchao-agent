import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { spawnCommand } from "./spawn-command.ts"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(dirname, "..")
const repoUserDataDir = path.join(repoRoot, "wanta")

export function isMainModule(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
}

if (isMainModule()) {
  await runDev(process.argv.slice(2))
}

export async function runDev(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawnCommand("vite", args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        WANTA_USER_DATA_DIR: repoUserDataDir,
      },
      stdio: "inherit",
    })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`vite ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}`))
    })
  })
}
