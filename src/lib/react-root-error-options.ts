import type { RootOptions } from "react-dom/client"

import { reportRendererIssue } from "./renderer-diagnostics.ts"

export type SafeRendererErrorClass = "type-error" | "range-error" | "render-error"

export function classifyRendererError(error: unknown): SafeRendererErrorClass {
  try {
    if (error instanceof TypeError) return "type-error"
    if (error instanceof RangeError) return "range-error"
  } catch {
    return "render-error"
  }
  return "render-error"
}

/** Overrides React 19's raw caught-error console path with a closed diagnostic payload. */
export function safeReactRootOptions(): RootOptions {
  return {
    onCaughtError(error) {
      try {
        const safeCause = classifyRendererError(error)
        reportRendererIssue("error", "react.caught", "react renderer caught error", safeCause)
      } catch {
        // Diagnostics must never create a second renderer failure.
      }
    },
  }
}
