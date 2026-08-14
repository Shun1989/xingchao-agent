import type { UseLinkRuntime } from "@/hooks/useLinkRuntime"
import type { UserFacingError } from "@/lib/user-facing-error"
import type { UseModelCatalog } from "@/routes/Chat/useModelCatalog"

import { ArrowRight, BrainCircuit, Check, ChevronDown, Server } from "lucide-react"
import * as React from "react"
import { Loader } from "@/components/ai-elements/loader"
import { BrandIcon } from "@/components/BrandIcon"
import { ErrorNotice } from "@/components/ErrorNotice"
import { OpenConnectorEndpointFields } from "@/components/OpenConnectorEndpointFields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/i18n"
import {
  hasCompleteOpenConnectorEndpoints,
  inferOpenConnectorDeploymentMode,
  resolveOpenConnectorConsoleUrl,
} from "@/lib/openconnector-deployment"
import { resolveUserFacingError } from "@/lib/user-facing-error"
import { cn } from "@/lib/utils"
import { AddCustomModelDialog } from "@/routes/Chat/AddCustomModelDialog"

export function InitialSetupRoute({
  completing,
  linkRuntime,
  models,
  onCompleteSelfManaged,
}: {
  completing: boolean
  linkRuntime: UseLinkRuntime
  models: UseModelCatalog
  onCompleteSelfManaged: () => Promise<void>
}) {
  return (
    <div className="relative flex h-full flex-col bg-background text-foreground">
      <header className="absolute inset-x-0 top-0 z-10 h-[var(--app-titlebar-height)] [-webkit-app-region:drag]" />
      <main className="oo-login-main min-h-0 flex-1">
        <SelfManagedSetup
          completing={completing}
          linkRuntime={linkRuntime}
          models={models}
          onComplete={onCompleteSelfManaged}
        />
      </main>
    </div>
  )
}

