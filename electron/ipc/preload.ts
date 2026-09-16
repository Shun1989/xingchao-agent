import type { EventMessage } from "./connection.ts"
import type { IpcBridge } from "./protocol.ts"
import type { IpcRendererEvent } from "electron"

import { contextBridge, ipcRenderer } from "electron"
import { RPC_BRIDGE, RPC_CONNECT, RPC_EVENT, RPC_INVOKE } from "./protocol.ts"

export function setupConnectionPreload(): void {
  const bridge: IpcBridge = {
    connect: () => ipcRenderer.invoke(RPC_CONNECT),
    invoke: (request) => ipcRenderer.invoke(RPC_INVOKE, request),
    onEvent: (listener) => {
      // Do not forward IpcRendererEvent: it includes access to Electron internals.
      const receive = (_event: IpcRendererEvent, message: EventMessage): void => listener(message)
      ipcRenderer.on(RPC_EVENT, receive)
      return () => {
        ipcRenderer.removeListener(RPC_EVENT, receive)
      }
    },
  }
  if (process.contextIsolated) contextBridge.exposeInMainWorld(RPC_BRIDGE, bridge)
  else globalThis.xingchaoRpc = bridge
}
