import type { PlanningSkillsSnapshot } from "../electron/agent/manager.ts"
import type { ChildProcess } from "node:child_process"

import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { build } from "vite"

// Separate from Vitest's ordinary include: real installed sidecar, disposable
// skill/config/data/cache roots, and discovery only. No model prompt is sent.
const repository = path.resolve(import.meta.dirname, "..")
const execFileAsync = promisify(execFile)
const originalUserHome = os.homedir()
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "xingchao-planning-skill-smoke-"))
const runtimeRoot = path.join(temporaryRoot, "runtime")
const primary = path.join(runtimeRoot, "workspace", ".opencode", "skills", "planning-primary", "SKILL.md")
const shadow = path.join(runtimeRoot, "workspace", ".opencode", "skills", "planning-shadow", "SKILL.md")
const bodyV1 = "\n# Frontend planning fixture\nRead design version one before planning.\n"
const bodyV2 = "\n# Frontend planning fixture\nRead design version two before planning.\n"
const bodyShadow = "\n# Frontend shadow fixture\nThis is the alternative path with the same skill name.\n"
const executable = path.join(
  repository,
  "node_modules",
  "opencode-ai",
  "bin",
  process.platform === "win32" ? "opencode.exe" : "opencode",
)
const toolRuntime = path.join(repository, "resources", "agent-tool-runtime", "tool.js")
const environment = {
  OPENCODE_TEST_HOME: path.join(temporaryRoot, "home"),
  ...(process.platform === "win32" ? { USERPROFILE: path.join(temporaryRoot, "home") } : {}),
  XDG_CACHE_HOME: path.join(temporaryRoot, "cache"),
  XDG_STATE_HOME: path.join(temporaryRoot, "state"),
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
  OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
  OPENCODE_DISABLE_MODELS_FETCH: "1",
  npm_config_offline: "true",
  npm_config_cache: path.join(temporaryRoot, "npm-cache"),
}
const originalEnvironment = new Map<string, string | undefined>()
let activeAdapter: import("../electron/agent/opencode-adapter.ts").OpencodeAgentAdapter | undefined
let activeSidecarProcess: ChildProcess | undefined

async function stop(): Promise<void> {
  try {
    await activeAdapter?.stop()
  } finally {
    // The production Windows tree reaper uses taskkill, which can be denied in
    // a restricted smoke environment. Retain this test-owned ChildProcess only
    // to guarantee that its own sidecar exits before removing its workspace.
    const child = activeSidecarProcess
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Smoke sidecar cleanup timed out")), 5_000)
        child.once("exit", () => {
          clearTimeout(timer)
          resolve()
        })
        if (!child.kill()) {
          clearTimeout(timer)
          reject(new Error("Smoke sidecar cleanup failed"))
        }
      })
    }
    activeAdapter = undefined
    activeSidecarProcess = undefined
  }
}

function source(version: string, body: string): string {
  return `---\nname: frontend\ndescription: Isolated frontend planning runtime smoke ${version}\nversion: ${version}\n---\n${body}`
}

function frontend(snapshot: PlanningSkillsSnapshot) {
  assert.equal(snapshot.toolAvailable, true, "The real OpenCode registry must include the skill tool")
  const matches = snapshot.skills.filter((skill) => skill.name === "frontend")
  assert.equal(matches.length, 1, "OpenCode must return exactly one loaded frontend skill")
  assert.equal(
    snapshot.skills.filter((skill) => skill.location !== "<built-in>").length,
    1,
    "The smoke must not read user or external skills",
  )
  return matches[0]!
}

