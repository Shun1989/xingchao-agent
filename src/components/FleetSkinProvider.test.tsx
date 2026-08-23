// @vitest-environment happy-dom

import type { RuntimeFleetContextValue } from "./runtime-fleet-context.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { storageKey } from "../../electron/branding.ts"
import { useFleetSkin } from "./fleet-skin-context.ts"
import { FleetSkinProvider } from "./FleetSkinProvider.tsx"
import { RuntimeFleetContext } from "./runtime-fleet-context.ts"
import { originalFleetPack } from "@/domain/xingchao/content-pack.ts"
import { buildRuntimeContentCatalog } from "@/domain/xingchao/runtime-catalog.ts"
import {
  builtinRuntimeFleetIndex,
  builtinRuntimeFleetSnapshot,
  indexRuntimeFleet,
  projectRuntimeFleetCatalog,
} from "@/domain/xingchao/runtime-fleet.ts"
import { fleetSkinAssetUrl } from "@/skins/fleet-skin-assets.ts"
import { beginFleetSkinSwitch } from "@/skins/fleet-skin-switch.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []
const activeCrewStorageKey = storageKey("activeCrew")
const builtinRuntimeFleetContext: RuntimeFleetContextValue = {
  snapshot: builtinRuntimeFleetSnapshot,
  index: builtinRuntimeFleetIndex,
  status: "ready",
  error: null,
}

function builtinRuntimeFleetContextWithStatus(status: RuntimeFleetContextValue["status"]): RuntimeFleetContextValue {
  return {
    ...builtinRuntimeFleetContext,
    status,
    error: status === "fallback" ? "runtime fleet unavailable" : null,
  }
}

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (cause?: unknown) => void
}

function deferred(): Deferred {
  let resolve!: () => void
  let reject!: (cause?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function importedRuntimeFleetContext(packId = "aurora-pack"): RuntimeFleetContextValue {
  const pack = structuredClone({ ...originalFleetPack, id: packId, visibility: "private-local" as const })
  const watchtide = pack.crews[0]!
  watchtide.theme.primary = "#123456"
  pack.themes.find((theme) => theme.id === watchtide.theme.id)!.primary = "#123456"
  const snapshot = projectRuntimeFleetCatalog(buildRuntimeContentCatalog(originalFleetPack, [pack]))
  return { snapshot, index: indexRuntimeFleet(snapshot), status: "ready", error: null }
}

function Probe({ requestAfterCommit }: { requestAfterCommit?: { from: string; to: string } }) {
  const fleetSkin = useFleetSkin()
  const followupRequestedRef = React.useRef(false)
  React.useLayoutEffect(() => {
    if (
      requestAfterCommit &&
      !followupRequestedRef.current &&
      fleetSkin.phase === "committed" &&
      fleetSkin.activeCrewId === requestAfterCommit.from
    ) {
      followupRequestedRef.current = true
      fleetSkin.requestCrew(requestAfterCommit.to)
    }
  }, [fleetSkin, requestAfterCommit])
  return (
    <div>
      <output data-testid="active">{fleetSkin.activeCrewId}</output>
      <output data-testid="skin">{fleetSkin.skin?.identity.crewId ?? "none"}</output>
      <output data-testid="phase">{fleetSkin.phase}</output>
      <output data-testid="pending">{fleetSkin.pendingCrewId ?? "none"}</output>
      <output data-testid="error">{fleetSkin.error ?? "none"}</output>
      <button type="button" onClick={() => fleetSkin.requestCrew("ink-sail")}>
        ink
      </button>
      <button type="button" onClick={() => fleetSkin.requestCrew("forge-vessel")}>
        forge
      </button>
      <button type="button" onClick={() => fleetSkin.requestCrew("aurora-pack--watchtide")}>
        imported
      </button>
      <button type="button" onClick={() => fleetSkin.preloadCrew("ink-sail")}>
        preload
      </button>
      <button type="button" onClick={fleetSkin.retry}>
        retry
      </button>
    </div>
  )
}

function text(host: HTMLElement, testId: string): string | null {
  return host.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null
}

function requiredAssetUrls(crewId: string): string[] {
  return beginFleetSkinSwitch(crewId, 1)
    .required.filter((resourceId) => !resourceId.startsWith("font:"))
    .map((assetId) => fleetSkinAssetUrl(assetId as Parameters<typeof fleetSkinAssetUrl>[0]))
}

async function renderProvider({
  runtimeFleet = builtinRuntimeFleetContext,
  loadAsset,
  strict = false,
  requestAfterCommit,
}: {
  runtimeFleet?: RuntimeFleetContextValue
  loadAsset: (url: string) => Promise<void>
  strict?: boolean
  requestAfterCommit?: { from: string; to: string }
}) {
  const host = document.createElement("div")
  const root = createRoot(host)
  roots.push(root)
  const render = async (value: RuntimeFleetContextValue) => {
    const provider = (
      <RuntimeFleetContext.Provider value={value}>
        <FleetSkinProvider loadAsset={loadAsset}>
          <Probe requestAfterCommit={requestAfterCommit} />
        </FleetSkinProvider>
      </RuntimeFleetContext.Provider>
    )
    await act(async () => {
      root.render(strict ? <React.StrictMode>{provider}</React.StrictMode> : provider)
    })
  }
  await render(runtimeFleet)
  return { host, root, rerender: render }
}

async function click(host: HTMLElement, label: string): Promise<void> {
  const button = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === label)
  await act(async () => button!.click())
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute("data-crew")
  document.documentElement.removeAttribute("data-fleet-skin")
  document.documentElement.removeAttribute("style")
})

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  localStorage.clear()
  document.documentElement.removeAttribute("data-crew")
  document.documentElement.removeAttribute("data-fleet-skin")
  document.documentElement.removeAttribute("style")
})

