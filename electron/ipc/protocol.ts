import type { EventMessage, InvokeRequest } from "./connection.ts"

export const RPC_BRIDGE = "xingchaoRpc"
export const RPC_CONNECT = "xingchao:rpc:connect"
export const RPC_INVOKE = "xingchao:rpc:invoke"
export const RPC_EVENT = "xingchao:rpc:event"
export type Reply = { ok: true; value: unknown } | { ok: false; error: string }
export interface IpcBridge {
  connect(): Promise<Reply>
  invoke(request: InvokeRequest): Promise<Reply>
  onEvent(listener: (message: EventMessage) => void): () => void
}
declare global {
  var xingchaoRpc: IpcBridge | undefined
}
