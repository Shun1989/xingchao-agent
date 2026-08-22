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

const forbiddenControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!
    return (
      (codePoint >= 0x00 && codePoint <= 0x08) ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f) ||
      codePoint === 0x7f
    )
  })

export function runtimeText(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => !forbiddenControlCharacters(value), "Runtime text contains a control character")
}
