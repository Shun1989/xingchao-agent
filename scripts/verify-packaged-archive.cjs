"use strict"

const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const { readFile } = require("node:fs/promises")
const { createRequire } = require("node:module")
const path = require("node:path")
// Use the exact ASAR implementation pinned by the installed packaging toolchain.
const builderRequire = createRequire(require.resolve("electron-builder"))
const asar = createRequire(builderRequire.resolve("app-builder-lib"))("@electron/asar")

module.exports = async function verifyPackagedArchive(archive) {
  asar.uncache(archive)
  const manifest = JSON.parse(asar.extractFile(archive, "package.json").toString("utf8"))
  assert.equal(typeof manifest.name, "string", "Packaged app name is missing")
  assert.equal(typeof manifest.version, "string", "Packaged app version is missing")
  assert.equal(typeof manifest.main, "string", "Packaged entry point is missing")
  assert.ok(asar.extractFile(archive, manifest.main).length > 0, "Packaged entry point is empty")
  for (const entry of asar.listPackage(archive)) {
    const name = entry.replace(/^[/\\]+/, "")
    const metadata = asar.statFile(archive, name, false)
    if (metadata.files || metadata.link) continue
    assert.equal(metadata.integrity?.algorithm, "SHA256", `Missing archive integrity: ${name}`)
    const bytes = metadata.unpacked
      ? await readFile(path.join(`${archive}.unpacked`, name))
      : asar.extractFile(archive, name)
    assert.equal(bytes.length, metadata.size, `Archive size mismatch: ${name}`)
    const actual = createHash("sha256").update(bytes).digest("hex")
    assert.equal(actual, metadata.integrity.hash, `Archive integrity mismatch: ${name}`)
  }
}
