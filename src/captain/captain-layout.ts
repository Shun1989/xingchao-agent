import type { CaptainDisplayMode } from "./captain-types.ts"
import type { AppShellRoute } from "@/components/app-shell/app-shell-types.ts"

export type CaptainWorkspaceMode = "stage" | "deck" | "compact"

export interface CaptainLayoutRequest {
  readonly route: AppShellRoute
  readonly viewportWidth: number
  readonly activeSessionId: string | null
  readonly chatIsEmpty: boolean
  readonly activeProject: boolean
  readonly activeTask: boolean
  readonly modalOpen: boolean
}

export interface CaptainLayoutDecision {
  readonly workspaceMode: CaptainWorkspaceMode
  readonly displayMode: CaptainDisplayMode
  readonly minWidth: number
  readonly maxWidth: number
  readonly integrated: boolean
  readonly reservesContent: boolean
}

const stageRoutes = new Set<AppShellRoute>(["fleet", "voyage"])
const deckRoutes = new Set<AppShellRoute>(["connections", "skills"])

export const compactCaptainLayout = Object.freeze({
  workspaceMode: "compact",
  displayMode: "compact",
  minWidth: 0,
  maxWidth: 72,
  integrated: false,
  reservesContent: false,
} satisfies CaptainLayoutDecision)

export const deckCaptainLayout = Object.freeze({
  workspaceMode: "deck",
  displayMode: "companion",
  minWidth: 240,
  maxWidth: 300,
  integrated: false,
  reservesContent: true,
} satisfies CaptainLayoutDecision)

const stageCaptainLayout = Object.freeze({
  workspaceMode: "stage",
  displayMode: "stage",
  minWidth: 360,
  maxWidth: 560,
  integrated: true,
  reservesContent: false,
} satisfies CaptainLayoutDecision)

export function resolveCaptainWorkspaceLayout({
  activeProject,
  activeTask,
  chatIsEmpty,
  modalOpen,
  route,
  viewportWidth,
}: CaptainLayoutRequest): CaptainLayoutDecision {
  if (modalOpen || route === "settings") return compactCaptainLayout

  const activeChatContext = route === "chat" && (activeProject || activeTask || !chatIsEmpty)
  const stage = stageRoutes.has(route) || (route === "chat" && chatIsEmpty && !activeProject && !activeTask)
  if (stage && viewportWidth >= 1280) return stageCaptainLayout
  if ((deckRoutes.has(route) || activeChatContext) && viewportWidth >= 1180) return deckCaptainLayout
  return compactCaptainLayout
}