try {
  await Promise.all([access(executable), access(toolRuntime)])
  for (const [name, value] of Object.entries(environment)) {
    originalEnvironment.set(name, process.env[name])
    process.env[name] = value
  }
  originalEnvironment.set("OPENCODE_CONFIG", process.env["OPENCODE_CONFIG"])
  delete process.env["OPENCODE_CONFIG"]
  await Promise.all([
    mkdir(path.dirname(primary), { recursive: true }),
    mkdir(environment.OPENCODE_TEST_HOME, { recursive: true }),
  ])
  await writeFile(primary, source("1.0.0", bodyV1), { flag: "wx" })

  const manifest = JSON.parse(await readFile(path.join(repository, "package.json"), "utf8")) as {
    devDependencies: { "opencode-ai": string }
  }
  const { stdout: versionOutput } = await execFileAsync(executable, ["--version"], { windowsHide: true })
  const opencodeVersion = versionOutput.trim()
  assert.equal(
    opencodeVersion,
    manifest.devDependencies["opencode-ai"],
    "The installed sidecar must match the pinned SDK/runtime pair",
  )
  // OpenCode 1.18.10 checks node_modules plus the root lockfile dependency names
  // before starting a background install for every config directory. Seed that
  // layout with the installed paired plugin, so discovery needs no npm fetch.
  const pluginManifest = JSON.parse(
    await readFile(path.join(repository, "node_modules/@opencode-ai/plugin/package.json"), "utf8"),
  ) as {
    version: string
  }
  assert.equal(pluginManifest.version, manifest.devDependencies["opencode-ai"])
  for (const directory of [
    path.join(runtimeRoot, "workspace", ".opencode"),
    path.join(runtimeRoot, "isolation", "opencode-config"),
    path.join(runtimeRoot, "isolation", "xdg-config", "opencode"),
  ]) {
    const dependencies = { "@opencode-ai/plugin": pluginManifest.version }
    await mkdir(path.join(directory, "node_modules", "@opencode-ai"), { recursive: true })
    await cp(
      path.join(repository, "node_modules/@opencode-ai/plugin"),
      path.join(directory, "node_modules", "@opencode-ai", "plugin"),
      { recursive: true, dereference: true },
    )
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ private: true, dependencies }))
    await writeFile(
      path.join(directory, "package-lock.json"),
      JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies } } }),
    )
  }
  const bundleDirectory = path.join(temporaryRoot, "bundle")
  const virtualEntry = "planning-skill-smoke-kernel"
  const virtualId = `\0${virtualEntry}`
  await build({
    configFile: false,
    logLevel: "error",
    define: {
      __OO_ENDPOINT__: JSON.stringify("example.invalid"),
      __PACKAGE_ASSETS_BASE_URL__: JSON.stringify("https://assets.example.invalid"),
      __OPENCODE_VERSION__: JSON.stringify(manifest.devDependencies["opencode-ai"]),
    },
    plugins: [
      {
        name: "planning-skill-smoke-kernel",
        resolveId: (id) => (id === virtualEntry ? virtualId : undefined),
        load: (id) =>
          id === virtualId
            ? `export { AgentManager } from ${JSON.stringify(path.join(repository, "electron/agent/manager.ts"))}; export { OpencodeAgentAdapter } from ${JSON.stringify(path.join(repository, "electron/agent/opencode-adapter.ts"))};`
            : undefined,
      },
    ],
    ssr: { noExternal: true },
    build: {
      outDir: bundleDirectory,
      target: "node22",
      ssr: true,
      rollupOptions: { input: virtualEntry, output: { entryFileNames: "kernel.mjs", format: "es" } },
    },
  })
  const kernel = (await import(pathToFileURL(path.join(bundleDirectory, "kernel.mjs")).href)) as {
    AgentManager: typeof import("../electron/agent/manager.ts").AgentManager
    OpencodeAgentAdapter: typeof import("../electron/agent/opencode-adapter.ts").OpencodeAgentAdapter
  }
  const start = async () => {
    const manager = new kernel.AgentManager({
      linkRuntime: null,
      modelAccess: { kind: "local" },
      opencodeBinPath: executable,
      bundledToolRuntimePath: toolRuntime,
      rootDir: runtimeRoot,
      customModels: [
        {
          id: "smoke-model",
          providerId: "openai-compatible",
          providerName: "Smoke",
          baseUrl: "http://127.0.0.1:9/v1",
          apiKey: "smoke-test-key",
          modelName: "smoke",
          displayName: "Smoke",
          apiKeyConfigured: true,
          supportsImages: false,
          supportsToolCalls: true,
        },
      ],
      defaultModel: { kind: "custom", id: "smoke-model" },
    })
    activeAdapter = new kernel.OpencodeAgentAdapter(manager)
    const revisionBeforeStart = activeAdapter.runtimeRevision
    await activeAdapter.start()
    activeSidecarProcess = (manager as unknown as { sidecar: { proc: ChildProcess } }).sidecar.proc
    assert.equal(activeAdapter.isReady(), true)
    assert.ok(activeAdapter.runtimeRevision > revisionBeforeStart)
    assert.match(activeAdapter.url, /^http:\/\/127\.0\.0\.1:/)
    return activeAdapter
  }
  const first = await start()
  console.log("[planning-skill-smoke] real sidecar ready; checking loaded skill and tool registry")
  const initial = frontend(await first.getPlanningSkills())
  console.log(`[planning-skill-smoke] initial content: ${JSON.stringify(initial.content)}`)
  assert.equal(path.normalize(initial.location), primary)
  assert.equal(initial.content, bodyV1, "OpenCode discovery must return the body without YAML frontmatter")

  await writeFile(primary, source("2.0.0", bodyV2))
  const afterChange = frontend(await first.getPlanningSkills())
  assert.deepEqual(afterChange, initial, "Skill discovery is cached for the running OpenCode instance")
  await mkdir(path.dirname(shadow), { recursive: true })
  await writeFile(shadow, source("3.0.0", bodyShadow), { flag: "wx" })
  const addedShadow = frontend(await first.getPlanningSkills())
  assert.deepEqual(
    addedShadow,
    initial,
    "Adding a same-name source does not replace the running instance's cached skill",
  )
  const firstRevision = first.runtimeRevision
  await stop()
  assert.ok(first.runtimeRevision > firstRevision)
  assert.equal(first.isReady(), false)

  const second = await start()
  const duplicate = frontend(await second.getPlanningSkills())
  assert.ok(
    duplicate.location === primary || duplicate.location === shadow,
    "Duplicate discovery must resolve to a fixture path",
  )
  assert.equal(duplicate.content, duplicate.location === primary ? bodyV2 : bodyShadow)
  await stop()
  await rm(path.dirname(primary), { recursive: true, force: true })

  const third = await start()
  const differentPath = frontend(await third.getPlanningSkills())
  assert.equal(path.normalize(differentPath.location), shadow)
  assert.equal(differentPath.content, bodyShadow)
  await stop()
  await rm(path.dirname(shadow), { recursive: true, force: true })
  await mkdir(path.dirname(primary), { recursive: true })
  await writeFile(primary, source("2.0.0", bodyV2), { flag: "wx" })

  const fourth = await start()
  const refreshed = frontend(await fourth.getPlanningSkills())
  assert.equal(path.normalize(refreshed.location), primary)
  assert.equal(refreshed.content, bodyV2)
  await stop()
  const runtimeLog = await readFile(
    path.join(runtimeRoot, "isolation", "xdg-data", "opencode", "log", "opencode.log"),
    "utf8",
  )
  assert.doesNotMatch(runtimeLog, /background dependency install failed/)
  assert.equal(runtimeLog.includes(JSON.stringify(path.join(originalUserHome, ".opencode")).slice(1, -1)), false)
  console.log(
    JSON.stringify(
      {
        result: "passed",
        opencodeVersion,
        skillToolRegistered: true,
        initial: { location: path.relative(temporaryRoot, initial.location), content: initial.content },
        samePathAfterChange: {
          location: path.relative(temporaryRoot, afterChange.location),
          content: afterChange.content,
        },
        sameNameAddedWithoutRestart: {
          location: path.relative(temporaryRoot, addedShadow.location),
          content: addedShadow.content,
        },
        sameNameAfterRestart: {
          location: path.relative(temporaryRoot, duplicate.location),
          content: duplicate.content,
        },
        sameNameDifferentPathAfterRestart: {
          location: path.relative(temporaryRoot, differentPath.location),
          content: differentPath.content,
        },
        changedAfterRestart: { location: path.relative(temporaryRoot, refreshed.location), content: refreshed.content },
        modelPromptSent: false,
        scope:
          "four isolated real sidecar starts; offline npm; no login, user profile, global config API, or CAD invocation",
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error("[planning-skill-smoke] failed:", error)
  throw error
} finally {
  await stop()
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}
