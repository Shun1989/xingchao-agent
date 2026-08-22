import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

describe("content-pack JSON Schema limits", () => {
  it("publishes the same inventory and prompt-text limits as runtime validation", async () => {
    const schema = JSON.parse(await readFile("schemas/content-pack-manifest.v1.schema.json", "utf8"))

    expect(schema.properties.crews.maxItems).toBe(25)
    expect(schema.properties.agents.maxItems).toBe(150)
    expect(schema.properties.themes.maxItems).toBe(25)
    expect(schema.$defs.longText.maxLength).toBe(1_000)
    expect(schema.$defs.shortText.maxLength).toBe(160)
    expect(new RegExp(schema.$defs.shortText.pattern).test("trusted\u0000override")).toBe(false)
    expect(schema.$defs.crew.properties.routingSignals.maxItems).toBe(32)
    expect(schema.$defs.crew.properties.standardWorkflow.maxItems).toBe(16)
    expect(schema.$defs.professional.properties.capabilities.maxItems).toBe(32)
    expect(schema.$defs.professional.properties.deliverables.maxItems).toBe(16)
  })
})
