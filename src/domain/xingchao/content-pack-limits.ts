import { z } from "zod"

export const CONTENT_PACK_LIMITS = {
  shortText: 160,
  longText: 1_000,
  signalText: 80,
  deliverableText: 240,
  packCrews: 25,
  packAgents: 150,
  packThemes: 25,
  signals: 32,
  workflowSteps: 16,
  capabilities: 32,
  deliverables: 16,
} as const

const forbiddenControlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

export function runtimeText(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => !forbiddenControlCharacters.test(value), "Runtime text contains a control character")
}
