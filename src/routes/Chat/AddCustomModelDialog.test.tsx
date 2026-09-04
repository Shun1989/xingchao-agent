// @vitest-environment happy-dom

import type { CustomModelSummary } from "../../../electron/models/common.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AddCustomModelDialog } from "./AddCustomModelDialog.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const unavailableModel: CustomModelSummary = {
  id: "custom-1",
  providerId: "custom",
  providerName: "Custom",
  baseUrl: "https://models.example.test/v1",
  modelName: "example-model",
  displayName: "Example Model",
  apiKeyConfigured: false,
  credentialStatus: "unavailable",
  supportsImages: false,
  supportsToolCalls: true,
}

const roots: Array<ReturnType<typeof createRoot>> = []

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  vi.clearAllMocks()
})

describe("AddCustomModelDialog", () => {
  it("requires and explains replacement when the saved API key cannot be unlocked", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)

    await act(async () => {
      root.render(
        <I18nContext.Provider
          value={{ locale: "en", setLocale: () => undefined, t: (key, vars) => translate("en", key, vars) }}
        >
          <AddCustomModelDialog
            model={unavailableModel}
            open
            providers={[]}
            error={null}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        </I18nContext.Provider>,
      )
    })

    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Save",
    )
    expect(document.body.textContent).toContain(
      "The saved API key cannot be unlocked for this operating-system account. Enter a new API key to replace it.",
    )
    expect(save?.disabled).toBe(true)

    const input = document.querySelector<HTMLInputElement>('input[type="password"]')
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    await act(async () => {
      if (!input || !setValue) return
      setValue.call(input, "replacement-secret")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    expect(save?.disabled).toBe(false)
  })
})
