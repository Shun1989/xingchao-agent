import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const electronExecutable = path.join(
  repositoryRoot,
  ".electron-dist",
  process.platform === "win32"
    ? "electron.exe"
    : process.platform === "darwin"
      ? "Electron.app/Contents/MacOS/Electron"
      : "electron",
)

async function launch(bundle: string, userDataDirectory: string, phase: "seed" | "recover"): Promise<void> {
  const environment = { ...process.env }
  delete environment["ELECTRON_RUN_AS_NODE"]
  environment["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true"
  environment["WANTA_CREDENTIAL_SMOKE_PHASE"] = phase
  environment["WANTA_CREDENTIAL_SMOKE_USER_DATA"] = userDataDirectory
  const args = process.platform === "win32" ? ["--no-sandbox", bundle] : [bundle]

  await new Promise<void>((resolve, reject) => {
    const child = spawn(electronExecutable, args, {
      cwd: repositoryRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk)
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Electron credential smoke timed out during ${phase}: stdout=${stdout}; stderr=${stderr}`))
    }, 30_000)
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else
        reject(new Error(`Electron credential smoke ${phase} failed (${signal ?? `exit ${String(code)}`}): ${stderr}`))
    })
  })
}

async function main(): Promise<void> {
  await access(electronExecutable)
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "xingchao-model-credential-smoke-"))
  const bundleDirectory = path.join(temporaryRoot, "bundle")
  const userDataDirectory = path.join(temporaryRoot, "user-data")
  const bundle = path.join(bundleDirectory, "credential-smoke.mjs")
  try {
    await build({
      configFile: false,
      define: {
        __OO_ENDPOINT__: JSON.stringify("example.invalid"),
        __PACKAGE_ASSETS_BASE_URL__: JSON.stringify("https://assets.example.invalid"),
      },
      logLevel: "error",
      ssr: { noExternal: true },
      build: {
        emptyOutDir: true,
        outDir: bundleDirectory,
        rollupOptions: {
          external: ["electron"],
          output: { entryFileNames: "credential-smoke.mjs", format: "es" },
        },
        ssr: path.join(repositoryRoot, "scripts", "model-credential-recovery-electron.ts"),
        target: "node22",
      },
    })
    await launch(bundle, userDataDirectory, "seed")
    await launch(bundle, userDataDirectory, "recover")

    const result = JSON.parse(
      await readFile(path.join(userDataDirectory, "credential-smoke-result.json"), "utf8"),
    ) as Record<string, string>
    assert.deepEqual(result, { before: "unavailable", afterReplace: "configured", afterDelete: "missing" })
    console.log("[credential-smoke] isolated Electron restart: unavailable -> configured -> missing")
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
}

await main()
