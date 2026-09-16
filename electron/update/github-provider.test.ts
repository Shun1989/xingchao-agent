import type { AppUpdater } from "electron-updater"
import type { RequestOptions } from "node:http"

import { GitHubProvider } from "electron-updater/out/providers/GitHubProvider.js"
import { describe, expect, it, vi } from "vitest"
import { configureGithubUpdater } from "./feed.ts"

const atomFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>alpha</title><link href="https://github.com/Shun1989/xingchao-agent/releases/tag/v3.0.0-alpha.1"/><content>alpha</content></entry>
  <entry><title>custom</title><link href="https://github.com/Shun1989/xingchao-agent/releases/tag/v2.0.0-canary.1"/><content>custom</content></entry>
  <entry><title>beta</title><link href="https://github.com/Shun1989/xingchao-agent/releases/tag/v1.2.0-beta.2"/><content>beta</content></entry>
  <entry><title>stable</title><link href="https://github.com/Shun1989/xingchao-agent/releases/tag/v1.1.0"/><content>stable</content></entry>
</feed>`

describe("GitHub update provider boundary", () => {
  it("keeps a stable install that opts into beta on beta and never selects alpha or a custom prerelease", async () => {
    const requests: string[] = []
    const executor = {
      request: vi.fn((options: RequestOptions) => {
        const requestPath = options.path ?? ""
        requests.push(requestPath)
        if (requestPath.endsWith("/releases.atom")) return Promise.resolve(atomFeed)
        if (requestPath.endsWith("/download/v1.2.0-beta.2/beta.yml")) {
          return Promise.resolve(
            "version: 1.2.0-beta.2\npath: xingchao-navigation-setup-1.2.0-beta.2.exe\nsha512: test\n",
          )
        }
        throw new Error(`Unexpected GitHub provider request: ${requestPath}`)
      }),
    }
    let selectedChannel: string | null = null
    const updater = {
      allowDowngrade: false,
      allowPrerelease: false,
      currentVersion: "1.0.0" as unknown as AppUpdater["currentVersion"],
      fullChangelog: false,
      isAddNoCacheQuery: false,
      setFeedURL: vi.fn(),
      get channel(): string | null {
        return selectedChannel
      },
      set channel(value: string | null) {
        selectedChannel = value
        this.allowDowngrade = true
      },
    }

    configureGithubUpdater(updater, "beta")
    const provider = new GitHubProvider(
      { provider: "github", owner: "Shun1989", repo: "xingchao-agent", channel: "beta" },
      updater as unknown as AppUpdater,
      { executor, isUseMultipleRangeRequest: false, platform: "win32" } as never,
    )

    const update = await provider.getLatestVersion()

    expect(update.version).toBe("1.2.0-beta.2")
    expect(requests).toEqual([
      "/Shun1989/xingchao-agent/releases.atom",
      "/Shun1989/xingchao-agent/releases/download/v1.2.0-beta.2/beta.yml",
    ])
    expect(updater.channel).toBe("beta")
    expect(updater.allowPrerelease).toBe(true)
    expect(updater.allowDowngrade).toBe(false)
  })
})
