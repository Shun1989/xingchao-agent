import JSZip from "jszip"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { validateContentPack } from "../src/domain/xingchao/content-pack.ts"

const archiveDate = new Date("2000-01-01T00:00:00Z")
const knowledgeFiles = [
  "README.md",
  "knowledge.md",
  "cases.json",
  "acceptance.md",
  "growth.md",
  "sources.json",
  "design-input.json",
]

export async function buildActuatorLegionArchive(input: unknown): Promise<Buffer> {
  const manifest = validateContentPack(input)
  if (Object.keys(manifest.checksums).length !== 0) throw new Error("This builder supports manifest-only packs")
  const archive = new JSZip()
  archive.file("manifest.json", JSON.stringify(manifest, null, 2) + "\n", { date: archiveDate })
  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } })
}

async function writeImmutable(destination: string, bytes: Uint8Array): Promise<void> {
  try {
    await writeFile(destination, bytes, { flag: "wx" })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    if (!(await readFile(destination)).equals(Buffer.from(bytes))) {
      throw new Error(
        `Existing release bytes differ; use a new version instead of overwriting ${path.basename(destination)}`,
      )
    }
  }
}

async function main(): Promise<void> {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url))
  const manifest = validateContentPack(
    JSON.parse(await readFile(path.join(repoRoot, "content-packs/actuator-design-legion/manifest.json"), "utf8")),
  )
  const name = `actuator-design-legion-${manifest.version}`
  const packBytes = await buildActuatorLegionArchive(manifest)
  const bundle = new JSZip()
  bundle.file(`${name}.xcp`, packBytes, { date: archiveDate })
  for (const filename of knowledgeFiles) {
    bundle.file(
      `docs/actuator-design-legion/${filename}`,
      await readFile(path.join(repoRoot, "docs/actuator-design-legion", filename)),
      { date: archiveDate, createFolders: false },
    )
  }
  for (const filename of ["LICENSE", "NOTICE"]) {
    bundle.file(filename, await readFile(path.join(repoRoot, filename)), { date: archiveDate })
  }
  const bundleBytes = await bundle.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  })
  const assets = new Map<string, Buffer>([
    [`${name}.xcp`, packBytes],
    [`${name}-knowledge.zip`, bundleBytes],
  ])
  const hashes =
    [...assets]
      .map(([filename, bytes]) => `${createHash("sha256").update(bytes).digest("hex")}  ${filename}`)
      .join("\n") + "\n"
  assets.set("SHA256SUMS.txt", Buffer.from(hashes))
  const directory = path.join(repoRoot, "release/content-packs", manifest.id, manifest.version)
  await mkdir(directory, { recursive: true })
  for (const [filename, bytes] of assets) await writeImmutable(path.join(directory, filename), bytes)
  console.log(
    JSON.stringify({ directory, version: manifest.version, assets: [...assets.keys()], executableCode: false }),
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
