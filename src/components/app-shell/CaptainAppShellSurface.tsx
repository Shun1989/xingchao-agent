import type { CaptainAppEventInput, AppShellRoute } from "./app-shell-types.ts"
import type { CaptainLifecycleSource } from "./useCaptainAppEvents.ts"

import * as React from "react"
import { CaptainAppEventBridge } from "./useCaptainAppEvents.ts"
import { resolveCaptainWorkspaceLayout } from "@/captain/captain-layout.ts"
import { CaptainHost } from "@/components/captain/CaptainHost.tsx"

export interface CaptainAppShellSurfaceProps {
  readonly activeProject: boolean
  readonly activeSessionId: string | null
  readonly activeTask: boolean
  readonly chatIsEmpty: boolean
  readonly children: React.ReactNode
  readonly eventInput: CaptainAppEventInput
  readonly lifecycleSource: CaptainLifecycleSource
  readonly modalOpen: boolean
  readonly route: AppShellRoute
  readonly viewportWidth?: number
}

const fleetContrastMediaQueries = ["(prefers-contrast: more)", "(forced-colors: active)"] as const

function useFleetContrastPreference(): void {
  React.useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.fleetContrast
    const preferences = fleetContrastMediaQueries.map((query) => window.matchMedia(query))
    const apply = () => {
      root.dataset.fleetContrast = preferences.some((preference) => preference.matches) ? "high" : "standard"
    }
    apply()
    for (const preference of preferences) preference.addEventListener("change", apply)
    return () => {
      for (const preference of preferences) preference.removeEventListener("change", apply)
      if (previous === undefined) delete root.dataset.fleetContrast
      else root.dataset.fleetContrast = previous
    }
  }, [])
}

function useViewportWidth(override: number | undefined): number {
  const [width, setWidth] = React.useState(() => override ?? globalThis.window?.innerWidth ?? 1024)
  React.useEffect(() => {
    if (override !== undefined) {
      setWidth(override)
      return
    }
    const update = () => setWidth(window.innerWidth)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [override])
  return width
}

/** The single production seam joining AppShell route content to the global Captain owner. */
export function CaptainAppShellSurface({
  activeProject,
  activeSessionId,
  activeTask,
  chatIsEmpty,
  children,
  eventInput,
  lifecycleSource,
  modalOpen,
  route,
  viewportWidth,
}: CaptainAppShellSurfaceProps) {
  useFleetContrastPreference()
  const width = useViewportWidth(viewportWidth)
  const decision = resolveCaptainWorkspaceLayout({
    activeProject,
    activeSessionId,
    activeTask,
    chatIsEmpty,
    modalOpen,
    route,
    viewportWidth: width,
  })
  return (
    <>
      <CaptainAppEventBridge input={eventInput} lifecycleSource={lifecycleSource} />
      <CaptainHost decision={decision} />
      {children}
    </>
  )
}