describe("FleetSkinProvider", () => {
  it("keeps the old root and storage until every required asset resolves, then commits the complete skin together", async () => {
    const loads = new Map<string, Deferred>()
    const { host } = await renderProvider({
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })
    const originalPrimary = document.documentElement.style.getPropertyValue("--xingchao-primary")

    await click(host, "ink")
    expect(text(host, "phase")).toBe("loading")
    expect(text(host, "pending")).toBe("ink-sail")
    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBeNull()

    const required = requiredAssetUrls("ink-sail")
    for (const url of required.slice(0, -1)) {
      await act(async () => loads.get(url)!.resolve())
      expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
      expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe(originalPrimary)
      expect(localStorage.getItem(activeCrewStorageKey)).toBeNull()
    }

    const committedSnapshots: string[] = []
    const observer = new MutationObserver(() => {
      committedSnapshots.push(
        `${document.documentElement.dataset.fleetSkin}:${document.documentElement.style.getPropertyValue("--xingchao-primary")}:${document.documentElement.style.getPropertyValue("--fleet-scene-backdrop")}`,
      )
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-fleet-skin"] })
    await act(async () => loads.get(required.at(-1)!)!.resolve())
    observer.disconnect()

    expect(text(host, "active")).toBe("ink-sail")
    expect(text(host, "skin")).toBe("ink-sail")
    expect(document.documentElement.dataset.fleetSkin).toBe("ink-sail")
    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#8B3444")
    expect(document.documentElement.style.getPropertyValue("--fleet-surface-card-material")).toBe("paper")
    expect(document.documentElement.style.getPropertyValue("--fleet-scene-backdrop")).toContain(
      fleetSkinAssetUrl("ink-sail.scene.backdrop"),
    )
    expect(new Set(committedSnapshots)).toEqual(
      new Set([`ink-sail:#8B3444:url("${fleetSkinAssetUrl("ink-sail.scene.backdrop")}")`]),
    )
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("ink-sail")
  })

  it("rolls back a required failure and retries through the same transactional path", async () => {
    const attempts = new Map<string, Deferred[]>()
    const { host } = await renderProvider({
      loadAsset: (url) => {
        const load = deferred()
        attempts.set(url, [...(attempts.get(url) ?? []), load])
        return load.promise
      },
    })

    await click(host, "ink")
    const backdropUrl = fleetSkinAssetUrl("ink-sail.scene.backdrop")
    await act(async () => attempts.get(backdropUrl)![0]!.reject(new Error("decode failed")))

    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBeNull()
    expect(text(host, "phase")).toBe("error")
    expect(text(host, "error")).toContain("皮肤资源加载失败")
    expect(text(host, "error")).toContain("重试")

    await click(host, "retry")
    for (const url of requiredAssetUrls("ink-sail")) {
      const currentAttempt = attempts.get(url)!.at(-1)!
      await act(async () => currentAttempt.resolve())
    }

    expect(document.documentElement.dataset.fleetSkin).toBe("ink-sail")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("ink-sail")
    expect(text(host, "error")).toBe("none")
  })

  it("lets only the latest request commit when older loads finish late", async () => {
    const loads = new Map<string, Deferred>()
    const { host } = await renderProvider({
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })

    await click(host, "ink")
    await click(host, "forge")
    for (const url of requiredAssetUrls("ink-sail")) await act(async () => loads.get(url)!.resolve())

    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBeNull()
    expect(text(host, "pending")).toBe("forge-vessel")

    for (const url of requiredAssetUrls("forge-vessel")) await act(async () => loads.get(url)!.resolve())

    expect(document.documentElement.dataset.fleetSkin).toBe("forge-vessel")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("forge-vessel")
  })

  it("commits without a failed optional foreground and leaves no broken foreground variable", async () => {
    const loads = new Map<string, Deferred>()
    const { host } = await renderProvider({
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })

    await click(host, "ink")
    await act(async () => loads.get(fleetSkinAssetUrl("ink-sail.scene.foreground"))!.reject(new Error("optional")))
    for (const url of requiredAssetUrls("ink-sail")) await act(async () => loads.get(url)!.resolve())

    expect(document.documentElement.dataset.fleetSkin).toBe("ink-sail")
    expect(document.documentElement.style.getPropertyValue("--fleet-scene-foreground")).toBe("")
  })

  it("preloads a built-in crew without selecting or persisting it", async () => {
    const loadAsset = vi.fn(() => new Promise<void>(() => undefined))
    const { host } = await renderProvider({ loadAsset })

    await click(host, "preload")

    expect(loadAsset).toHaveBeenCalled()
    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "pending")).toBe("none")
    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBeNull()
  })

  it("restores a stored built-in crew only after its required resources become ready", async () => {
    localStorage.setItem(activeCrewStorageKey, "phantom-wave")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    document.documentElement.style.setProperty("--xingchao-primary", "#abcdef")
    const loads = new Map<string, Deferred>()
    const loadAsset = vi.fn((url: string) => {
      const load = deferred()
      loads.set(url, load)
      return load.promise
    })
    const { host } = await renderProvider({ loadAsset })

    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "phase")).toBe("loading")
    expect(document.documentElement.dataset.fleetSkin).toBe("previous-shell")
    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#abcdef")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("phantom-wave")
    expect(loadAsset).toHaveBeenCalled()

    await act(async () => loads.get(fleetSkinAssetUrl("phantom-wave.scene.foreground"))!.resolve())
    const required = requiredAssetUrls("phantom-wave")
    for (const url of required.slice(0, -1)) await act(async () => loads.get(url)!.resolve())
    expect(document.documentElement.dataset.fleetSkin).toBe("previous-shell")
    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#abcdef")

    const committedSnapshots: string[] = []
    const observer = new MutationObserver(() => {
      committedSnapshots.push(
        `${document.documentElement.dataset.fleetSkin}:${document.documentElement.style.getPropertyValue("--xingchao-primary")}`,
      )
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-fleet-skin"] })
    await act(async () => loads.get(required.at(-1)!)!.resolve())
    observer.disconnect()
    expect(text(host, "active")).toBe("phantom-wave")
    expect(text(host, "skin")).toBe("phantom-wave")
    expect(document.documentElement.dataset.fleetSkin).toBe("phantom-wave")
    expect(new Set(committedSnapshots)).toEqual(new Set(["phantom-wave:#7257D8"]))
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("phantom-wave")
  })

  it("keeps the startup surface intact when stored skin readiness fails and retries successfully", async () => {
    localStorage.setItem(activeCrewStorageKey, "phantom-wave")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    document.documentElement.style.setProperty("--xingchao-primary", "#abcdef")
    const attempts = new Map<string, Deferred[]>()
    const { host } = await renderProvider({
      loadAsset: (url) => {
        const load = deferred()
        attempts.set(url, [...(attempts.get(url) ?? []), load])
        return load.promise
      },
    })
    const backdropUrl = fleetSkinAssetUrl("phantom-wave.scene.backdrop")

    await act(async () => attempts.get(backdropUrl)![0]!.reject(new Error("boot decode")))
    expect(text(host, "phase")).toBe("error")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "error")).toContain("皮肤资源加载失败")
    expect(document.documentElement.dataset.fleetSkin).toBe("previous-shell")
    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#abcdef")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("phantom-wave")

    await click(host, "retry")
    await act(async () => attempts.get(fleetSkinAssetUrl("phantom-wave.scene.foreground"))!.at(-1)!.resolve())
    for (const url of requiredAssetUrls("phantom-wave")) {
      await act(async () => attempts.get(url)!.at(-1)!.resolve())
    }
    expect(document.documentElement.dataset.fleetSkin).toBe("phantom-wave")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("phantom-wave")
  })

  it("replaces boot target A with built-in B and releases the gate only when B commits", async () => {
    localStorage.setItem(activeCrewStorageKey, "phantom-wave")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    const loads = new Map<string, Deferred>()
    const { host } = await renderProvider({
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })

    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "pending")).toBe("phantom-wave")
    await click(host, "forge")
    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "pending")).toBe("forge-vessel")

    await act(async () => loads.get(fleetSkinAssetUrl("phantom-wave.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("phantom-wave")) await act(async () => loads.get(url)!.resolve())
    expect(document.documentElement.dataset.fleetSkin).toBe("previous-shell")

    await act(async () => loads.get(fleetSkinAssetUrl("forge-vessel.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("forge-vessel")) await act(async () => loads.get(url)!.resolve())

    expect(text(host, "active")).toBe("forge-vessel")
    expect(text(host, "skin")).toBe("forge-vessel")
    expect(document.documentElement.dataset.fleetSkin).toBe("forge-vessel")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("forge-vessel")
  })

  it("keeps the fallback behind failed replacement B and retries B instead of boot target A", async () => {
    localStorage.setItem(activeCrewStorageKey, "phantom-wave")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    const attempts = new Map<string, Deferred[]>()
    const { host } = await renderProvider({
      loadAsset: (url) => {
        const load = deferred()
        attempts.set(url, [...(attempts.get(url) ?? []), load])
        return load.promise
      },
    })

    await click(host, "forge")
    const forgeBackdrop = fleetSkinAssetUrl("forge-vessel.scene.backdrop")
    await act(async () => attempts.get(forgeBackdrop)!.at(-1)!.reject(new Error("replacement failed")))

    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "phase")).toBe("error")
    expect(text(host, "error")).toContain("皮肤资源加载失败")
    expect(document.documentElement.dataset.fleetSkin).toBe("previous-shell")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("phantom-wave")

    await click(host, "retry")
    await act(async () => attempts.get(fleetSkinAssetUrl("forge-vessel.scene.foreground"))!.at(-1)!.resolve())
    for (const url of requiredAssetUrls("forge-vessel")) {
      await act(async () => attempts.get(url)!.at(-1)!.resolve())
    }

    expect(text(host, "active")).toBe("forge-vessel")
    expect(document.documentElement.dataset.fleetSkin).toBe("forge-vessel")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("forge-vessel")
  })

  it("cancels built-in boot for an imported crew and ignores every late boot completion", async () => {
    localStorage.setItem(activeCrewStorageKey, "phantom-wave")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    const loads = new Map<string, Deferred>()
    const loadAsset = vi.fn((url: string) => {
      const load = deferred()
      loads.set(url, load)
      return load.promise
    })
    const { host } = await renderProvider({ runtimeFleet: importedRuntimeFleetContext(), loadAsset })

    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "pending")).toBe("phantom-wave")
    await click(host, "imported")

    expect(text(host, "active")).toBe("aurora-pack--watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "pending")).toBe("none")
    expect(text(host, "error")).toBe("none")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#123456")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")
    expect(loadAsset.mock.calls.every(([url]) => String(url).includes("/phantom-wave/"))).toBe(true)

    await act(async () => loads.get(fleetSkinAssetUrl("phantom-wave.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("phantom-wave")) await act(async () => loads.get(url)!.resolve())

    expect(text(host, "active")).toBe("aurora-pack--watchtide")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")

    await click(host, "forge")
    expect(text(host, "active")).toBe("aurora-pack--watchtide")
    expect(text(host, "pending")).toBe("forge-vessel")
    await act(async () => loads.get(fleetSkinAssetUrl("forge-vessel.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("forge-vessel")) await act(async () => loads.get(url)!.resolve())

    expect(text(host, "active")).toBe("forge-vessel")
    expect(text(host, "error")).toBe("none")
    expect(document.documentElement.dataset.fleetSkin).toBe("forge-vessel")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("forge-vessel")
  })

  it("recovers through the trusted built-in when an imported authority disappears during boot", async () => {
    localStorage.setItem(activeCrewStorageKey, "phantom-wave")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    const loads = new Map<string, Deferred>()
    const { host, rerender } = await renderProvider({
      runtimeFleet: importedRuntimeFleetContext(),
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })
    await click(host, "imported")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")

    await rerender(builtinRuntimeFleetContext)
    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "pending")).toBe("watchtide")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")

    await act(async () => loads.get(fleetSkinAssetUrl("phantom-wave.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("phantom-wave")) await act(async () => loads.get(url)!.resolve())
    expect(text(host, "pending")).toBe("watchtide")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")

    await act(async () => loads.get(fleetSkinAssetUrl("watchtide.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("watchtide")) await act(async () => loads.get(url)!.resolve())

    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("watchtide")
    expect(text(host, "phase")).toBe("idle")
    expect(text(host, "pending")).toBe("none")
    expect(text(host, "error")).toBe("none")
    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("watchtide")
  })

  it("retries the trusted built-in when imported disappearance recovery fails", async () => {
    localStorage.setItem(activeCrewStorageKey, "phantom-wave")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    const attempts = new Map<string, Deferred[]>()
    const { host, rerender } = await renderProvider({
      runtimeFleet: importedRuntimeFleetContext(),
      loadAsset: (url) => {
        const load = deferred()
        attempts.set(url, [...(attempts.get(url) ?? []), load])
        return load.promise
      },
    })
    await click(host, "imported")
    await rerender(builtinRuntimeFleetContext)

    const fallbackBackdrop = fleetSkinAssetUrl("watchtide.scene.backdrop")
    await act(async () => attempts.get(fallbackBackdrop)!.at(-1)!.reject(new Error("fallback failed")))
    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "phase")).toBe("error")
    expect(text(host, "error")).toContain("皮肤资源加载失败")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")

    await act(async () => attempts.get(fleetSkinAssetUrl("phantom-wave.scene.foreground"))!.at(-1)!.resolve())
    for (const url of requiredAssetUrls("phantom-wave")) {
      await act(async () => attempts.get(url)!.at(-1)!.resolve())
    }
    expect(text(host, "phase")).toBe("error")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")

    await click(host, "retry")
    await act(async () => attempts.get(fleetSkinAssetUrl("watchtide.scene.foreground"))!.at(-1)!.resolve())
    for (const url of requiredAssetUrls("watchtide")) {
      await act(async () => attempts.get(url)!.at(-1)!.resolve())
    }
    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("watchtide")
    expect(text(host, "phase")).toBe("idle")
    expect(text(host, "error")).toBe("none")
    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("watchtide")
  })

  it("gates fallback recovery when an active imported crew disappears outside boot", async () => {
    const loads = new Map<string, Deferred>()
    const { host, rerender } = await renderProvider({
      runtimeFleet: importedRuntimeFleetContext(),
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })
    await click(host, "imported")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")

    await rerender(builtinRuntimeFleetContext)
    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "pending")).toBe("watchtide")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")

    await act(async () => loads.get(fleetSkinAssetUrl("watchtide.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("watchtide")) await act(async () => loads.get(url)!.resolve())
    expect(text(host, "skin")).toBe("watchtide")
    expect(text(host, "phase")).toBe("idle")
    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("watchtide")
  })

  it("keeps a restored imported selection persisted until its fallback recovery commits", async () => {
    localStorage.setItem(activeCrewStorageKey, "aurora-pack--watchtide")
    const loads = new Map<string, Deferred>()
    const { host, rerender } = await renderProvider({
      runtimeFleet: importedRuntimeFleetContext(),
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })
    expect(text(host, "active")).toBe("aurora-pack--watchtide")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")

    await rerender(builtinRuntimeFleetContext)
    expect(text(host, "active")).toBe("watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(text(host, "pending")).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")

    await act(async () => loads.get(fleetSkinAssetUrl("watchtide.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("watchtide")) await act(async () => loads.get(url)!.resolve())
    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("watchtide")
  })

  it("keeps imported authority through a transient built-in-only loading snapshot", async () => {
    const loadAsset = vi.fn(async () => undefined)
    const imported = importedRuntimeFleetContext()
    const { host, rerender } = await renderProvider({ runtimeFleet: imported, loadAsset, strict: true })
    await click(host, "imported")

    expect(text(host, "active")).toBe("aurora-pack--watchtide")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")

    await rerender(builtinRuntimeFleetContextWithStatus("loading"))
    expect(text(host, "active")).toBe("aurora-pack--watchtide")
    expect(text(host, "pending")).toBe("none")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")
    expect(loadAsset).not.toHaveBeenCalled()

    await rerender(imported)
    expect(text(host, "active")).toBe("aurora-pack--watchtide")
    expect(text(host, "pending")).toBe("none")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")
    expect(loadAsset).not.toHaveBeenCalled()
  })

  it.each(["ready", "fallback"] as const)(
    "recovers an imported authority once after a stable %s built-in-only snapshot",
    async (stableStatus) => {
      const loads = new Map<string, Deferred>()
      const loadAsset = vi.fn((url: string) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      })
      const { host, rerender } = await renderProvider({
        runtimeFleet: importedRuntimeFleetContext(),
        loadAsset,
        strict: true,
      })
      await click(host, "imported")

      await rerender(builtinRuntimeFleetContextWithStatus("loading"))
      expect(text(host, "active")).toBe("aurora-pack--watchtide")
      expect(text(host, "pending")).toBe("none")
      expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
      expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")
      expect(loadAsset).not.toHaveBeenCalled()

      await rerender(builtinRuntimeFleetContextWithStatus(stableStatus))
      expect(text(host, "active")).toBe("watchtide")
      expect(text(host, "skin")).toBe("none")
      expect(text(host, "pending")).toBe("watchtide")
      expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
      expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")
      expect(
        loadAsset.mock.calls.filter(([url]) => url === fleetSkinAssetUrl("watchtide.scene.backdrop")),
      ).toHaveLength(1)
      expect(loadAsset.mock.calls.every(([url]) => url.includes("/watchtide/"))).toBe(true)

      await act(async () => loads.get(fleetSkinAssetUrl("watchtide.scene.foreground"))!.resolve())
      for (const url of requiredAssetUrls("watchtide")) await act(async () => loads.get(url)!.resolve())

      expect(text(host, "active")).toBe("watchtide")
      expect(text(host, "skin")).toBe("watchtide")
      expect(text(host, "phase")).toBe("idle")
      expect(text(host, "pending")).toBe("none")
      expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
      expect(localStorage.getItem(activeCrewStorageKey)).toBe("watchtide")
      expect(
        loadAsset.mock.calls.filter(([url]) => url === fleetSkinAssetUrl("watchtide.scene.backdrop")),
      ).toHaveLength(1)
    },
  )

  it("recovers corrupted persisted selection to watchtide and removes the bad value", async () => {
    localStorage.setItem(activeCrewStorageKey, "../remote-skin")
    const { host } = await renderProvider({ loadAsset: vi.fn(async () => undefined) })

    expect(text(host, "active")).toBe("watchtide")
    expect(document.documentElement.dataset.fleetSkin).toBe("watchtide")
    expect(localStorage.getItem(activeCrewStorageKey)).toBeNull()
  })

  it("uses the renderer-safe legacy palette for an imported crew without activating skin assets", async () => {
    const loadAsset = vi.fn(async () => undefined)
    const { host } = await renderProvider({ runtimeFleet: importedRuntimeFleetContext(), loadAsset })

    await click(host, "imported")

    expect(text(host, "active")).toBe("aurora-pack--watchtide")
    expect(text(host, "skin")).toBe("none")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(document.documentElement.style.getPropertyValue("--xingchao-primary")).toBe("#123456")
    expect(document.documentElement.style.getPropertyValue("--fleet-scene-backdrop")).toBe("")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")
    expect(loadAsset).not.toHaveBeenCalled()
  })

  it("persists commit A even when a layout-triggered request B fails before A's passive effect", async () => {
    const loads = new Map<string, Deferred>()
    const { host } = await renderProvider({
      requestAfterCommit: { from: "ink-sail", to: "forge-vessel" },
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })

    await click(host, "ink")
    await act(async () => loads.get(fleetSkinAssetUrl("ink-sail.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("ink-sail")) await act(async () => loads.get(url)!.resolve())
    await act(async () =>
      loads.get(fleetSkinAssetUrl("forge-vessel.scene.backdrop"))!.reject(new Error("request B failed")),
    )

    expect(document.documentElement.dataset.fleetSkin).toBe("ink-sail")
    expect(text(host, "phase")).toBe("error")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("ink-sail")
  })

  it("reuses a fulfilled hover preload without degrading the optional foreground", async () => {
    const { host } = await renderProvider({ loadAsset: vi.fn(async () => undefined) })

    await click(host, "preload")
    await click(host, "ink")

    expect(document.documentElement.dataset.fleetSkin).toBe("ink-sail")
    expect(document.documentElement.style.getPropertyValue("--fleet-scene-foreground")).toContain(
      fleetSkinAssetUrl("ink-sail.scene.foreground"),
    )
  })

  it("keeps an imported palette visible while a built-in skin loads, then persists the built-in commit", async () => {
    const loads = new Map<string, Deferred>()
    const { host } = await renderProvider({
      runtimeFleet: importedRuntimeFleetContext(),
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })
    await click(host, "imported")

    await click(host, "ink")
    expect(text(host, "phase")).toBe("loading")
    expect(text(host, "pending")).toBe("ink-sail")
    expect(document.documentElement.dataset.fleetSkin).toBe("legacy-imported")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("aurora-pack--watchtide")

    for (const url of requiredAssetUrls("ink-sail")) await act(async () => loads.get(url)!.resolve())

    expect(text(host, "active")).toBe("ink-sail")
    expect(document.documentElement.dataset.fleetSkin).toBe("ink-sail")
    expect(localStorage.getItem(activeCrewStorageKey)).toBe("ink-sail")
  })

  it("continues an atomic load after StrictMode replays mount effects", async () => {
    localStorage.setItem(activeCrewStorageKey, "ink-sail")
    const loads = new Map<string, Deferred>()
    const { host } = await renderProvider({
      strict: true,
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })

    expect(text(host, "skin")).toBe("none")
    expect(text(host, "phase")).toBe("loading")
    await act(async () => loads.get(fleetSkinAssetUrl("ink-sail.scene.foreground"))!.resolve())
    for (const url of requiredAssetUrls("ink-sail")) await act(async () => loads.get(url)!.resolve())

    expect(document.documentElement.dataset.fleetSkin).toBe("ink-sail")
  })

  it("does not commit a stored skin after the boot provider unmounts", async () => {
    localStorage.setItem(activeCrewStorageKey, "ink-sail")
    document.documentElement.dataset.fleetSkin = "previous-shell"
    const loads = new Map<string, Deferred>()
    const { root } = await renderProvider({
      loadAsset: (url) => {
        const load = deferred()
        loads.set(url, load)
        return load.promise
      },
    })

    roots.splice(roots.indexOf(root), 1)
    act(() => root.unmount())
    await act(async () => {
      loads.get(fleetSkinAssetUrl("ink-sail.scene.foreground"))!.resolve()
      for (const url of requiredAssetUrls("ink-sail")) loads.get(url)!.resolve()
    })

    expect(document.documentElement.dataset.fleetSkin).toBe("previous-shell")
  })
})
