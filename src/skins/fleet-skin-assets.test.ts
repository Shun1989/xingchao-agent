import type { FleetSkinAssetId, FleetSkinAssetRole } from "./fleet-skin-schema.ts"

import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { BUILTIN_CREW_IDS } from "../domain/xingchao/types.ts"
import { fleetSkinAssetRegistry, fleetSkinAssetUrl } from "./fleet-skin-assets.ts"
import { FLEET_SKIN_ASSET_IDS, FLEET_SKIN_ASSET_ROLES } from "./fleet-skin-schema.ts"

const roleFiles = {
  "scene.backdrop": "scene-backdrop.webp",
  "scene.midground": "scene-midground.webp",
  "scene.light": "scene-light.webp",
  "scene.foreground": "scene-foreground.webp",
  "captain.base": "captain-base.webp",
  "captain.uniform": "captain-uniform.webp",
  "captain.static": "captain-static.webp",
  crest: "crest.svg",
} as const satisfies Record<FleetSkinAssetRole, string>

const expectedRasterDimensions = {
  "scene.backdrop": { width: 1920, height: 1080, alpha: false },
  "scene.midground": { width: 1920, height: 1080, alpha: false },
  "scene.light": { width: 1920, height: 1080, alpha: true },
  "scene.foreground": { width: 1920, height: 1080, alpha: true },
  "captain.base": { width: 1600, height: 2200, alpha: true },
  "captain.uniform": { width: 1600, height: 2200, alpha: true },
  "captain.static": { width: 1200, height: 1600, alpha: false },
} as const

interface SourceInventory {
  readonly directories: readonly string[]
  readonly files: readonly string[]
}

const expectedSourceInventory: SourceInventory = {
  directories: [...BUILTIN_CREW_IDS].sort(),
  files: [
    "PROVENANCE.md",
    ...BUILTIN_CREW_IDS.flatMap((crewId) => FLEET_SKIN_ASSET_ROLES.map((role) => `${crewId}/${roleFiles[role]}`)),
  ].sort(),
}

async function enumerateSourceInventory(root: URL): Promise<SourceInventory> {
  const directories: string[] = []
  const files: string[] = []

  async function visit(directory: URL, prefix = ""): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = `${prefix}${entry.name}`
      if (entry.isDirectory()) {
        directories.push(relativePath)
        await visit(new URL(`${entry.name}/`, directory), `${relativePath}/`)
      } else if (entry.isFile()) {
        files.push(relativePath)
      } else {
        throw new Error(`skin source tree contains a non-file entry: ${relativePath}`)
      }
    }
  }

  await visit(root)
  return { directories: directories.sort(), files: files.sort() }
}

function assertExactSourceInventory(inventory: SourceInventory): void {
  const hiddenEntry = [...inventory.directories, ...inventory.files].find((entry) =>
    entry.split("/").some((segment) => segment.startsWith(".")),
  )
  if (hiddenEntry) throw new Error(`skin source tree contains a hidden entry: ${hiddenEntry}`)

  const actualDirectories = [...inventory.directories].sort()
  const actualFiles = [...inventory.files].sort()
  if (new Set(actualDirectories).size !== actualDirectories.length) {
    throw new Error("skin source tree contains duplicate directory entries")
  }
  if (new Set(actualFiles).size !== actualFiles.length) {
    throw new Error("skin source tree contains duplicate file entries")
  }
  if (JSON.stringify(actualDirectories) !== JSON.stringify(expectedSourceInventory.directories)) {
    throw new Error(`skin source directories differ from the exact allowlist: ${actualDirectories.join(", ")}`)
  }
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedSourceInventory.files)) {
    throw new Error(`skin source files differ from the exact allowlist: ${actualFiles.join(", ")}`)
  }
}

