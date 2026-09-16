import { serviceName } from "../branding.ts"
import { defineService } from "../ipc/connection.ts"

export type ThemeSource = "system" | "light" | "dark"
export type CompletionNotificationCondition = "never" | "background" | "always"
export type OperatingMode = "oomol" | "self-managed" | "unselected"

export interface AppSettings {
  browserEnabled: boolean
  completionNotificationCondition: CompletionNotificationCondition
  themeSource: ThemeSource
  knowledgeBaseBetaEnabled: boolean
  notificationSoundEnabled: boolean
  operatingMode: OperatingMode | null
  selfManagedSetupDismissed: boolean
  unreadBadgeEnabled: boolean
}

/** 对齐 Codex：仅后台完成通知，通知声音与应用图标未读红标默认开启。 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  browserEnabled: true,
  completionNotificationCondition: "background",
  knowledgeBaseBetaEnabled: false,
  notificationSoundEnabled: true,
  operatingMode: null,
  selfManagedSetupDismissed: false,
  themeSource: "system",
  unreadBadgeEnabled: true,
}

export type SettingsService = typeof SettingsService
export const SettingsService = defineService<{
  ServerEvents: {
    settingsChanged: AppSettings
  }
  ClientInvokes: {
    getSettings(): Promise<AppSettings>
    /** 同步 Electron nativeTheme.themeSource。 */
    setThemeSource(source: ThemeSource): Promise<void>
    setBrowserEnabled(enabled: boolean): Promise<void>
    setKnowledgeBaseBetaEnabled(enabled: boolean): Promise<void>
    setCompletionNotificationCondition(condition: CompletionNotificationCondition): Promise<void>
    setNotificationSoundEnabled(enabled: boolean): Promise<void>
    setOperatingMode(mode: OperatingMode): Promise<void>
    setSelfManagedSetupDismissed(dismissed: boolean): Promise<void>
    setUnreadBadgeEnabled(enabled: boolean): Promise<void>
  }
}>(serviceName("settings-service"), {
  getSettings: true,
  setThemeSource: true,
  setBrowserEnabled: true,
  setKnowledgeBaseBetaEnabled: true,
  setCompletionNotificationCondition: true,
  setNotificationSoundEnabled: true,
  setOperatingMode: true,
  setSelfManagedSetupDismissed: true,
  setUnreadBadgeEnabled: true,
})
