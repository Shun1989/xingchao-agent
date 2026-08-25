const { app, BrowserWindow, session } = require("electron")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const { createLocalVisualUrlPolicy } = require("./local-url-policy.cjs")

const visualBuildRoot = path.resolve(__dirname, "../../dist-visual")
const visualEntry = path.join(visualBuildRoot, "index.html")
const visualEntryUrl = pathToFileURL(visualEntry).href
const isAllowedVisualUrl = createLocalVisualUrlPolicy(visualBuildRoot)

app.commandLine.appendSwitch("lang", "zh-CN")
app.commandLine.appendSwitch("disable-renderer-backgrounding")

app.whenReady().then(async () => {
  const isolatedSession = session.fromPartition("fleet-visual-isolated")
  isolatedSession.setPermissionCheckHandler(() => false)
  isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    const rendererResource = details.resourceType !== "mainFrame" && details.resourceType !== "subFrame"
    callback({ cancel: !isAllowedVisualUrl(details.url, rendererResource) })
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
