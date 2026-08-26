import type { CaptainAppEventInput, AppShellRoute } from "./app-shell-types.ts"
import type { CaptainAppShellSurfaceProps } from "./CaptainAppShellSurface.tsx"

import * as React from "react"
import { CaptainAppShellSurface } from "./CaptainAppShellSurface.tsx"

export interface CaptainAppShellRouteContinuityProps extends Omit<
  CaptainAppShellSurfaceProps,
  "children" | "eventInput" | "route"
> {
  readonly eventInput: CaptainAppEventInput
  readonly persistentChildren?: React.ReactNode
  readonly route: AppShellRoute
  readonly settingsChildren: React.ReactNode
  readonly workspaceChildren: React.ReactNode
}

/** Keeps the Captain owner outside AppShell's workspace/settings branch replacement. */
export function CaptainAppShellRouteContinuity({
  eventInput,
  persistentChildren,
  route,
  settingsChildren,
  workspaceChildren,
  ...surfaceProps
}: CaptainAppShellRouteContinuityProps) {
  return (
    <CaptainAppShellSurface {...surfaceProps} eventInput={{ ...eventInput, route }} route={route}>
      {persistentChildren}
      {route === "settings" ? settingsChildren : workspaceChildren}
    </CaptainAppShellSurface>
  )
}
