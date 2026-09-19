export type AppEntryState = "app" | "fallback" | "loading"

/** 身份只参与云能力选择，不再决定能否进入应用主界面。 */
export function resolveAppEntryState({
  authReady,
  authFailed = false,
  runtimeReady,
  runtimeFailed,
}: {
  authReady: boolean
  authFailed?: boolean
  runtimeReady: boolean
  runtimeFailed: boolean
}): AppEntryState {
  if ((!authReady && authFailed) || (!runtimeReady && runtimeFailed)) return "fallback"
  if (!authReady || !runtimeReady) return "loading"
  return "app"
}
