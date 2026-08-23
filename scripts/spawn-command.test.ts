import assert from "node:assert/strict"
import { describe, test } from "vitest"
import { resolveSpawnCommand, spawnCommand } from "./spawn-command.ts"

describe("spawnCommand", () => {
  test("routes Windows command shims through ComSpec without shell mode", () => {
    assert.deepEqual(resolveSpawnCommand("corepack", ["pnpm", "--version"], "win32", "C:\\Windows\\cmd.exe"), {
      command: "C:\\Windows\\cmd.exe",
      args: ["/d", "/s", "/c", "corepack", "pnpm", "--version"],
    })
  })

  test.runIf(process.platform === "win32")("spawns the real Corepack command shim on Windows", async () => {
    const child = spawnCommand("corepack", ["--version"], { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8")
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8")
    })

    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", resolve)
    })

    assert.equal(code, 0, stderr)
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/)
  })
})
