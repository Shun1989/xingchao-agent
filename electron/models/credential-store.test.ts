import assert from "node:assert/strict"
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "vitest"
import { ModelCredentialStore, ModelCredentialUnavailableError } from "./credential-store.ts"

function encryption(options: { available?: boolean; backend?: string } = {}) {
  return {
    decryptString: (encrypted: Buffer) => Buffer.from(encrypted.toString("utf8"), "base64").toString("utf8"),
    encryptString: (plainText: string) => Buffer.from(Buffer.from(plainText, "utf8").toString("base64"), "utf8"),
    getSelectedStorageBackend: () => options.backend ?? "gnome_libsecret",
    isEncryptionAvailable: () => options.available ?? true,
  }
}

test("ModelCredentialStore persists only encrypted API keys with owner-only permissions", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wanta-model-credentials-"))
  const store = new ModelCredentialStore(dir, encryption(), "darwin")

  await store.set("model-1", "sk-secret")

  assert.equal(await store.get("model-1"), "sk-secret")
  const file = path.join(dir, "model-credentials.json")
  assert.equal((await readFile(file, "utf8")).includes("sk-secret"), false)
  assert.equal((await stat(file)).mode & 0o777, process.platform === "win32" ? 0o666 : 0o600)
})

test("ModelCredentialStore deletes only the requested credential", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wanta-model-credentials-"))
  const store = new ModelCredentialStore(dir, encryption(), "darwin")
  await store.setMany(
    new Map([
      ["model-1", "first-secret"],
      ["model-2", "second-secret"],
    ]),
  )

  await store.delete("model-1")

  assert.equal(await store.get("model-1"), undefined)
  assert.equal(await store.get("model-2"), "second-secret")
})

test("ModelCredentialStore refuses unavailable and Linux plaintext backends", async () => {
  const unavailable = new ModelCredentialStore(
    await mkdtemp(path.join(tmpdir(), "wanta-model-credentials-")),
    encryption({ available: false }),
    "darwin",
  )
  await assert.rejects(unavailable.set("model-1", "secret"), ModelCredentialUnavailableError)

  const linuxPlaintext = new ModelCredentialStore(
    await mkdtemp(path.join(tmpdir(), "wanta-model-credentials-")),
    encryption({ backend: "basic_text" }),
    "linux",
  )
  await assert.rejects(linuxPlaintext.set("model-1", "secret"), /plaintext fallback is disabled/i)
})

test("ModelCredentialStore reports configured, missing, and unreadable credentials without changing ciphertext", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wanta-model-credentials-"))
  const file = path.join(dir, "model-credentials.json")
  const unreadableCiphertext = Buffer.from("foreign-profile-ciphertext", "utf8").toString("base64")
  await writeFile(
    file,
    JSON.stringify({ version: 1, credentials: { unreadable: unreadableCiphertext } }, null, 2),
    "utf8",
  )
  const store = new ModelCredentialStore(
    dir,
    {
      ...encryption(),
      decryptString: (encrypted) => {
        if (encrypted.toString("utf8") === "foreign-profile-ciphertext") {
          throw new Error("safeStorage cannot decrypt this ciphertext")
        }
        return encrypted.toString("utf8")
      },
      encryptString: (plainText) => Buffer.from(plainText, "utf8"),
    },
    "darwin",
  )
  const before = await readFile(file, "utf8")

  await store.set("configured", "usable-secret")

  assert.equal(await store.status("configured"), "configured")
  assert.equal(await store.status("missing"), "missing")
  assert.equal(await store.status("unreadable"), "unavailable")
  assert.equal(JSON.parse(await readFile(file, "utf8")).credentials.unreadable, unreadableCiphertext)
  assert.equal(JSON.parse(before).credentials.unreadable, unreadableCiphertext)
})

test("ModelCredentialStore restores the exact opaque ciphertext when a coordinated metadata update fails", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wanta-model-credentials-"))
  const file = path.join(dir, "model-credentials.json")
  const originalCiphertext = Buffer.from("foreign-profile-ciphertext", "utf8").toString("base64")
  await writeFile(file, JSON.stringify({ version: 1, credentials: { "model-1": originalCiphertext } }, null, 2), "utf8")
  const store = new ModelCredentialStore(dir, encryption(), "darwin")

  await assert.rejects(
    store.withCredentialUpdate("model-1", "replacement-secret", async () => {
      throw new Error("metadata write failed")
    }),
    /metadata write failed/,
  )

  const persisted = JSON.parse(await readFile(file, "utf8")) as { credentials: Record<string, string> }
  assert.equal(persisted.credentials["model-1"], originalCiphertext)
})
