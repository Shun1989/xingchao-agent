import { defineService } from "../../../electron/ipc/connection.ts"

export const Controls = defineService<{
  ServerEvents: { probe: string }
  ClientInvokes: {
    retry(runId: string): Promise<void>
    echo(value: string | null | undefined, delay: number): Promise<string | null | undefined>
    emitProbe(value: string): Promise<void>
    failSync(): Promise<never>
    failAsync(): Promise<never>
  }
}>("test/mission-controls", { retry: true, echo: true, emitProbe: true, failSync: true, failAsync: true })

export interface IpcSmokeProbe {
  events: string[]
  subscribe(): void
  unsubscribe(): void
  emit(value: string): Promise<void>
  invokeChecks(): Promise<{
    values: Array<string | null | undefined>
    completionOrder: string[]
    errors: string[]
    denied: string
    preservedUndefined: boolean
  }>
}

declare global {
  interface Window {
    ipcSmoke: IpcSmokeProbe
  }
}
