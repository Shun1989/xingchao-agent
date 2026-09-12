import type { ServiceName } from "@oomol/connection"
export const Controls = "test/mission-controls" as ServiceName<{
  ClientInvokes: { retry(runId: string): Promise<void> }
}>
