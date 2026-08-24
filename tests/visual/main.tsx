import { createRoot } from "react-dom/client"
import { parseVisualCase, prepareVisualEnvironment } from "./visual-case.ts"
import { VisualCaseError, VisualHarness } from "./VisualHarness.tsx"
import "../../src/index.css"
import "./visual.css"

const root = document.getElementById("root")
if (!root) throw new Error("Visual harness root is missing")

const result = parseVisualCase(new URLSearchParams(window.location.search))

if (!result.ok) {
  createRoot(root).render(<VisualCaseError reason={result.reason} />)
} else {
  prepareVisualEnvironment(result.visualCase)
  createRoot(root).render(<VisualHarness visualCase={result.visualCase} />)
}
