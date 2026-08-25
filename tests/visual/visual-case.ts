import type { BuiltinCrewId } from "@/domain/xingchao/types.ts"

import { storageKey } from "../../electron/branding.ts"
import { BUILTIN_CREW_IDS } from "@/domain/xingchao/types.ts"

export const VISUAL_MODES = ["stage", "companion", "compact"] as const
export const VISUAL_CONTRASTS = ["standard", "high"] as const
export const VISUAL_REDUCED_MOTION_VALUES = ["false", "true"] as const

export type VisualMode = (typeof VISUAL_MODES)[number]
export type VisualContrast = (typeof VISUAL_CONTRASTS)[number]

export interface VisualCase {
  readonly crewId: BuiltinCrewId
  readonly mode: VisualMode
  readonly contrast: VisualContrast
  readonly reducedMotion: boolean
}

export type VisualCaseParseResult =
  | { readonly ok: true; readonly visualCase: VisualCase }
  | { readonly ok: false; readonly reason: string }

const EXPECTED_QUERY_KEYS = new Set(["crewId", "mode", "contrast", "reducedMotion"])
const CREW_IDS = new Set<string>(BUILTIN_CREW_IDS)
const MODES = new Set<string>(VISUAL_MODES)
const CONTRASTS = new Set<string>(VISUAL_CONTRASTS)
const REDUCED_MOTION_VALUES = new Set<string>(VISUAL_REDUCED_MOTION_VALUES)

function exactlyOne(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key)
  return values.length === 1 ? values[0]! : null
}

export function parseVisualCase(params: URLSearchParams): VisualCaseParseResult {
  if ([...params.keys()].some((key) => !EXPECTED_QUERY_KEYS.has(key))) {
    return { ok: false, reason: "unknown query key" }
  }

  const crewId = exactlyOne(params, "crewId")
  const mode = exactlyOne(params, "mode")
  const contrast = exactlyOne(params, "contrast")
  const reducedMotion = exactlyOne(params, "reducedMotion")
  if (
    crewId === null ||
    mode === null ||
    contrast === null ||
    reducedMotion === null ||
    !CREW_IDS.has(crewId) ||
    !MODES.has(mode) ||
    !CONTRASTS.has(contrast) ||
    !REDUCED_MOTION_VALUES.has(reducedMotion)
  ) {
    return { ok: false, reason: "query values must belong to the closed visual-case unions" }
  }

  return {
    ok: true,
    visualCase: {
      crewId: crewId as BuiltinCrewId,
      mode: mode as VisualMode,
      contrast: contrast as VisualContrast,
      reducedMotion: reducedMotion === "true",
    },
  }
}

export function prepareVisualEnvironment(visualCase: VisualCase): void {
  localStorage.clear()
  localStorage.setItem(storageKey("activeCrew"), visualCase.crewId)
  localStorage.setItem(storageKey("locale"), "zh-CN")
  document.documentElement.dataset.fleetContrast = visualCase.contrast
  document.documentElement.dataset.visualMode = visualCase.mode
  document.documentElement.dataset.visualReducedMotion = String(visualCase.reducedMotion)
}
