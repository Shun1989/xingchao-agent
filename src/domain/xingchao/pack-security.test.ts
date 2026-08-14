import { describe, expect, it } from "vitest"
import { inspectContentPackEntries } from "./pack-security.ts"

describe("补给包安全边界", () => {
  it("接受声明式资源并拒绝路径穿越与可执行文件", () => {
    expect(
      inspectContentPackEntries([
        { path: "manifest.json", size: 100 },
        { path: "portraits/lanxi.png", size: 200 },
      ]).accepted,
    ).toBe(true)
    const rejected = inspectContentPackEntries([
      { path: "../escape.json", size: 10 },
      { path: "scripts/install.js", size: 10 },
    ])
    expect(rejected.accepted).toBe(false)
    expect(rejected.errors).toEqual(
      expect.arrayContaining(["非法路径：../escape.json", "不允许的文件类型：scripts/install.js"]),
    )
  })

  it("拒绝符号链接和跨平台路径冲突", () => {
    const rejected = inspectContentPackEntries([
      { path: "portraits/Lanxi.png", size: 10 },
      { path: "portraits/lanxi.png", size: 10 },
      { path: "voices/current.wav", size: 5, symlink: true },
    ])
    expect(rejected.accepted).toBe(false)
    expect(rejected.errors.join(" ")).toMatch(/路径冲突|符号链接/)
  })
})
