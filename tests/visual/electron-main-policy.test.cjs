const assert = require("node:assert/strict")
const { pathToFileURL } = require("node:url")
const path = require("node:path")
const test = require("node:test")
const Module = require("node:module")

async function captureRequestPolicy() {
  let beforeRequest
  let resolveReady
  const ready = new Promise((resolve) => {
    resolveReady = resolve
  })
  const isolatedSession = {
    setPermissionCheckHandler() {},
    setPermissionRequestHandler() {},
    webRequest: {
      onBeforeRequest(handler) {
        beforeRequest = handler
      },
    },
  }
  class TestBrowserWindow {
    webContents = {
      on() {},
      setWindowOpenHandler() {},
    }

    async loadURL() {
      resolveReady()
    }
  }
  const electron = {
    app: {
      commandLine: { appendSwitch() {} },
      on() {},
      whenReady: () => Promise.resolve(),
    },
    BrowserWindow: TestBrowserWindow,
    session: { fromPartition: () => isolatedSession },
  }
  const originalLoad = Module._load
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return electron
    return originalLoad.call(this, request, parent, isMain)
  }
  const mainPath = require.resolve("./electron-main.cjs")
  delete require.cache[mainPath]
  try {
    require(mainPath)
    await ready
  } finally {
    Module._load = originalLoad
    delete require.cache[mainPath]
  }
  assert.equal(typeof beforeRequest, "function")
  return (url, resourceType = "image") => {
    let decision
    beforeRequest({ resourceType, url }, (result) => {
      decision = result
    })
    assert.notEqual(decision, undefined)
    return decision.cancel
  }
}

test("confines visual requests to local renderer resources", async () => {
  const cancel = await captureRequestPolicy()
  const localEntry = pathToFileURL(path.join(process.cwd(), "dist-visual", "index.html"))
  const hostileAuthority = new URL(localEntry)
  hostileAuthority.hostname = "evil.invalid"

  assert.equal(cancel(localEntry.href), false)
  assert.equal(cancel("data:image/svg+xml,%3Csvg/%3E"), false)
  assert.equal(cancel("blob:file:///visual-resource"), false)
  assert.equal(cancel("data:text/html,%3Ch1%3Ehostile%3C/h1%3E", "mainFrame"), true)
  assert.equal(cancel(hostileAuthority.href), true)
  assert.equal(cancel("file://server.invalid/share/dist-visual/index.html"), true)
  assert.equal(cancel(pathToFileURL(path.join(process.cwd(), "package.json")).href), true)
  assert.equal(cancel("blob:https://evil.invalid/visual-resource"), true)
})
