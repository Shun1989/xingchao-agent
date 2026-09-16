import { branding } from "./electron/branding.ts"
import { githubUpdateRepository } from "./electron/update/feed.ts"

// @see - https://www.electron.build/configuration/configuration
export default {
  $schema:
    "https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/scheme.json",
  appId: branding.appId,
  asar: true,
  asarUnpack: ["node_modules/sqlite3/**"],
  productName: branding.appName,
  directories: {
    buildResources: "resources",
    output: "release/${version}",
  },
  publish: {
    ...githubUpdateRepository,
    releaseType: "release",
  },
  // Local developer packages may remain unsigned. The signed candidate workflow sets this flag
  // and also verifies both the unpacked executable and installer with Get-AuthenticodeSignature.
  forceCodeSigning: process.env.XINGCHAO_REQUIRE_CODE_SIGNING === "true",
  protocols: [
    {
      name: branding.protocolScheme,
      schemes: [branding.protocolScheme],
    },
  ],
  files: ["dist", "dist-electron", "!**/*.{map,d.ts}"],
  afterPack: "scripts/electron-builder-after-pack.cjs",
  // 内置 oo + opencode + rg + Direct CLI 平台二进制（由 prepare-binaries 在构建前复制）。
  // 运行时 app.isPackaged 走 process.resourcesPath/bin。
  // resources/skills 是 oo 自带的 4 个内置 skill（同由 prepare-binaries.ts 导出）；运行时拷进 OpenCode
  // workspace 的 .opencode/skill/，使 Wanta agent 直接读到。
  extraResources: [
    {
      from: "resources/licenses",
      to: "licenses",
    },
    {
      from: "LICENSE",
      to: "licenses/Xingchao-LICENSE",
    },
    {
      from: "NOTICE",
      to: "NOTICE",
    },
    {
      from: "THIRD_PARTY_NOTICES.md",
      to: "THIRD_PARTY_NOTICES.md",
    },
    {
      from: "TRADEMARKS.md",
      to: "TRADEMARKS.md",
    },
    {
      from: "resources/branding/icon.png",
      to: "icon.png",
    },
    {
      from: "resources/branding/icon.ico",
      to: "icon.ico",
    },
    {
      from: "resources/bin",
      to: "bin",
    },
    {
      from: "resources/skills",
      to: "skills",
    },
    {
      from: "resources/lark-skills",
      to: "lark-skills",
    },
    {
      from: "resources/wecom-skills",
      to: "wecom-skills",
    },
    {
      from: "resources/dingtalk-skills",
      to: "dingtalk-skills",
    },
    {
      from: "resources/agent-tool-runtime",
      to: "agent-tool-runtime",
    },
  ],
  mac: {
    icon: "branding/icon.icns",
    electronLanguages: ["en", "zh_CN"],
    extendInfo: {
      NSMicrophoneUsageDescription: `${branding.appName} uses the microphone to record voice messages for chat input.`,
    },
    entitlements: "electron/entitlements.mac.plist",
    entitlementsInherit: "electron/entitlements.mac.plist",
    target: [
      {
        target: "dmg",
        arch: ["arm64"],
      },
      {
        target: "zip",
        arch: ["arm64"],
      },
    ],
    artifactName: "${productName}-${version}.${ext}",
  },
  win: {
    icon: "branding/icon.ico",
    electronLanguages: ["en-US", "zh-CN"],
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    // The publisher injects CSC_LINK/CSC_KEY_PASSWORD. No upstream certificate identity is inherited.
    artifactName: "${productName}-${version}-Setup.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },
  linux: {
    icon: "branding/icon.png",
    target: ["AppImage"],
    artifactName: "${productName}-${version}.${ext}",
  },
}
