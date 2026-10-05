import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"
import config from "../electron-builder.ts"
import { buildActuatorLegionArchive } from "./build-actuator-legion-pack.ts"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const root = await mkdtemp(path.join(os.tmpdir(), "xingchao-actuator-electron-"))
try {
  const mapping = config.extraResources.find((resource) => resource.to === "knowledge/actuator-design-legion/1.0.0")!
  const knowledge = path.join(root, mapping.to)
  await mkdir(knowledge, { recursive: true })
  for (const filename of mapping.filter!)
    await cp(path.join(repo, mapping.from, filename), path.join(knowledge, filename))
  await writeFile(
    path.join(root, "pack.xcp"),
    await buildActuatorLegionArchive(
      JSON.parse(await readFile(path.join(repo, "content-packs/actuator-design-legion/manifest.json"), "utf8")),
    ),
  )
  const appVersion = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8")).version as string
  await build({
    configFile: false,
    logLevel: "error",
    ssr: { noExternal: true },
    build: {
      outDir: path.join(root, "bundle"),
      target: "node22",
      ssr: path.join(repo, "scripts/actuator-knowledge-electron.ts"),
      rollupOptions: { external: ["electron"], output: { entryFileNames: "main.mjs", format: "es" } },
    },
  })
  for (const phase of ["seed", "retry"]) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      XINGCHAO_KNOWLEDGE_SMOKE_ROOT: root,
      XINGCHAO_KNOWLEDGE_SMOKE_PHASE: phase,
      XINGCHAO_KNOWLEDGE_SMOKE_VERSION: appVersion,
    }
    delete env["ELECTRON_RUN_AS_NODE"]
    await new Promise<void>((resolve, reject) => {
      const executable = path.join(
        repo,
        ".electron-dist",
        process.platform === "win32"
          ? "electron.exe"
          : process.platform === "darwin"
            ? "Electron.app/Contents/MacOS/Electron"
            : "electron",
      )
      const args = [...(process.platform === "win32" ? ["--no-sandbox"] : []), path.join(root, "bundle/main.mjs")]
      const child = spawn(executable, args, { cwd: repo, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
      let output = ""
      child.stdout.on("data", (data) => {
        output += String(data)
      })
      child.stderr.on("data", (data) => {
        output += String(data)
      })
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error(`Knowledge smoke timed out: ${phase}`))
      }, 30_000)
      child.once("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once("exit", (code) => {
        clearTimeout(timeout)
        if (code === 0) resolve()
        else reject(new Error(`Knowledge smoke failed: ${phase}: ${output}`))
      })
    })
  }
  const result = JSON.parse(await readFile(path.join(root, "result.json"), "utf8"))
  assert.equal(result.appVersion, appVersion)
  assert.equal(result.crews, 11)
  assert.equal(result.sourceIds, 14)
  assert.equal(result.documents, 5)
  assert.equal(result.attempts, 2)
  assert.equal(result.sameKnowledge, true)
  assert.equal(result.cadExecuted, false)
  console.log(JSON.stringify({ ...result, evidence: "two isolated Electron launches; no provider or CAD invoked" }))
} finally {
  await rm(root, { recursive: true, force: true })
}
