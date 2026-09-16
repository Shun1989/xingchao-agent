"use strict"

// Keep the runtime's own attribution with the Windows payload. A release must
// not silently drop it merely to reduce the installer size.
const { access } = require("node:fs/promises")
const path = require("node:path")
const verifyPackagedArchive = require("./verify-packaged-archive.cjs")

module.exports = async function afterPack(context) {
  if (context.electronPlatformName === "win32") {
    await access(path.join(context.appOutDir, "LICENSES.chromium.html"))
    await verifyPackagedArchive(path.join(context.appOutDir, "resources", "app.asar"))
  }
}
