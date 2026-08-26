import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { isAudioOnlyMediaRequest, isTrustedRendererUrl } from "./media-permission-policy.ts"

describe("isAudioOnlyMediaRequest", () => {
  it("allows microphone-only requests and rejects broader media access", () => {
    expect(isAudioOnlyMediaRequest(["audio"])).toBe(true)
    expect(isAudioOnlyMediaRequest(["audio", "video"])).toBe(false)
    expect(isAudioOnlyMediaRequest(["video"])).toBe(false)
    expect(isAudioOnlyMediaRequest([])).toBe(false)
    expect(isAudioOnlyMediaRequest(undefined)).toBe(false)
  })
})

describe("isTrustedRendererUrl", () => {
  it("allows only the configured development server origin", () => {
    expect(isTrustedRendererUrl("http://localhost:5273/chat", "http://localhost:5273", "file:///app/dist/")).toBe(true)
    expect(isTrustedRendererUrl("http://localhost:5274/chat", "http://localhost:5273", "file:///app/dist/")).toBe(false)
    expect(
      isTrustedRendererUrl("http://localhost:5273@example.test/chat", "http://localhost:5273", "file:///app/dist/"),
    ).toBe(false)
    expect(isTrustedRendererUrl("https://example.test/", "http://localhost:5273", "file:///app/dist/")).toBe(false)
  })

  it("allows only files inside the packaged renderer directory", () => {
    const rendererDirectory = path.resolve("app", "dist")
    const rendererBaseUrl = pathToFileURL(`${rendererDirectory}${path.sep}`).href
    expect(
      isTrustedRendererUrl(pathToFileURL(path.join(rendererDirectory, "index.html")).href, undefined, rendererBaseUrl),
    ).toBe(true)
    expect(
      isTrustedRendererUrl(
        pathToFileURL(path.join(rendererDirectory, "assets", "app.js")).href,
        undefined,
        rendererBaseUrl,
      ),
    ).toBe(true)
    expect(
      isTrustedRendererUrl(pathToFileURL(path.resolve("tmp", "untrusted.html")).href, undefined, rendererBaseUrl),
    ).toBe(false)
    expect(isTrustedRendererUrl(new URL("../untrusted.html", rendererBaseUrl).href, undefined, rendererBaseUrl)).toBe(
      false,
    )
    expect(isTrustedRendererUrl("https://example.test/index.html", undefined, rendererBaseUrl)).toBe(false)
    expect(isTrustedRendererUrl(undefined, undefined, rendererBaseUrl)).toBe(false)
  })
})
