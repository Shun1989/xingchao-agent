const { fileURLToPath } = require("node:url")
const path = require("node:path")

function createLocalVisualUrlPolicy(buildRoot) {
  const canonicalBuildRoot = path.resolve(buildRoot)

  return function isAllowedVisualUrl(rawUrl, allowRendererResource = false) {
    try {
      const url = new URL(rawUrl)
      if (url.protocol === "data:") return allowRendererResource
      if (url.protocol === "blob:") return allowRendererResource && url.origin === "null"
      if (url.protocol !== "file:" || url.hostname !== "") return false

      const candidate = path.resolve(fileURLToPath(url))
      const relative = path.relative(canonicalBuildRoot, candidate)
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
    } catch {
      return false
    }
  }
}

module.exports = { createLocalVisualUrlPolicy }
