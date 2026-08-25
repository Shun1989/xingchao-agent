import { FROZEN_VISUAL_TIME, installDeterministicDate } from "./deterministic-date.ts"

installDeterministicDate(FROZEN_VISUAL_TIME)
Math.random = () => 0.5

async function bootstrapVisualHarness(): Promise<void> {
  const [{ createRoot }, { parseVisualCase, prepareVisualEnvironment }, { VisualCaseError, VisualHarness }] =
    await Promise.all([
      import("react-dom/client"),
      import("./visual-case.ts"),
      import("./VisualHarness.tsx"),
      import("../../src/index.css"),
      import("./visual.css"),
    ])

  const root = document.getElementById("root")
  if (!root) throw new Error("Visual harness root is missing")

  const result = parseVisualCase(new URLSearchParams(window.location.search))

  if (!result.ok) {
    createRoot(root).render(<VisualCaseError reason={result.reason} />)
  } else {
    prepareVisualEnvironment(result.visualCase)
    createRoot(root).render(<VisualHarness visualCase={result.visualCase} />)
  }
}

void bootstrapVisualHarness()
