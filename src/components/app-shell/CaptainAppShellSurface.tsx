import type { CaptainAppEventInput, AppShellRoute } from "./app-shell-types.ts"
import type { CaptainLifecycleSource } from "./useCaptainAppEvents.ts"

import * as React from "react"
import { CaptainAppEventBridge } from "./useCaptainAppEvents.ts"
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
  return (
    <>
      <CaptainAppEventBridge input={eventInput} lifecycleSource={lifecycleSource} />
      <CaptainHost
        route={route}
        activeSessionId={activeSessionId}
        chatIsEmpty={chatIsEmpty}
        activeProject={activeProject}
        activeTask={activeTask}
        modalOpen={modalOpen}
        viewportWidth={viewportWidth}
      />
      {children}
    </>
  )
}
