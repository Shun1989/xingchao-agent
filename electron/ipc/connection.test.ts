import type { ClientTransport, ServerTransport, InvokeRequest, EventMessage } from "./connection.ts"

import { describe, expect, it } from "vitest"
import { ConnectionClient, ConnectionServer, ConnectionService, defineService } from "./connection.ts"

const Echo = defineService<{
  ClientInvokes: {
    echo(value: unknown): Promise<unknown>
    fail(): Promise<void>
    publish(value: string): Promise<void>
  }
  ServerEvents: { changed: string }
}>("test/echo", { echo: true, fail: true, publish: true })

class EchoService extends ConnectionService<typeof Echo> {
  calls = 0
  constructor() {
    super(Echo)
  }
  async echo(value: unknown) {
    this.calls++
    return value
  }
  async fail(): Promise<void> {
    throw new Error("service failure")
  }
  async publish(value: string) {
    await this.send("changed", value)
  }
  secret() {
    return "must never leave main"
  }
}

function fixture() {
  let handler: ((request: InvokeRequest) => Promise<unknown>) | undefined
  const listeners = new Set<(message: EventMessage) => void>()
  const transport: ServerTransport = {
    start(invoke) {
      handler = invoke
    },
    broadcast(message) {
      for (const listener of listeners) listener(structuredClone(message))
    },
    dispose() {
      handler = undefined
    },
  }
  const bridge: ClientTransport = {
    async connect() {},
    async invoke(request) {
      if (!handler) throw new Error("transport stopped")
      return structuredClone(await handler(structuredClone(request)))
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const server = new ConnectionServer(transport)
  const service = new EchoService()
  server.registerService(service)
  server.start()
  const client = new ConnectionClient(bridge)
  client.start()
  return { server, service, client, bridge, proxy: client.use(Echo), listeners }
}

describe("first-party service dispatch", () => {
  it("preserves structured values and concurrent request results", async () => {
    const { proxy, service } = fixture()
    const values = [undefined, null, 0, false, "", { nested: [null, undefined, "中文"] }]
    expect(await Promise.all(values.map((value) => proxy.invoke("echo", value)))).toEqual(values)
    expect(service.calls).toBe(6)
  })
  it("rejects internal, inherited and unknown methods and unknown services", async () => {
    const { bridge, service } = fixture()
    for (const method of ["secret", "constructor", "toString", "__proto__", "dispose", "send", "missing"]) {
      await expect(bridge.invoke({ service: Echo.name, method, args: [] })).rejects.toThrow("Unknown IPC method")
    }
    await expect(bridge.invoke({ service: "unknown", method: "echo", args: [] })).rejects.toThrow("Unknown IPC service")
    expect(service.calls).toBe(0)
  })
  it("propagates invocation failures without poisoning later requests", async () => {
    const { proxy } = fixture()
    await expect(proxy.invoke("fail")).rejects.toThrow("service failure")
    await expect(proxy.invoke("echo", "next")).resolves.toBe("next")
  })
  it("delivers ordered events and removes only the unsubscribed listener", async () => {
    const { proxy } = fixture()
    const first: string[] = [],
      second: string[] = []
    const off = proxy.serverEvents.on("changed", (value) => first.push(value))
    proxy.serverEvents.on("changed", (value) => second.push(value))
    await proxy.invoke("publish", "one")
    off()
    off()
    await proxy.invoke("publish", "two")
    expect(first).toEqual(["one"])
    expect(second).toEqual(["one", "two"])
  })
  it("supports services sending before registration and disposes client/server resources", async () => {
    const unattached = new EchoService()
    await expect(unattached.publish("not connected")).resolves.toBeUndefined()
    const { client, server, proxy, service, listeners } = fixture()
    const received: string[] = []
    proxy.serverEvents.on("changed", (value) => received.push(value))
    client.dispose()
    client.dispose()
    await service.publish("after dispose")
    expect(received).toEqual([])
    expect(listeners.size).toBe(0)
    await expect(proxy.invoke("echo", "late")).rejects.toThrow("disposed")
    server.dispose()
    server.dispose()
    await expect(service.publish("after server dispose")).resolves.toBeUndefined()
  })
  it("refuses duplicate registrations rather than silently changing the service", () => {
    const { server } = fixture()
    expect(() => server.registerService(new EchoService())).toThrow("already registered")
  })
  it("validates requests before touching a service", async () => {
    const { bridge, service } = fixture()
    for (const request of [null, {}, { service: Echo.name, method: "echo", args: {} }]) {
      await expect(bridge.invoke(request as InvokeRequest)).rejects.toThrow("Invalid IPC request")
    }
    expect(service.calls).toBe(0)
  })
})
