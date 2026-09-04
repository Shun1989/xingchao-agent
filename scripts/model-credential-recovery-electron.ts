import { app, safeStorage } from "electron"
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { ModelCredentialStore } from "../electron/models/credential-store.ts"
import { ModelsServiceImpl } from "../electron/models/node.ts"
import { ModelsStore } from "../electron/models/store.ts"

const userDataDirectory = process.env["WANTA_CREDENTIAL_SMOKE_USER_DATA"]?.trim()
const phase = process.env["WANTA_CREDENTIAL_SMOKE_PHASE"]?.trim()
if (!userDataDirectory) throw new Error("WANTA_CREDENTIAL_SMOKE_USER_DATA is required")
if (phase !== "seed" && phase !== "recover") throw new Error("WANTA_CREDENTIAL_SMOKE_PHASE must be seed or recover")

app.setPath("userData", path.resolve(userDataDirectory))

async function run(): Promise<void> {
  console.log(`[credential-smoke:${phase}] waiting for app readiness`)
  await app.whenReady()
  console.log(`[credential-smoke:${phase}] app ready`)
  assert.equal(safeStorage.isEncryptionAvailable(), true, "Electron safeStorage is unavailable")

  const credentials = new ModelCredentialStore(app.getPath("userData"), safeStorage)
  const store = new ModelsStore(app.getPath("userData"), credentials)
  const service = new ModelsServiceImpl({ store })
  const stateFile = path.join(app.getPath("userData"), "credential-smoke-state.json")
  const resultFile = path.join(app.getPath("userData"), "credential-smoke-result.json")

  if (phase === "seed") {
    console.log("[credential-smoke:seed] creating isolated model")
    const created = await service.saveCustomModel({
      providerId: "custom",
      baseUrl: "https://models.invalid/v1",
      apiKey: "dummy-seed-key",
      modelName: "credential-recovery-smoke",
    })
    const model = created.customModels[0]
    assert.ok(model)

    const credentialFile = path.join(app.getPath("userData"), "model-credentials.json")
    const persisted = JSON.parse(await readFile(credentialFile, "utf8")) as {
      version: 1
      credentials: Record<string, string>
    }
    persisted.credentials[model.id] = Buffer.from("synthetic-invalid-safe-storage-ciphertext", "utf8").toString(
      "base64",
    )
    await writeFile(credentialFile, JSON.stringify(persisted, null, 2), "utf8")

    const unavailable = (await service.listModels()).customModels[0]
    assert.equal(unavailable?.apiKeyConfigured, false)
    assert.equal(unavailable?.credentialStatus, "unavailable")
    await writeFile(stateFile, JSON.stringify({ modelId: model.id, seedStatus: unavailable.credentialStatus }), "utf8")
    console.log("[credential-smoke:seed] invalid ciphertext classified")
    return
  }

  const state = JSON.parse(await readFile(stateFile, "utf8")) as { modelId: string; seedStatus: string }
  assert.equal(state.seedStatus, "unavailable")
  const before = (await service.listModels()).customModels.find((model) => model.id === state.modelId)
  assert.equal(before?.credentialStatus, "unavailable")

  const recovered = await service.saveCustomModel({
    id: state.modelId,
    providerId: "custom",
    baseUrl: "https://models.invalid/v1",
    apiKey: "dummy-replacement-key",
    modelName: "credential-recovery-smoke",
  })
  assert.equal(recovered.customModels[0]?.credentialStatus, "configured")
  assert.equal(await credentials.get(state.modelId), "dummy-replacement-key")

  const deleted = await service.deleteCustomModel(state.modelId)
  assert.equal(deleted.customModels.length, 0)
  assert.equal(await credentials.status(state.modelId), "missing")
  await writeFile(
    resultFile,
    JSON.stringify({ before: before.credentialStatus, afterReplace: "configured", afterDelete: "missing" }),
    "utf8",
  )
  console.log("[credential-smoke:recover] replacement and deletion verified")
}

run()
  .then(() => {
    console.log(`[credential-smoke:${phase}] exiting`)
    app.exit(0)
  })
  .catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })
