import { serviceName } from "../branding.ts"
import { defineService } from "../ipc/connection.ts"

export type GitRepositoryError = "git_unavailable" | "not_repository" | "path_unavailable" | "timeout" | "unknown"

export interface GitBranchInfo {
  name: string
  current: boolean
  remote: boolean
  upstream?: string
}

export interface GitRepositoryState {
  projectId: string
  projectPath: string
  available: boolean
  branches: GitBranchInfo[]
  dirty: boolean
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  repositoryRoot?: string
  currentBranch?: string
  detachedHead?: string
  error?: GitRepositoryError
  message?: string
}

export interface GitRepositoryRequest {
  projectId: string
  path: string
}

export interface GitCheckoutBranchRequest extends GitRepositoryRequest {
  branch: string
}

export interface GitCreateBranchRequest extends GitRepositoryRequest {
  branch: string
}

export type GitService = typeof GitService
export const GitService = defineService<{
  ServerEvents: Record<string, never>
  ClientInvokes: {
    getRepositoryState(req: GitRepositoryRequest): Promise<GitRepositoryState>
    checkoutBranch(req: GitCheckoutBranchRequest): Promise<GitRepositoryState>
    createAndCheckoutBranch(req: GitCreateBranchRequest): Promise<GitRepositoryState>
  }
}>(serviceName("git-service"), {
  getRepositoryState: true,
  checkoutBranch: true,
  createAndCheckoutBranch: true,
})
