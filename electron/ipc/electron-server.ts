import type { EventMessage, InvokeRequest, ServerTransport } from "./connection.ts"
import type { Reply } from "./protocol.ts"
import type { IpcMainInvokeEvent } from "electron"

import { ipcMain } from "electron"
import { RPC_CONNECT, RPC_EVENT, RPC_INVOKE } from "./protocol.ts"

export class ElectronServerAdapter implements ServerTransport {
  private readonly isTrustedSender: (event: IpcMainInvokeEvent) => boolean
  private readonly clients = new Map<number, { event: IpcMainInvokeEvent; cleanup: () => void }>()
  private started = false
  constructor(options: { isTrustedSender: (event: IpcMainInvokeEvent) => boolean }) {
    this.isTrustedSender = options.isTrustedSender
  }
  private trusted(event: IpcMainInvokeEvent): boolean {
    try {
      return (
        !event.sender.isDestroyed() &&
        !!event.senderFrame &&
        event.senderFrame === event.sender.mainFrame &&
        this.isTrustedSender(event)
      )
    } catch {
      return false
    }
  }
  start(invoke: (request: InvokeRequest) => Promise<unknown>): void {
    if (this.started) return
    ipcMain.handle(RPC_CONNECT, (event): Reply => {
      if (!this.trusted(event)) return { ok: false, error: "Untrusted IPC sender" }
      const contents = event.sender
      this.clients.get(contents.id)?.cleanup()
      const cleanup = (): void => {
        contents.removeListener("did-start-navigation", onNavigation)
        contents.removeListener("destroyed", cleanup)
        this.clients.delete(contents.id)
      }
      const onNavigation = (_event: unknown, _url: string, isInPlace: boolean, isMainFrame: boolean): void => {
        if (isMainFrame && !isInPlace) cleanup()
      }
      contents.on("did-start-navigation", onNavigation)
      contents.once("destroyed", cleanup)
      this.clients.set(contents.id, { event, cleanup })
      return { ok: true, value: undefined }
    })
    ipcMain.handle(RPC_INVOKE, async (event, request: InvokeRequest): Promise<Reply> => {
      if (!this.trusted(event)) return { ok: false, error: "Untrusted IPC sender" }
      try {
        return { ok: true, value: await invoke(request) }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "IPC service failed" }
      }
    })
    this.started = true
  }
  broadcast(message: EventMessage): void {
    for (const { event, cleanup } of this.clients.values()) {
      if (!this.trusted(event)) {
        cleanup()
        continue
      }
      try {
        event.senderFrame!.send(RPC_EVENT, message)
      } catch {
        cleanup()
      }
    }
  }
  dispose(): void {
    for (const { cleanup } of this.clients.values()) cleanup()
    if (this.started) {
      ipcMain.removeHandler(RPC_CONNECT)
      ipcMain.removeHandler(RPC_INVOKE)
      this.started = false
    }
  }
}
