export async function routeMissionRetry(
  deps: { list(): Promise<Array<{ sessionId?: string; userMessageId?: string }>>; openHistory(): void },
  sessionId: string,
  userMessageId: string,
  missionTurn = false,
): Promise<boolean> {
  if (missionTurn) {
    deps.openHistory()
    return true
  }
  const runs = await deps.list()
  if (!runs.some((run) => run.sessionId === sessionId && (!run.userMessageId || run.userMessageId === userMessageId)))
    return false
  deps.openHistory()
  return true
}
