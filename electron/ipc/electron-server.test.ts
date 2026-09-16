import type { IpcMainInvokeEvent } from "electron"

import { EventEmitter } from "node:events"
import { describe, expect, it, vi, beforeEach } from "vitest"

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
}))
import { ElectronServerAdapter } from "./electron-server.ts"
import { RPC_CONNECT, RPC_INVOKE, RPC_EVENT } from "./protocol.ts"

function sender(id: number) {
  const contents = new EventEmitter()
  const messages: unknown[] = []
  const frame = {
    url: "file:///app/index.html",
    send: (channel: string, data: unknown) => messages.push({ channel, data }),
  }
  Object.assign(contents, { id, mainFrame: frame, isDestroyed: () => false })
  const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent
  return { contents, frame, event, messages }
}
async function call(channel: string, event: IpcMainInvokeEvent, request?: unknown) {
  return handlers.get(channel)!(event, request)
}

describe("Electron RPC admission and lifecycle", () => {
  beforeEach(() => handlers.clear())
  it("rejects foreign windows and subframes before dispatch", async () => {
    const trusted = sender(1),
      foreign = sender(2)
    let calls = 0
    const adapter = new ElectronServerAdapter({ isTrustedSender: (event) => event.sender === trusted.event.sender })
    adapter.start(async () => {
      calls++
      return "ok"
    })
    expect(await call(RPC_INVOKE, foreign.event, {})).toEqual({ ok: false, error: "Untrusted IPC sender" })
    const subframe = { ...trusted.event, senderFrame: { url: trusted.frame.url } } as IpcMainInvokeEvent
    expect(await call(RPC_INVOKE, subframe, {})).toEqual({ ok: false, error: "Untrusted IPC sender" })
    expect(calls).toBe(0)
    expect(await call(RPC_INVOKE, trusted.event, {})).toEqual({ ok: true, value: "ok" })
  })
  it("sends only to connected trusted frames and drops registrations on navigation/destruction", async () => {
    const first = sender(1),
      second = sender(2)
    const adapter = new ElectronServerAdapter({
      isTrustedSender: (event) => event.senderFrame?.url === "file:///app/index.html",
    })
    adapter.start(async () => undefined)
    const event = { service: "test", event: "changed", data: null }
    adapter.broadcast(event)
    expect(first.messages).toEqual([])
    await call(RPC_CONNECT, first.event)
    await call(RPC_CONNECT, first.event)
    await call(RPC_CONNECT, second.event)
    adapter.broadcast(event)
    expect(first.messages).toEqual([{ channel: RPC_EVENT, data: event }])
    first.contents.emit("did-start-navigation", {}, "file:///app/index.html", false, true)
    adapter.broadcast(event)
    expect(first.messages).toHaveLength(1)
    expect(first.contents.listenerCount("destroyed")).toBe(0)
    await call(RPC_CONNECT, first.event)
    adapter.broadcast(event)
    expect(first.messages).toHaveLength(2)
    second.contents.emit("destroyed")
    adapter.broadcast(event)
    expect(second.messages).toHaveLength(3)
    first.frame.url = "https://foreign.invalid/"
    adapter.broadcast(event)
    expect(first.messages).toHaveLength(3)
    adapter.dispose()
    adapter.dispose()
    expect(handlers.size).toBe(0)
    expect(first.contents.listenerCount("did-start-navigation")).toBe(0)
  })
  it("returns only error messages and leaves other calls usable", async () => {
    const trusted = sender(1)
    const adapter = new ElectronServerAdapter({ isTrustedSender: () => true })
    adapter.start(async (request) => {
      if (request.method === "fail") throw Object.assign(new Error("failure"), { token: "secret" })
      return undefined
    })
    expect(await call(RPC_INVOKE, trusted.event, { method: "fail" })).toEqual({ ok: false, error: "failure" })
    expect(await call(RPC_INVOKE, trusted.event, { method: "ok" })).toEqual({ ok: true, value: undefined })
  })
})