function SelfManagedSetup({
  completing,
  linkRuntime,
  models,
  onComplete,
}: {
  completing: boolean
  linkRuntime: UseLinkRuntime
  models: UseModelCatalog
  onComplete: () => Promise<void>
}) {
  const t = useT()
  const saved = linkRuntime.state?.openConnector
  const [baseUrl, setBaseUrl] = React.useState(saved?.baseUrl ?? "")
  const [consoleUrl, setConsoleUrl] = React.useState(saved?.consoleUrl ?? "")
  const [deploymentMode, setDeploymentMode] = React.useState(() => inferOpenConnectorDeploymentMode(saved))
  const [runtimeToken, setRuntimeToken] = React.useState("")
  const [actionError, setActionError] = React.useState<UserFacingError | null>(null)
  const [connectorExpanded, setConnectorExpanded] = React.useState(false)
  const connectorSectionId = React.useId()
  const hasModel = Boolean(models.catalog?.customModels.length)
  const connectorOnline = linkRuntime.status.kind === "online"

  React.useEffect(() => {
    setBaseUrl(saved?.baseUrl ?? "")
    setConsoleUrl(saved?.consoleUrl ?? "")
    setDeploymentMode(inferOpenConnectorDeploymentMode(saved))
  }, [saved?.baseUrl, saved?.consoleUrl])

  const endpointConfigurationComplete = hasCompleteOpenConnectorEndpoints(deploymentMode, baseUrl, consoleUrl)
  const changeDeploymentMode = (nextMode: typeof deploymentMode) => {
    setDeploymentMode(nextMode)
    if (nextMode === "local" && consoleUrl.trim() === baseUrl.trim()) setConsoleUrl("")
  }

  const saveAndTest = async () => {
    setActionError(null)
    const token = runtimeToken.trim()
    try {
      await linkRuntime.saveOpenConnector({
        baseUrl,
        consoleUrl: resolveOpenConnectorConsoleUrl(deploymentMode, baseUrl, consoleUrl),
        ...(token ? { runtimeToken: token } : {}),
      })
      const result = await linkRuntime.testOpenConnector({ baseUrl, ...(token ? { runtimeToken: token } : {}) })
      if (result.kind !== "online") {
        throw new Error(t(`setup.openConnectorTest.${result.kind}`))
      }
      setRuntimeToken("")
    } catch (cause) {
      setActionError(resolveUserFacingError(cause, { area: "connections", preserveMessage: true }))
    }
  }

  const runActivation = (operation: () => Promise<void>) => {
    setActionError(null)
    void operation().catch((cause: unknown) => {
      setActionError(resolveUserFacingError(cause, { area: "generic", preserveMessage: true }))
    })
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[64rem] flex-col overflow-y-auto px-5 py-8 sm:px-8 lg:px-12">
      <BrandIcon className="mb-5 size-12" />
      <div className="max-w-[44rem]">
        <h1 className="text-2xl font-semibold md:text-[1.75rem]">{t("setup.selfManagedSetupTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("setup.selfManagedSetupDescription")}</p>
      </div>

      <div className="mt-7 grid gap-4">
        <SetupStep
          complete={hasModel}
          icon={<BrainCircuit className="size-4" />}
          title={t("setup.modelStepTitle")}
          description={
            hasModel
              ? t("setup.modelConfigured", {
                  model:
                    models.catalog?.customModels[0]?.displayName ?? models.catalog?.customModels[0]?.modelName ?? "",
                })
              : t("setup.modelStepDescription")
          }
        >
          <Button variant="outline" size="sm" onClick={models.openDialog}>
            {hasModel ? t("setup.addAnotherModel") : t("setup.configureModel")}
          </Button>
        </SetupStep>

        <section className={cn("rounded-xl border bg-card/80 p-4", connectorOnline && "border-emerald-500/35")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 gap-3">
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg bg-muted",
                  connectorOnline && "bg-emerald-500/10 text-emerald-600",
                )}
              >
                {connectorOnline ? <Check className="size-4" /> : <Server className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{t("setup.openConnectorStepTitle")}</h2>
                  <span className="rounded-full border px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
                    {t("settings.optional")}
                  </span>
                </div>
                <p className="mt-1 max-w-[38rem] text-xs leading-5 text-muted-foreground">
                  {connectorOnline ? t("setup.openConnectorReady") : t("setup.openConnectorStepDescription")}
                </p>
              </div>
            </div>
            <Button
              className="shrink-0 sm:self-center"
              variant="outline"
              size="sm"
              aria-expanded={connectorExpanded}
              aria-controls={connectorSectionId}
              onClick={() => setConnectorExpanded((expanded) => !expanded)}
            >
              {connectorExpanded ? t("setup.hideOpenConnector") : t("setup.configureOpenConnector")}
              <ChevronDown className={cn("transition-transform", connectorExpanded && "rotate-180")} />
            </Button>
          </div>

          {connectorExpanded ? (
            <div id={connectorSectionId} className="mt-5 border-t pt-5">
              <div className="grid gap-2">
                <OpenConnectorEndpointFields
                  baseUrl={baseUrl}
                  consoleUrl={consoleUrl}
                  disabled={linkRuntime.busy}
                  mode={deploymentMode}
                  onBaseUrlChange={setBaseUrl}
                  onConsoleUrlChange={setConsoleUrl}
                  onModeChange={changeDeploymentMode}
                />
                <Input
                  type="password"
                  autoComplete="off"
                  value={runtimeToken}
                  placeholder={
                    saved?.tokenConfigured ? t("setup.openConnectorTokenSaved") : t("setup.openConnectorToken")
                  }
                  disabled={linkRuntime.busy}
                  onChange={(event) => setRuntimeToken(event.target.value)}
                />
                <Button
                  className="justify-self-start"
                  variant="outline"
                  size="lg"
                  disabled={linkRuntime.busy || !endpointConfigurationComplete}
                  onClick={() => void saveAndTest()}
                >
                  {linkRuntime.busy ? <Loader /> : null}
                  {t("setup.saveAndTest")}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {models.catalogError ? <ErrorNotice error={models.catalogError} compact className="mt-3" /> : null}
      {actionError ? <ErrorNotice error={actionError} compact className="mt-3" /> : null}

      <div className="mt-6 flex justify-end border-t pt-5">
        <Button
          size="lg"
          disabled={!hasModel || completing || linkRuntime.busy}
          onClick={() => runActivation(onComplete)}
        >
          {completing ? <Loader /> : <ArrowRight />}
          {t("setup.completeSelfManaged")}
        </Button>
      </div>

      <AddCustomModelDialog
        connectorsEnabled={false}
        open={models.dialogOpen}
        providers={models.catalog?.providers ?? []}
        error={models.dialogError}
        onClose={models.closeDialog}
        onSave={models.saveModel}
      />
    </div>
  )
}

function SetupStep({
  children,
  complete,
  description,
  icon,
  title,
}: {
  children: React.ReactNode
  complete: boolean
  description: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <section className={cn("rounded-xl border bg-card/80 p-4", complete && "border-emerald-500/35")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-3">
          <div
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg bg-muted",
              complete && "bg-emerald-500/10 text-emerald-600",
            )}
          >
            {complete ? <Check className="size-4" /> : icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="shrink-0 sm:self-center">{children}</div>
      </div>
    </section>
  )
}