const allowedSvgAttributes = {
  svg: new Set(["xmlns", "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]),
  g: new Set(["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]),
  path: new Set(["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]),
  circle: new Set(["cx", "cy", "r", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]),
} as const

type AllowedSvgTag = keyof typeof allowedSvgAttributes

function validateCrestSvg(svg: string): void {
  if (!svg.startsWith("<svg")) throw new Error("crest must start with an svg root")
  if (/[&]|<\?|<!/u.test(svg)) throw new Error("crest must not contain entities or declarations")

  const tokens = svg.match(/<[^>]+>/gu)
  if (!tokens || svg.replace(/<[^>]+>/gu, "").trim()) {
    throw new Error("crest must contain elements only, without text nodes")
  }

  const stack: AllowedSvgTag[] = []
  let rootCount = 0
  let hasCurrentColor = false

  for (const token of tokens) {
    const closing = /^<\/([A-Za-z][A-Za-z0-9]*)\s*>$/u.exec(token)
    if (closing) {
      const tag = closing[1] as AllowedSvgTag
      if (stack.pop() !== tag) throw new Error(`crest has an unbalanced closing tag: ${token}`)
      continue
    }

    const opening = /^<([A-Za-z][A-Za-z0-9]*)([\s\S]*)>$/u.exec(token)
    if (!opening) throw new Error(`crest contains malformed markup: ${token}`)
    const tag = opening[1] as AllowedSvgTag
    if (!(tag in allowedSvgAttributes)) throw new Error(`crest contains a disallowed element: ${tag}`)
    if (tag === "svg") {
      rootCount += 1
      if (rootCount !== 1 || stack.length !== 0) throw new Error("crest must contain exactly one root svg")
    } else if (stack.length === 0) {
      throw new Error(`crest element is outside the svg root: ${tag}`)
    }

    const attributes = new Map<string, string>()
    const selfClosing = /\/\s*>$/u.test(token)
    let remaining = selfClosing ? opening[2]!.replace(/\/\s*$/u, "") : opening[2]!
    while (remaining.trim().length > 0) {
      const attribute = /^\s+([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(["'])(.*?)\2/su.exec(remaining)
      if (!attribute) throw new Error(`crest contains malformed attributes: ${token}`)
      const [, name, , value] = attribute
      if (!allowedSvgAttributes[tag].has(name as never)) {
        throw new Error(`crest ${tag} contains a disallowed attribute: ${name}`)
      }
      if (attributes.has(name!)) throw new Error(`crest ${tag} repeats attribute: ${name}`)
      if (name !== "xmlns" && /(?:https?:|data:|javascript:|url\s*\()/iu.test(value!)) {
        throw new Error(`crest ${tag} contains an external or executable value: ${name}`)
      }
      attributes.set(name!, value!)
      remaining = remaining.slice(attribute[0].length)
    }

    for (const [name, value] of attributes) {
      if (name === "xmlns" && value !== "http://www.w3.org/2000/svg") {
        throw new Error("crest xmlns must use the SVG namespace")
      }
      if (name === "viewBox" && value !== "0 0 128 128") {
        throw new Error("crest viewBox must be 0 0 128 128")
      }
      if ((name === "fill" || name === "stroke") && value !== "none" && value !== "currentColor") {
        throw new Error(`crest ${name} must be none or currentColor`)
      }
      if (value === "currentColor") hasCurrentColor = true
      if (["cx", "cy", "r", "stroke-width"].includes(name) && !/^\d+(?:\.\d+)?$/u.test(value)) {
        throw new Error(`crest ${name} must be a non-negative number`)
      }
      if ((name === "stroke-linecap" || name === "stroke-linejoin") && value !== "round") {
        throw new Error(`crest ${name} must be round`)
      }
      if (name === "d" && !/^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/u.test(value)) {
        throw new Error("crest path data contains unsupported syntax")
      }
    }

    if (tag === "svg") {
      if (attributes.get("xmlns") !== "http://www.w3.org/2000/svg") {
        throw new Error("crest svg must declare the SVG namespace")
      }
      if (attributes.get("viewBox") !== "0 0 128 128") {
        throw new Error("crest svg must declare viewBox 0 0 128 128")
      }
    }
    if (tag === "path" && !attributes.has("d")) throw new Error("crest path must include d")
    if (tag === "circle" && !["cx", "cy", "r"].every((name) => attributes.has(name))) {
      throw new Error("crest circle must include cx, cy, and r")
    }

    if ((tag === "path" || tag === "circle") && !selfClosing) {
      throw new Error(`crest ${tag} must be self-closing`)
    }
    if (!selfClosing) stack.push(tag)
  }

  if (stack.length > 0) throw new Error("crest contains unclosed elements")
  if (rootCount !== 1) throw new Error("crest must contain exactly one svg root")
  if (!hasCurrentColor) throw new Error("crest must use currentColor")
}

function sourceFile(crewId: string, role: FleetSkinAssetRole): URL {
  return new URL(`../../resources/xingchao/skins/${crewId}/${roleFiles[role]}`, import.meta.url)
}

function readUint24LE(bytes: Buffer, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

function inspectWebP(bytes: Buffer): { width: number; height: number; alpha: boolean } {
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF")
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP")

  let offset = 12
  let alphaChunk = false
  let result: { width: number; height: number; alpha: boolean } | undefined

  while (offset + 8 <= bytes.length) {
    const fourCC = bytes.subarray(offset, offset + 4).toString("ascii")
    const chunkSize = bytes.readUInt32LE(offset + 4)
    const dataOffset = offset + 8

    if (fourCC === "ALPH") alphaChunk = true
    if (fourCC === "VP8X" && chunkSize >= 10) {
      result = {
        width: readUint24LE(bytes, dataOffset + 4) + 1,
        height: readUint24LE(bytes, dataOffset + 7) + 1,
        alpha: (bytes[dataOffset]! & 0x10) !== 0,
      }
    }
    if (fourCC === "VP8L" && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
      const bits = bytes.readUInt32LE(dataOffset + 1)
      result = {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
        alpha: ((bits >>> 28) & 1) === 1,
      }
    }
    if (fourCC === "VP8 " && chunkSize >= 10) {
      result ??= {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
        alpha: alphaChunk,
      }
    }

    offset = dataOffset + chunkSize + (chunkSize % 2)
  }

  expect(result, "WebP must contain a supported VP8 chunk").toBeDefined()
  return { ...result!, alpha: result!.alpha || alphaChunk }
}

describe("fleet skin asset registry", () => {
  it("is total, static, and contains only safe local URLs", () => {
    expect(Object.keys(fleetSkinAssetRegistry).sort()).toEqual([...FLEET_SKIN_ASSET_IDS].sort())

    for (const assetId of FLEET_SKIN_ASSET_IDS) {
      const url = fleetSkinAssetUrl(assetId)
      expect(url).toBe(fleetSkinAssetRegistry[assetId])
      expect(url).not.toMatch(/(?:https?:|data:|\.\.)/i)
      expect(url.length).toBeGreaterThan(0)
    }
  })

  it("contains the exact 80-file source inventory with valid binaries", async () => {
    const inventory: string[] = []
    const uniqueBackdrops = new Set<string>()
    const uniqueCaptainBases = new Set<string>()

    for (const crewId of BUILTIN_CREW_IDS) {
      for (const role of FLEET_SKIN_ASSET_ROLES) {
        const assetId = `${crewId}.${role}` as FleetSkinAssetId
        const file = sourceFile(crewId, role)
        const bytes = await readFile(file)
        inventory.push(fileURLToPath(file))
        expect(bytes.byteLength, assetId).toBeGreaterThan(0)

        if (role === "crest") {
          validateCrestSvg(bytes.toString("utf8"))
        } else {
          const inspection = inspectWebP(bytes)
          const expected = expectedRasterDimensions[role]
          expect(inspection.width, assetId).toBe(expected.width)
          expect(inspection.height, assetId).toBe(expected.height)
          expect(Math.max(inspection.width, inspection.height), assetId).toBeLessThanOrEqual(4096)
          if (expected.alpha) expect(inspection.alpha, assetId).toBe(true)
        }

        const digest = createHash("sha256").update(bytes).digest("hex")
        if (role === "scene.backdrop") uniqueBackdrops.add(digest)
        if (role === "captain.base") uniqueCaptainBases.add(digest)
      }
    }

    expect(inventory).toHaveLength(80)
    expect(new Set(inventory).size).toBe(80)
    expect(uniqueBackdrops.size).toBe(10)
    expect(uniqueCaptainBases.size).toBe(10)
  })

  it("accepts ten distinct 1920x1080 midgrounds and ten transparent light layers", async () => {
    const uniqueMidgrounds = new Set<string>()
    const uniqueLights = new Set<string>()

    for (const crewId of BUILTIN_CREW_IDS) {
      for (const fileName of ["scene-midground.webp", "scene-light.webp"] as const) {
        const assetId = `${crewId}/${fileName}`
        const file = new URL(`../../resources/xingchao/skins/${assetId}`, import.meta.url)
        const bytes = await readFile(file)
        expect(bytes.byteLength, assetId).toBeGreaterThan(0)

        const inspection = inspectWebP(bytes)
        expect(inspection.width, assetId).toBe(1920)
        expect(inspection.height, assetId).toBe(1080)
        expect(Math.max(inspection.width, inspection.height), assetId).toBeLessThanOrEqual(4096)

        const digest = createHash("sha256").update(bytes).digest("hex")
        if (fileName === "scene-light.webp") {
          expect(inspection.alpha, assetId).toBe(true)
          uniqueLights.add(digest)
        } else {
          uniqueMidgrounds.add(digest)
        }
      }
    }

    expect(uniqueMidgrounds.size).toBe(10)
    expect(uniqueLights.size).toBe(10)
  })

  it("rejects extra, hidden, and inspection source entries", () => {
    expect(() =>
      assertExactSourceInventory({
        directories: [...expectedSourceInventory.directories, ".inspection"],
        files: [...expectedSourceInventory.files, ".inspection/placeholder.webp"],
      }),
    ).toThrow()

    expect(() =>
      assertExactSourceInventory({
        directories: expectedSourceInventory.directories,
        files: [...expectedSourceInventory.files, ".DS_Store"],
      }),
    ).toThrow()
  })

  it("positively restricts crest SVG elements, attributes, and color references", () => {
    const valid = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" stroke="currentColor"><g><path d="M16 64h96" /><circle cx="64" cy="64" r="8" /></g></svg>`
    expect(() => validateCrestSvg(valid)).not.toThrow()

    const invalid = [
      valid.replace("<g>", '<g style="filter:url(data:image/svg+xml,bad)">'),
      valid.replace("<path", '<path onclick="alert(1)"'),
      valid.replace('<path d="M16 64h96" />', '<use href="https://example.invalid/crest.svg#x" />'),
      valid.replace('<path d="M16 64h96" />', '<path d="M16 64h96" href="crest.svg#x" />'),
      valid.replace('stroke="currentColor"', 'stroke="url(data:image/svg+xml,bad)"'),
      valid.replace("<circle", "<foreignObject><circle"),
      valid.replace("currentColor", "#ffffff"),
      `<?xml version="1.0"?>${valid}`,
    ]

    for (const svg of invalid) expect(() => validateCrestSvg(svg)).toThrow()
  })

  it("enumerates the actual skin directory and requires the exact source tree", async () => {
    const root = new URL("../../resources/xingchao/skins/", import.meta.url)
    const inventory = await enumerateSourceInventory(root)
    assertExactSourceInventory(inventory)
  })
})
