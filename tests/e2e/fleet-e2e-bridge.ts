export interface FleetE2EBridge {
  readonly enabled: true
  failRequiredAsset: boolean
  readonly failureHits: string[]
  readonly initialStoredCrew: string | null
  readonly lifecycle: string[]
}

export function acceptanceBridge(): FleetE2EBridge | null {
  const bridge = (globalThis as typeof globalThis & { __fleetE2EBridge?: FleetE2EBridge }).__fleetE2EBridge
  return bridge?.enabled === true ? bridge : null
}

export function isFleetE2EAcceptance(): boolean {
  return window.location.hash === "#fleet-e2e" && acceptanceBridge() !== null
}
