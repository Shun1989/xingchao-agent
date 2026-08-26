import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { isLikelyUtf8Text, mimeFromFile, mimeFromPath, normalizeLocalPathCandidate } from "./artifacts.ts"

describe("normalizeLocalPathCandidate", () => {
  it("normalizes file URLs and home-relative paths", () => {
    const home = path.resolve("test-fixtures", "home")
    const output = path.join(home, "Desktop", "out.png")
    expect(normalizeLocalPathCandidate(pathToFileURL(output).href, home)).toBe(output)
    expect(normalizeLocalPathCandidate("~/Desktop/out.png", home)).toBe(output)
  })

  it("rejects non-local paths", () => {
    expect(normalizeLocalPathCandidate("https://example.com/file.png", "/Users/wushuang")).toBeNull()
    expect(normalizeLocalPathCandidate("relative/file.png", "/Users/wushuang")).toBeNull()
  })

  it("rejects filesystem roots", () => {
    const home = path.resolve("test-fixtures", "home")
    const root = path.parse(home).root
    expect(normalizeLocalPathCandidate(root, home)).toBeNull()
    expect(normalizeLocalPathCandidate("~", home)).toBeNull()
    expect(normalizeLocalPathCandidate("~/", home)).toBeNull()
    expect(normalizeLocalPathCandidate(pathToFileURL(root).href, home)).toBeNull()
  })
})

describe("mimeFromPath", () => {
  it("recognizes common generated audio and video files", () => {
    expect(mimeFromPath("/tmp/result.mp3")).toBe("audio/mpeg")
    expect(mimeFromPath("/tmp/result.wav")).toBe("audio/wav")
    expect(mimeFromPath("/tmp/result.avi")).toBe("video/x-msvideo")
    expect(mimeFromPath("/tmp/result.mkv")).toBe("video/x-matroska")
    expect(mimeFromPath("/tmp/result.mp4")).toBe("video/mp4")
    expect(mimeFromPath("/tmp/result.mov")).toBe("video/quicktime")
  })

  it("recognizes common document and archive files", () => {
    expect(mimeFromPath("/tmp/report.doc")).toBe("application/msword")
    expect(mimeFromPath("/tmp/report.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    expect(mimeFromPath("/tmp/report.rtf")).toBe("application/rtf")
    expect(mimeFromPath("/tmp/slides.ppt")).toBe("application/vnd.ms-powerpoint")
    expect(mimeFromPath("/tmp/slides.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
    expect(mimeFromPath("/tmp/archive.gz")).toBe("application/gzip")
    expect(mimeFromPath("/tmp/archive.tar")).toBe("application/x-tar")
    expect(mimeFromPath("/tmp/archive.tgz")).toBe("application/gzip")
  })

  it("recognizes structured and common plain-text data files", () => {
    expect(mimeFromPath("/tmp/data.tsv")).toBe("text/tab-separated-values")
    expect(mimeFromPath("/tmp/events.jsonl")).toBe("application/x-ndjson")
    expect(mimeFromPath("/tmp/config.yaml")).toBe("application/yaml")
    expect(mimeFromPath("/tmp/config.yml")).toBe("application/yaml")
    expect(mimeFromPath("/tmp/config.toml")).toBe("application/toml")
    expect(mimeFromPath("/tmp/document.xml")).toBe("application/xml")
    expect(mimeFromPath("/tmp/query.sql")).toBe("text/plain")
    expect(mimeFromPath("/tmp/application.log")).toBe("text/plain")
  })
})

describe("mimeFromFile", () => {
  it("recognizes UTF-8 text without treating binary data as text", () => {
    expect(isLikelyUtf8Text(Buffer.from("plain UTF-8 text\n第二行\n"))).toBe(true)
    expect(isLikelyUtf8Text(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]))).toBe(false)
  })

  it("reads only the bounded sample for an extensionless file", async () => {
    const readSample = vi.fn(async () => Buffer.from("plain text"))

    expect(await mimeFromFile("/tmp/LICENSE", 20_000, readSample)).toBe("text/plain")
    expect(readSample).toHaveBeenCalledWith("/tmp/LICENSE", 8 * 1024)
  })
})
