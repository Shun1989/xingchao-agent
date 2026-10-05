import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import path from "node:path"

export interface ActuatorKnowledgeBundle {
  id: string
  version: string
  digest: string
  sourceIds: string[]
  documents: Array<{ name: string; sha256: string; text: string }>
}

const MAX_DOCUMENT_BYTES = 16 * 1024
const MAX_BUNDLE_BYTES = 64 * 1024

// This main-process allowlist is the trust anchor. The public runtime index is not read.
const DOCUMENT_BINDINGS = [
  {
    name: "knowledge.md",
    sha256: "c6e046fc64b7fd95c60e871c805f3197e87c24b2654b287d63685c9b51d50f2e",
    bytes: 5124,
  },
  {
    name: "cases.json",
    sha256: "a34b82a9780a87cc2d5ab7c64fce08e9c16d2ad3f35ae7149296d9ff4504054d",
    bytes: 7120,
  },
  {
    name: "acceptance.md",
    sha256: "a4bdcdee96d875f62d24ff076b8aba9b3d4f8c04c74aae15fa9f2165909aa040",
    bytes: 7182,
  },
  {
    name: "sources.json",
    sha256: "445832edcafd9bd2d6f0bf25de99019dcaf10e9ea94eba26b6d099938fe4b84e",
    bytes: 4681,
  },
  {
    name: "design-input.json",
    sha256: "305495aa4f24a242720db69ce7b62450212720d117d659dde1263bf5aaa2fc2c",
    bytes: 5188,
  },
] as const

class KnowledgeValidationError extends Error {}

async function assertUnlinkedDirectory(directory: string): Promise<void> {
  let current = path.parse(directory).root
  const segments = path.relative(current, directory).split(path.sep).filter(Boolean)
  for (const segment of ["", ...segments]) {
    current = path.join(current, segment)
    const info = await lstat(current)
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new KnowledgeValidationError("Actuator knowledge path rejected")
    }
  }
  if (path.relative(directory, await realpath(directory)) !== "") {
    throw new KnowledgeValidationError("Actuator knowledge path rejected")
  }
}

async function verifiedFileInfo(directory: string, name: string) {
  const filename = path.join(directory, name)
  const info = await lstat(filename)
  if (info.isSymbolicLink() || !info.isFile() || path.relative(directory, await realpath(filename)) !== name) {
    throw new KnowledgeValidationError("Actuator knowledge path rejected")
  }
  return info
}

async function readVerifiedDocument(
  directory: string,
  binding: (typeof DOCUMENT_BINDINGS)[number],
  remainingBytes: number,
): Promise<Buffer> {
  const info = await verifiedFileInfo(directory, binding.name)
  const limit = Math.min(MAX_DOCUMENT_BYTES, remainingBytes)
  if (info.size > limit) throw new KnowledgeValidationError("Actuator knowledge size limit exceeded")
  if (info.size !== binding.bytes) throw new KnowledgeValidationError("Actuator knowledge integrity check failed")

  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  const handle = await open(path.join(directory, binding.name), constants.O_RDONLY | noFollow)
  try {
    const openedInfo = await handle.stat()
    if (!openedInfo.isFile() || openedInfo.dev !== info.dev || openedInfo.ino !== info.ino) {
      throw new KnowledgeValidationError("Actuator knowledge path rejected")
    }
    if (openedInfo.size > limit) throw new KnowledgeValidationError("Actuator knowledge size limit exceeded")

    // The extra byte detects growth without ever allocating or reading an unbounded file.
    const buffer = Buffer.alloc(limit + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    if (length > limit) throw new KnowledgeValidationError("Actuator knowledge size limit exceeded")
    const currentInfo = await verifiedFileInfo(directory, binding.name)
    if (currentInfo.dev !== openedInfo.dev || currentInfo.ino !== openedInfo.ino) {
      throw new KnowledgeValidationError("Actuator knowledge path rejected")
    }
    const raw = buffer.subarray(0, length)
    if (length !== binding.bytes || createHash("sha256").update(raw).digest("hex") !== binding.sha256) {
      throw new KnowledgeValidationError("Actuator knowledge integrity check failed")
    }
    return raw
  } finally {
    await handle.close()
  }
}

function readSourceIds(text: string): string[] {
  const catalog: unknown = JSON.parse(text)
  if (!catalog || typeof catalog !== "object" || !("sources" in catalog) || !Array.isArray(catalog.sources)) {
    throw new KnowledgeValidationError("Actuator knowledge integrity check failed")
  }
  const sourceIds = catalog.sources.map((source: unknown) => {
    if (
      !source ||
      typeof source !== "object" ||
      !("sourceId" in source) ||
      typeof source.sourceId !== "string" ||
      !/^SRC-[A-Z0-9-]+$/.test(source.sourceId)
    ) {
      throw new KnowledgeValidationError("Actuator knowledge integrity check failed")
    }
    return source.sourceId
  })
  if (sourceIds.length !== 14 || new Set(sourceIds).size !== sourceIds.length) {
    throw new KnowledgeValidationError("Actuator knowledge integrity check failed")
  }
  return sourceIds
}

// The caller supplies the host-selected app-owned directory, never a renderer or pack path.
export async function loadActuatorLegionKnowledge(directory: string): Promise<ActuatorKnowledgeBundle> {
  try {
    const root = path.resolve(directory)
    await assertUnlinkedDirectory(root)
    const documents: ActuatorKnowledgeBundle["documents"] = []
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    let totalBytes = 0
    for (const binding of DOCUMENT_BINDINGS) {
      const raw = await readVerifiedDocument(root, binding, MAX_BUNDLE_BYTES - totalBytes)
      totalBytes += raw.length
      documents.push({ name: binding.name, sha256: binding.sha256, text: decoder.decode(raw) })
    }
    await assertUnlinkedDirectory(root)
    return {
      id: "actuator-design-legion-knowledge",
      version: "1.0.0",
      digest: createHash("sha256")
        .update(JSON.stringify(DOCUMENT_BINDINGS.map(({ name, sha256 }) => ({ name, sha256 }))), "utf8")
        .digest("hex"),
      sourceIds: readSourceIds(documents.find((document) => document.name === "sources.json")!.text),
      documents,
    }
  } catch (error) {
    if (error instanceof KnowledgeValidationError) throw error
    throw new Error("Actuator knowledge unavailable")
  }
}
