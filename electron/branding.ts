// R1：产品品牌相关标识的**单一来源**。改名只动这一处。
//
// The internal IPC service namespace is centralized here for compatibility.
// 但 oo-cli 的 `OO_` 环境变量前缀、connector 的 `x-oomol-*` 头等属于外部协议契约，
// **不随产品名改**，不在本文件管辖。
//
// 本文件为纯常量、无运行时依赖，可被 main / preload / renderer / scripts 共同 import。

export const branding = {
  /** 产品显示名（窗口标题、应用菜单、侧边栏 logo 文案）。 */
  appName: "星潮航局",
  /** OOMOL 公司/服务品牌名（如内置模型 provider、官方技能维护者）。 */
  companyName: "OOMOL",
  /** 生产包 appId（electron-builder.ts 从这里派生）。 */
  appId: "cn.xingchao.navigation",
  /** 本地开发版 Electron 的 bundle id（download-electron 改写 .electron-dist 的 plist）。 */
  devBundleId: "cn.xingchao.navigation-local",
  /** 生产 deep-link scheme（electron-builder.ts 从这里派生）。 */
  protocolScheme: "xingchao",
  /** 本地开发 deep-link scheme。 */
  devProtocolScheme: "xingchao-local",
  /** 应用内部本地 Artifact 流式资源协议，不注册为系统 deep-link。 */
  artifactResourceProtocolScheme: "xingchao-resource",
  /** Namespace for first-party IPC service identifiers. */
  // Compatibility identifiers stay stable so existing local data and IPC clients keep working.
  servicePrefix: "wanta",
  /** preload 暴露到 renderer 的全局 bridge 名（window.<windowBridge>）。 */
  windowBridge: "wanta",
  /** 用户私有数据目录名（传给 oo-cli 的 OO_*_DIR 等使用）。 */
  storeDirName: "wanta",
  /** localStorage / 前端持久化 key 前缀。 */
  storageKeyPrefix: "wanta",
  /** 自动更新 OSS/CDN 路径段（完整基址在 domain.ts 由 endpoint 派生，见 R2/阶段 6）。 */
  updateFeedPath: "release/apps/xingchao",
} as const

/** 拼接一个 ServiceName 字符串，如 `serviceName("ping-service") === "wanta/ping-service"`。 */
export function serviceName(name: string): string {
  return `${branding.servicePrefix}/${name}`
}

/** 拼接一个带前缀的前端持久化 key，如 `storageKey("theme") === "wanta.theme"`。 */
export function storageKey(name: string): string {
  return `${branding.storageKeyPrefix}.${name}`
}
