const { app, BrowserWindow, session } = require("electron")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

const visualBuildRoot = path.resolve(__dirname, "../../dist-visual")
const visualEntry = path.join(visualBuildRoot, "index.html")
const visualEntryUrl = pathToFileURL(visualEntry).href

function isAllowedVisualUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === "data:" || url.protocol === "blob:") return true
    if (url.protocol !== "file:") return false
    const candidate = path.resolve(decodeURIComponent(url.pathname.replace(/^\/(?:([A-Za-z]:))/, "$1")))
    const relative = path.relative(visualBuildRoot, candidate)
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  } catch {
    return false
  }
}

app.commandLine.appendSwitch("lang", "zh-CN")
app.commandLine.appendSwitch("disable-renderer-backgrounding")

app.whenReady().then(async () => {
  const isolatedSession = session.fromPartition("fleet-visual-isolated")
  isolatedSession.setPermissionCheckHandler(() => false)
  isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedVisualUrl(details.url) })
  })

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: "#071522",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      sandbox: true,
      session: isolatedSession,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedVisualUrl(url)) event.preventDefault()
  })
  await window.loadURL(visualEntryUrl)
})

app.on("window-all-closed", () => app.quit())
