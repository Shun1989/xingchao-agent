import type { ContentPackSummary } from "../../electron/xingchao/common.ts"

import * as React from "react"
import { useContentPackService } from "@/components/AppContext"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"

export interface UseContentPacks {
  busy: ContentPackBusyOperation | null
  error: string | null
  install: () => Promise<void>
  items: ContentPackSummary[]
  loading: boolean
  remove: (id: string, version: string) => Promise<void>
  select: (id: string, version: string, selected: boolean) => Promise<void>
}

export interface ContentPackBusyOperation {
  id: string | null
  kind: "install" | "remove" | "selection"
  selected?: boolean
  version: string | null
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message
  return "Content pack operation failed"
}

export function useContentPacks(): UseContentPacks {
  const service = useContentPackService()
  const [items, setItems] = React.useState<ContentPackSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<ContentPackBusyOperation | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      setItems(await service.invoke("list"))
      setError(null)
    } catch (cause) {
      reportRendererHandledError("content-packs", "list content packs failed", cause)
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [service])

  React.useEffect(() => {
    void load()
  }, [load])

  const install = React.useCallback(async () => {
    setBusy({ id: null, kind: "install", version: null })
    try {
      await service.invoke("install")
      await load()
    } catch (cause) {
      reportRendererHandledError("content-packs", "install content pack failed", cause)
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }, [load, service])

  const remove = React.useCallback(
    async (id: string, version: string) => {
      setBusy({ id, kind: "remove", version })
      try {
        await service.invoke("remove", { id, version })
        await load()
      } catch (cause) {
        reportRendererHandledError("content-packs", "remove content pack failed", cause)
        setError(errorMessage(cause))
      } finally {
        setBusy(null)
      }
    },
    [load, service],
  )

  const select = React.useCallback(
    async (id: string, version: string, selected: boolean) => {
      setBusy({ id, kind: "selection", selected, version })
      try {
        await service.invoke("setSelection", { id, selected, version })
        await load()
      } catch (cause) {
        reportRendererHandledError("content-packs", "select content pack failed", cause)
        setError(errorMessage(cause))
      } finally {
        setBusy(null)
      }
    },
    [load, service],
  )

  return { busy, error, install, items, loading, remove, select }
}
