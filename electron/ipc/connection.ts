// First-party RPC contracts and dispatch. This module has no Electron dependency.
export interface ServiceContract {
  ClientInvokes: object
  ServerEvents?: object
}

export interface ServiceName<T extends ServiceContract = ServiceContract> {
  readonly name: string
  readonly methods: { readonly [K in keyof T["ClientInvokes"]]: true }
  readonly __contract?: T
}

export function defineService<T extends ServiceContract>(
  name: string,
  methods: { [K in keyof T["ClientInvokes"]]: true },
): ServiceName<T> {
  return Object.freeze({ name, methods: Object.freeze({ ...methods }) })
}

type Contract<S extends ServiceName> = NonNullable<S["__contract"]>
export type IConnectionService<S extends ServiceName> = Contract<S>["ClientInvokes"]
type Events<S extends ServiceName> = NonNullable<Contract<S>["ServerEvents"]>
type Method<S extends ServiceName> = keyof IConnectionService<S> & string
type Args<F> = F extends (...args: infer A) => unknown ? A : never
type Result<F> = F extends (...args: never[]) => infer R ? Awaited<R> : never

export interface InvokeRequest {
  service: string
  method: string
  args: unknown[]
}
export interface EventMessage {
  service: string
  event: string
  data: unknown
}
export interface ServerTransport {
  start(invoke: (request: InvokeRequest) => Promise<unknown>): void
  broadcast(message: EventMessage): void
  dispose(): void
}
export interface ClientTransport {
  connect(): Promise<void>
  invoke(request: InvokeRequest): Promise<unknown>
  onEvent(listener: (message: EventMessage) => void): () => void
}

export interface ConnectionClientService<S extends ServiceName> {
  invoke<K extends Method<S>>(
    method: K,
    ...args: Args<IConnectionService<S>[K]>
  ): Promise<Result<IConnectionService<S>[K]>>
  serverEvents: {
    on<K extends keyof Events<S> & string>(event: K, listener: (data: Events<S>[K]) => void): () => void
  }
}

const attach = Symbol("attach service publisher")
export class ConnectionService<S extends ServiceName = ServiceName> {
  readonly definition: S
  #publisher: ((message: EventMessage) => void) | undefined
  constructor(definition: S) {
    this.definition = definition
  }
  [attach](publish: (message: EventMessage) => void): void {
    this.#publisher = publish
  }
  async send<K extends keyof Events<S> & string>(event: K, data: Events<S>[K]): Promise<void> {
    this.#publisher?.({ service: this.definition.name, event, data })
  }
  dispose(): void {
    this.#publisher = undefined
  }
}

export class ConnectionServer {
  private readonly services = new Map<string, ConnectionService>()
  private readonly transport: ServerTransport
  private started = false
  private disposed = false
  constructor(transport: ServerTransport) {
    this.transport = transport
  }
  registerService(service: ConnectionService): void {
    if (this.disposed) throw new Error("IPC server disposed")
    const name = service.definition.name
    if (this.services.has(name)) throw new Error(`IPC service already registered: ${name}`)
    this.services.set(name, service)
    service[attach]((message) => {
      if (!this.disposed) this.transport.broadcast(message)
    })
  }
  start(): void {
    if (this.disposed) throw new Error("IPC server disposed")
    if (this.started) return
    this.transport.start(async (request) => {
      if (this.disposed) throw new Error("IPC server disposed")
      if (
        !request ||
        typeof request.service !== "string" ||
        typeof request.method !== "string" ||
        !Array.isArray(request.args)
      ) {
        throw new Error("Invalid IPC request")
      }
      const service = this.services.get(request.service)
      if (!service) throw new Error(`Unknown IPC service: ${request.service}`)
      if (!Object.hasOwn(service.definition.methods, request.method))
        throw new Error(`Unknown IPC method: ${request.method}`)
      const method = Reflect.get(service, request.method) as unknown
      if (typeof method !== "function") throw new Error(`Unknown IPC method: ${request.method}`)
      return Reflect.apply(method, service, request.args)
    })
    this.started = true
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const errors: unknown[] = []
    try {
      this.transport.dispose()
    } catch (error) {
      errors.push(error)
    }
    for (const service of this.services.values()) {
      try {
        service.dispose()
      } catch (error) {
        errors.push(error)
      } finally {
        ConnectionService.prototype.dispose.call(service)
      }
    }
    this.services.clear()
    if (errors.length) throw new AggregateError(errors, "IPC cleanup failed")
  }
}

export class ConnectionClient {
  private readonly transport: ClientTransport
  private ready: Promise<void> | undefined
  private unsubscribe: (() => void) | undefined
  private readonly listeners = new Set<(message: EventMessage) => void>()
  private readonly pending = new Set<(error: Error) => void>()
  private disposed = false
  constructor(transport: ClientTransport) {
    this.transport = transport
  }
  start(): void {
    if (this.disposed) throw new Error("IPC client disposed")
    if (this.ready) return
    this.unsubscribe = this.transport.onEvent((message) => {
      // Subscriptions added by a callback must not receive the event in progress.
      const subscribers = [...this.listeners]
      for (const listener of subscribers) {
        // One failing UI subscriber must not stop delivery to other subscribers.
        try {
          listener(message)
        } catch (error) {
          console.error("[wanta] IPC event listener failed", error)
        }
      }
    })
    this.ready = this.transport.connect()
    // Calls still receive the rejection; startup itself is intentionally synchronous.
    void this.ready.catch(() => undefined)
  }
  use<S extends ServiceName>(definition: S): ConnectionClientService<S> {
    return {
      invoke: (method, ...args) =>
        this.invoke({ service: definition.name, method, args }) as ReturnType<ConnectionClientService<S>["invoke"]>,
      serverEvents: {
        on: (event, listener) => {
          if (this.disposed) throw new Error("IPC client disposed")
          const receive = (message: EventMessage): void => {
            if (message.service === definition.name && message.event === event) listener(message.data as never)
          }
          this.listeners.add(receive)
          return () => {
            this.listeners.delete(receive)
          }
        },
      },
    }
  }
  private invoke(request: InvokeRequest): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("IPC client disposed"))
    this.start()
    return new Promise((resolve, reject) => {
      this.pending.add(reject)
      void this.ready!.then(() => {
        if (this.disposed) throw new Error("IPC client disposed")
        return this.transport.invoke(request)
      })
        .then(resolve, reject)
        .finally(() => {
          this.pending.delete(reject)
        })
    })
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe?.()
    this.listeners.clear()
    for (const reject of this.pending) reject(new Error("IPC client disposed"))
    this.pending.clear()
  }
}
