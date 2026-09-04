import type { ModelCatalog } from "../../../electron/models/common.ts"

import { describe, expect, test } from "vitest"
import { hasConfiguredCustomModel, modelCatalogForRuntime } from "./useModelCatalog.ts"

const catalog = {
  builtins: [{ id: "oopilot", displayName: "Auto" }],
  customModels: [
    { id: "local-1", displayName: "Local 1", apiKeyConfigured: true },
    { id: "locked-1", displayName: "Locked 1", apiKeyConfigured: false },
  ],
  providers: [],
  selected: { kind: "builtin", id: "oopilot" },
} as unknown as ModelCatalog

describe("model catalog runtime projection", () => {
  test("counts only credentials that are currently usable", () => {
    expect(hasConfiguredCustomModel(catalog)).toBe(true)
    expect(
      hasConfiguredCustomModel({
        ...catalog,
        customModels: catalog.customModels.filter((model) => !model.apiKeyConfigured),
      }),
    ).toBe(false)
  })

  test("hides cloud models and selects a custom fallback in local mode", () => {
    expect(modelCatalogForRuntime(catalog, false)).toMatchObject({
      builtins: [],
      customModels: [{ id: "local-1" }],
      selected: { kind: "custom", id: "local-1" },
    })
  })

  test("preserves the cloud catalog in OOMOL mode", () => {
    expect(modelCatalogForRuntime(catalog, true)).toBe(catalog)
  })
})
