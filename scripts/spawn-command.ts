import type { ChildProcess, SpawnOptions } from "node:child_process"

import { spawn } from "node:child_process"

interface SpawnCommandSpec {
  args: string[]
  command: string
}

export function resolveSpawnCommand(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  comSpec = process.env["ComSpec"] ?? "cmd.exe",
): SpawnCommandSpec {
  if (platform === "win32") {
    return { command: comSpec, args: ["/d", "/s", "/c", command, ...args] }
  }
  return { command, args: [...args] }
}

export function spawnCommand(command: string, args: readonly string[], options: SpawnOptions): ChildProcess {
  const resolved = resolveSpawnCommand(command, args)
  return spawn(resolved.command, resolved.args, options)
}
