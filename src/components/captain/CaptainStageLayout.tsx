import type { CaptainLayoutDecision } from "@/captain/captain-layout.ts"
import type { ReactNode } from "react"

export interface CaptainStageLayoutProps {
  readonly captain: ReactNode
  readonly children: ReactNode
  readonly decision: CaptainLayoutDecision
}

/** Stable composition boundary: CSS changes modes while both React subtrees retain identity. */
export function CaptainStageLayout({ captain, children, decision }: CaptainStageLayoutProps) {
  return (
    <div className="captain-stage-layout" data-captain-stage-layout data-workspace-mode={decision.workspaceMode}>
      <div
        className="captain-stage-layout__content"
        data-captain-content
        data-captain-reserved={String(decision.reservesContent)}
      >
        {children}
      </div>
      <div className="captain-stage-layout__slot" data-captain-host-slot>
        {captain}
      </div>
    </div>
  )
}
