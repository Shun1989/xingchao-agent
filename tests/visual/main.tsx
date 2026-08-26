import { FROZEN_VISUAL_TIME, installDeterministicDate } from "./deterministic-date.ts"

installDeterministicDate(FROZEN_VISUAL_TIME)
Math.random = () => 0.5

function isFleetE2EAcceptance(): boolean {
  const bridge = (globalThis as typeof globalThis & { __fleetE2EBridge?: { enabled?: boolean } }).__fleetE2EBridge
  return window.location.hash === "#fleet-e2e" && bridge?.enabled === true
}

async function bootstrapVisualHarness(): Promise<void> {
  if (isFleetE2EAcceptance()) {
    const [{ createRoot }, { parseVisualCase }, { FleetSkinAcceptanceHarness }] = await Promise.all([
      import("react-dom/client"),
      import("./visual-case.ts"),
      import("../e2e/FleetSkinAcceptanceHarness.tsx"),
      import("../../src/index.css"),
    ])
    const root = document.getElementById("root")
    if (!root) throw new Error("Fleet acceptance root is missing")
    const result = parseVisualCase(new URLSearchParams(window.location.search))
    if (!result.ok) throw new Error(result.reason)
    createRoot(root).render(<FleetSkinAcceptanceHarness />)
    return
  }

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
