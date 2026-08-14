import type { ReactNode } from "react"

import { LoaderCircle, PackageOpen, Palette, ShieldCheck, Trash2, Upload, UsersRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useContentPacks } from "@/hooks/useContentPacks"
import { useT } from "@/i18n/i18n"

export function SupplyDepotRoute() {
  const t = useT()
  const packs = useContentPacks()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--xingchao-primary)_18%,transparent),transparent_55%)]" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <PackageOpen className="size-5" />
                <span className="text-xs font-semibold tracking-[0.18em] uppercase">Content packs</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("supply.title")}</h1>
              <p className="text-sm leading-6 text-muted-foreground">{t("supply.description")}</p>
            </div>
            <Button disabled={packs.busy !== null} onClick={() => void packs.install()}>
              {packs.busy === "install" ? <LoaderCircle className="animate-spin" /> : <Upload />}
              {t("supply.install")}
            </Button>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="leading-6 text-muted-foreground">{t("supply.security")}</p>
        </div>

        {packs.error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <div className="font-medium">{t("supply.error")}</div>
            <div className="mt-1 break-words opacity-85">{packs.error}</div>
          </div>
        ) : null}

        <section className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{t("supply.installed")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("supply.installedDescription")}</p>
            </div>
            <Badge variant="outline">{t("supply.packCount", { count: packs.items.length })}</Badge>
          </div>

          {packs.loading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {packs.items.map((pack) => (
                <Card key={`${pack.id}@${pack.version}`} className="gap-4 py-5">
                  <CardHeader className="gap-2 px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={pack.source === "builtin" ? "default" : "secondary"}>
                        {pack.source === "builtin" ? t("supply.builtin") : t("supply.local")}
                      </Badge>
                      <Badge variant="outline">v{pack.version}</Badge>
                      <Badge variant="outline">
                        {pack.visibility === "private-local" ? t("supply.private") : t("supply.publicOriginal")}
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{pack.name}</CardTitle>
                    <CardDescription className="line-clamp-3 leading-5">{pack.description}</CardDescription>
                    {pack.removable ? (
                      <CardAction>
                        <Button
                          aria-label={t("supply.removePack", { name: pack.name })}
                          disabled={packs.busy !== null}
                          size="icon"
                          title={t("supply.remove")}
                          variant="ghost"
                          onClick={() => void packs.remove(pack.id, pack.version)}
                        >
                          {packs.busy === "remove" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                        </Button>
                      </CardAction>
                    ) : null}
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-3 px-5">
                    <PackMetric icon={<UsersRound />} label={t("supply.crews")} value={pack.crewCount} />
                    <PackMetric icon={<PackageOpen />} label={t("supply.agents")} value={pack.agentCount} />
                    <PackMetric icon={<Palette />} label={t("supply.themes")} value={pack.themeCount} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function PackMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="[&>svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
