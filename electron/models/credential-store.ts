import type { ModelCredentialStatus } from "./common.ts"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { atomicWriteText } from "../atomic-file.ts"

export interface ModelCredentialEncryption {
  decryptString(encrypted: Buffer): string
  encryptString(plainText: string): Buffer
  getSelectedStorageBackend?(): string
  isEncryptionAvailable(): boolean
}

interface PersistedModelCredentials {
  version: 1
  credentials: Record<string, string>
}

export class ModelCredentialUnavailableError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = "ModelCredentialUnavailableError"
  }
}

/**
 * 自定义模型凭证仓库：磁盘只保存 safeStorage 密文，明文仅在主进程 runtime 装配期间短暂存在。
 * Linux 的 basic_text 后端不提供真实机密性，因此显式拒绝，不做明文或弱加密降级。
 */
export class ModelCredentialStore {
  private readonly file: string

  public constructor(
    dir: string,
    private readonly encryption: ModelCredentialEncryption,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.file = path.join(dir, "model-credentials.json")
  }

  public async get(modelId: string): Promise<string | undefined> {
    this.assertAvailable()
    const encoded = (await this.read()).credentials[modelId]
    if (!encoded) return undefined
    return this.encryption.decryptString(Buffer.from(encoded, "base64"))
  }

  public async status(modelId: string): Promise<ModelCredentialStatus> {
    try {
      const apiKey = await this.get(modelId)
      return apiKey ? "configured" : "missing"
    } catch {
      return "unavailable"
    }
  }

  public async set(modelId: string, apiKey: string): Promise<void> {
    await this.setMany(new Map([[modelId, apiKey]]))
  }

  public async setMany(credentials: ReadonlyMap<string, string>): Promise<void> {
    if (credentials.size === 0) return
    this.assertAvailable()
    const persisted = await this.read()
    for (const [modelId, apiKey] of credentials) {
      const id = modelId.trim()
      const secret = apiKey.trim()
      if (!isSafeCredentialId(id) || !secret) {
        throw new Error("A valid model ID and API Key are required for secure credential storage.")
      }
      persisted.credentials[id] = this.encryption.encryptString(secret).toString("base64")
    }
    await this.write(persisted)
  }

  public async delete(modelId: string): Promise<void> {
    this.assertAvailable()
    const persisted = await this.read()
    if (!Object.hasOwn(persisted.credentials, modelId)) return
    delete persisted.credentials[modelId]
    await this.write(persisted)
  }

  /**
   * Coordinates an opaque credential mutation with its metadata update. The prior
   * ciphertext is restored verbatim if metadata persistence fails; callers never
   * need to decrypt or expose the old secret in order to replace or delete it.
   */
  public async withCredentialUpdate<T>(
    modelId: string,
    apiKey: string | undefined,
    updateMetadata: () => Promise<T>,
  ): Promise<T> {
    this.assertAvailable()
    const id = modelId.trim()
    if (!isSafeCredentialId(id)) {
      throw new Error("A valid model ID is required for secure credential storage.")
    }
    const before = await this.read()
    const after: PersistedModelCredentials = {
      version: 1,
      credentials: { ...before.credentials },
    }
    if (apiKey === undefined) {
      delete after.credentials[id]
    } else {
      const secret = apiKey.trim()
      if (!secret) {
        throw new Error("A non-empty API Key is required for secure credential storage.")
      }
      after.credentials[id] = this.encryption.encryptString(secret).toString("base64")
    }
    await this.write(after)
    try {
      return await updateMetadata()
    } catch (error) {
      try {
        await this.write(before)
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Failed to update and roll back the model credential")
      }
      throw error
    }
  }

  private assertAvailable(): void {
    if (!this.encryption.isEncryptionAvailable()) {
      throw new ModelCredentialUnavailableError(
        "Secure model credential storage is unavailable. Unlock the operating system keychain and try again.",
      )
    }
    if (this.platform === "linux") {
      const backend = this.encryption.getSelectedStorageBackend?.() ?? "unknown"
      if (backend === "basic_text" || backend === "unknown") {
        throw new ModelCredentialUnavailableError(
          "Secure model credential storage requires GNOME Keyring or KWallet on Linux; plaintext fallback is disabled.",
        )
      }
    }
  }

  private async read(): Promise<PersistedModelCredentials> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Partial<PersistedModelCredentials>
      if (
        parsed.version !== 1 ||
        !parsed.credentials ||
        typeof parsed.credentials !== "object" ||
        Array.isArray(parsed.credentials)
      ) {
        throw new Error("Model credential store has an unsupported format.")
      }
      const credentials = Object.fromEntries(
        Object.entries(parsed.credentials).filter(
          (entry): entry is [string, string] =>
            Boolean(entry[0].trim()) && typeof entry[1] === "string" && entry[1].length > 0,
        ),
      )
      return { version: 1, credentials }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, credentials: {} }
      }
      throw error
    }
  }

  private async write(credentials: PersistedModelCredentials): Promise<void> {
    await atomicWriteText(this.file, JSON.stringify(credentials, null, 2), { mode: 0o600 })
  }
}

function isSafeCredentialId(value: string): boolean {
  return Boolean(value && value !== "__proto__" && value !== "constructor" && value !== "prototype")
}
