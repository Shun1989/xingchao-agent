import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const temporaryDirectories: string[] = []
const script = resolve("scripts/convert-fleet-scene.ps1")

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xingchao-scene-"))
  temporaryDirectories.push(directory)
  return directory
}

function createPng(path: string, color: string): void {
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=${color}:size=1672x941`,
    "-frames:v",
    "1",
    "-y",
    path,
  ])
}

function createTransparentPng(path: string): void {
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=black@0.0:size=1672x941,format=rgba",
    "-frames:v",
    "1",
    "-y",
    path,
  ])
}

function convert(input: string, output: string, role: "midground" | "light") {
  return JSON.parse(
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-InputPath",
        input,
        "-OutputPath",
        output,
        "-Role",
        role,
      ],
      { encoding: "utf8" },
    ),
  ) as Record<string, unknown>
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe("convert-fleet-scene.ps1", () => {
  it("converts a generated candidate to deterministic 1920x1080 WebP metadata", () => {
    const directory = temporaryDirectory()
    const input = join(directory, "candidate.png")
    const output = join(directory, "scene-midground.webp")
    createPng(input, "#123456")

    const first = convert(input, output, "midground")
    const firstBytes = readFileSync(output)
    const second = convert(input, output, "midground")

    expect(first).toMatchObject({ role: "midground", inputWidth: 1672, inputHeight: 941, width: 1920, height: 1080 })
    expect(first.sha256).toBe(second.sha256)
    expect(readFileSync(output)).toEqual(firstBytes)
    expect(firstBytes.subarray(0, 4).toString("ascii")).toBe("RIFF")
    expect(firstBytes.subarray(8, 12).toString("ascii")).toBe("WEBP")
  })

  it("rejects a non-WebP destination before creating output", () => {
    const directory = temporaryDirectory()
    const input = join(directory, "candidate.png")
    createPng(input, "#654321")

    expect(() => convert(input, join(directory, "scene-midground.png"), "midground")).toThrow(/\.webp/)
  })

  it("preserves an alpha channel for lossless light layers", () => {
    const directory = temporaryDirectory()
    const input = join(directory, "transparent-candidate.png")
    const output = join(directory, "scene-light.webp")
    createTransparentPng(input)

    const audit = convert(input, output, "light")

    expect(audit).toMatchObject({ role: "light", width: 1920, height: 1080 })
    expect(audit.pixelFormat).toMatch(/a/)
    expect(readFileSync(output).subarray(8, 12).toString("ascii")).toBe("WEBP")
  })
})
