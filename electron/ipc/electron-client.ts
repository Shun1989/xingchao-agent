import type { ClientTransport, EventMessage, InvokeRequest } from "./connection.ts"
import type { IpcBridge, Reply } from "./protocol.ts"

export class ElectronClientAdapter implements ClientTransport {
  private readonly bridge: IpcBridge
  constructor(bridge: IpcBridge | undefined = globalThis.xingchaoRpc) {
    if (!bridge) throw new Error("Missing Electron RPC bridge")
    this.bridge = bridge
  }
  async connect(): Promise<void> {
    unwrap(await this.bridge.connect())
  }
  async invoke(request: InvokeRequest): Promise<unknown> {
    return unwrap(await this.bridge.invoke(request))
  }
  onEvent(listener: (message: EventMessage) => void): () => void {
    return this.bridge.onEvent(listener)
  }
}
function unwrap(reply: Reply): unknown {
  if (!reply.ok) throw new Error(reply.error)
  return reply.value
}
