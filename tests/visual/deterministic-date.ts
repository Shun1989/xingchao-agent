export const FROZEN_VISUAL_TIME = Date.parse("2026-08-23T08:00:00+08:00")

/** Installs the test-only clock before the visual application graph is imported. */
export function installDeterministicDate(frozenTime: number): void {
  const NativeDate = globalThis.Date

  function DeterministicDate(...args: unknown[]): Date | string {
    if (!new.target) return new NativeDate(frozenTime).toString()
    return Reflect.construct(NativeDate, args.length === 0 ? [frozenTime] : args, new.target)
  }

  Object.setPrototypeOf(DeterministicDate, NativeDate)
  Object.defineProperty(DeterministicDate, "prototype", {
    configurable: false,
    value: NativeDate.prototype,
    writable: false,
  })
  Object.defineProperty(DeterministicDate, "now", {
    configurable: true,
    value: () => frozenTime,
    writable: true,
  })
  globalThis.Date = DeterministicDate as unknown as DateConstructor
}
