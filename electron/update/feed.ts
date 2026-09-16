import type { UpdateChannel } from "./channel.ts"

import { updaterChannelName } from "./channel.ts"

export const githubUpdateRepository = {
  provider: "github",
  owner: "Shun1989",
  repo: "xingchao-agent",
} as const

export function githubUpdateFeed(
  channel: UpdateChannel,
): typeof githubUpdateRepository & { channel: "latest" | "beta" } {
  return {
    ...githubUpdateRepository,
    channel: updaterChannelName(channel),
  }
}

interface GithubUpdaterTarget {
  allowDowngrade: boolean
  allowPrerelease: boolean
  channel: string | null
  setFeedURL(options: ReturnType<typeof githubUpdateFeed>): void
}

export function configureGithubUpdater(updater: GithubUpdaterTarget, channel: UpdateChannel): void {
  const providerChannel = updaterChannelName(channel)
  updater.allowPrerelease = channel === "beta"
  // GitHubProvider's prerelease scan reads updater.channel (not only the provider options). The
  // installed channel setter enables downgrade as a side effect, so reset it after all setters.
  updater.channel = providerChannel
  updater.setFeedURL(githubUpdateFeed(channel))
  updater.allowDowngrade = false
}
