import { useEffect, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Globe2,
  KeyRound,
  MonitorSmartphone,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  UsersRound,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { TailscaleNotConfiguredCard } from '@/components/TailscaleNotConfiguredCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import { useDevicesQuery } from '@/lib/queries'
import {
  deriveDerpRegions,
  deriveTailnetUsers,
  formatRelativeTime,
  getDeviceIpv4,
  getDeviceName,
  getDeviceStatus,
  getKeyExpiryInfo,
  hasPendingRoutes,
  isInfrastructureNode,
} from '@/lib/tailscale'

export const Route = createFileRoute('/app/')({
  head: () => ({
    meta: [
      { title: 'Apžvalga · SafeStack VPN Hub' },
      { name: 'description', content: 'Tikro laiko Tailscale VPN tinklo būklė, įrenginiai ir maršrutai.' },
    ],
  }),
  component: DashboardOverview,
})

function MetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: string | number
  subtitle: string
  tone?: 'default' | 'warning'
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          </div>
          <div
            className={`rounded-xl p-2.5 ${
              tone === 'warning'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'bg-primary/10 text-primary'
            }`}
          >
            <Icon className="size-4" />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function DashboardOverview() {
  const devicesQuery = useDevicesQuery(true)

  useEffect(() => {
    try {
      localStorage.removeItem('nexora-vpn-regions')
      localStorage.removeItem('nexora-vpn-clients')
    } catch {
      // Ignore storage errors
    }
  }, [])

  const devices = useMemo(() => devicesQuery.data?.devices ?? [], [devicesQuery.data])
  const tailnet = devicesQuery.data?.tailnet
  const syncedAt = devicesQuery.data?.syncedAt

  const summary = useMemo(() => {
    const online = devices.filter(d => getDeviceStatus(d).kind === 'online').length
    const offline = devices.filter(d => getDeviceStatus(d).kind === 'offline').length
    const pendingAuth = devices.filter(d => getDeviceStatus(d).kind === 'pending').length
    const infraNodes = devices.filter(isInfrastructureNode)
    const pendingRouteNodes = devices.filter(hasPendingRoutes).length
    const expiringKeys = devices.filter(d => {
      const info = getKeyExpiryInfo(d)
      return info.state === 'expired' || info.state === 'expiring_soon'
    }).length
    const permanentKeys = devices.filter(d => d.keyExpiryDisabled).length
    const updatesAvailable = devices.filter(d => d.updateAvailable).length

    const osCounts = new Map<string, number>()
    for (const device of devices) {
      const osName = device.os || 'Nežinoma'
      osCounts.set(osName, (osCounts.get(osName) ?? 0) + 1)
    }
    const osBreakdown = Array.from(osCounts.entries())
      .map(([os, count]) => ({
        os,
        count,
        percent: devices.length > 0 ? Math.round((count / devices.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.os.localeCompare(b.os))

    const recentDevices = [...devices]
      .sort((a, b) => {
        if (a.connectedToControl !== b.connectedToControl) {
          return a.connectedToControl ? -1 : 1
        }
        const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
        const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 6)

    return {
      online,
      offline,
      pendingAuth,
      infraNodesCount: infraNodes.length,
      pendingRouteNodes,
      expiringKeys,
      permanentKeys,
      updatesAvailable,
      attentionCount: pendingAuth + pendingRouteNodes + expiringKeys,
      users: deriveTailnetUsers(devices),
      derpRegions: deriveDerpRegions(devices),
      osBreakdown,
      recentDevices,
    }
  }, [devices])

  const isNotConfigured =
    devicesQuery.error instanceof ApiError && devicesQuery.error.status === 503

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="animate-fade-in">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              <span className="size-1.5 rounded-full bg-primary" />
              Valdymo centras {tailnet ? `· ${tailnet}` : ''}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tinklo apžvalga</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tikri jūsų Tailscale tailnet duomenys: aktyvūs įrenginiai, maršrutų mazgai, relėjos ir saugumo būsena.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => void devicesQuery.refetch()}
              disabled={devicesQuery.isFetching}
            >
              <RefreshCw className={`size-4 ${devicesQuery.isFetching ? 'animate-spin' : ''}`} />
              Atnaujinti
            </Button>
            <Button asChild className="h-10 rounded-xl shadow-sm">
              <Link to="/app/tailscale">Valdyti įrenginius</Link>
            </Button>
          </div>
        </div>

        {isNotConfigured ? (
          <TailscaleNotConfiguredCard
            message={devicesQuery.error instanceof Error ? devicesQuery.error.message : undefined}
            onRetry={() => void devicesQuery.refetch()}
            retrying={devicesQuery.isFetching}
          />
        ) : devicesQuery.isError ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                {devicesQuery.error instanceof Error
                  ? devicesQuery.error.message
                  : 'Nepavyko gauti Tailscale duomenų.'}
              </span>
            </div>
            <Button
              variant="outline"
              className="shrink-0 rounded-xl"
              onClick={() => void devicesQuery.refetch()}
              disabled={devicesQuery.isFetching}
            >
              Bandyti dar kartą
            </Button>
          </div>
        ) : devicesQuery.isPending ? (
          <div className="flex min-h-[45vh] items-center justify-center rounded-2xl border border-border/70 bg-card/50">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" />
              Gaunama Tailscale tinklo būsena...
            </div>
          </div>
        ) : (
          <>
            <div
              className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
                summary.attentionCount > 0
                  ? 'border-amber-500/30 bg-amber-500/[0.07]'
                  : 'border-primary/20 bg-primary/[0.055]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    summary.attentionCount > 0
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  {summary.attentionCount > 0 ? (
                    <CircleAlert className="size-4" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {summary.attentionCount > 0
                      ? `Reikia peržiūrėti ${summary.attentionCount} tinklo įspėjimus`
                      : 'Tailnet veikia be trikdžių'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {summary.pendingAuth > 0 && `Laukia patvirtinimo: ${summary.pendingAuth} · `}
                    {summary.pendingRouteNodes > 0 &&
                      `Nepatvirtinti maršrutai: ${summary.pendingRouteNodes} · `}
                    {summary.expiringKeys > 0 &&
                      `Baigiasi arba pasibaigę raktai: ${summary.expiringKeys} · `}
                    Sinchronizuota: {formatRelativeTime(syncedAt)}
                  </p>
                </div>
              </div>
              <Link
                to={summary.pendingRouteNodes > 0 ? '/app/servers' : '/app/tailscale'}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/75"
              >
                {summary.pendingRouteNodes > 0 ? 'Peržiūrėti maršrutus' : 'Atidaryti įrenginius'}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={MonitorSmartphone}
                label="Prisijungę įrenginiai"
                value={`${summary.online} / ${devices.length}`}
                subtitle={`${summary.offline} atsijungę · ${summary.permanentKeys} su neterminuotu raktu`}
              />
              <MetricCard
                icon={UsersRound}
                label="Naudotojai ir tapatybės"
                value={summary.users.length}
                subtitle={`Aktyvūs tailnet nariai ir ACL žymos`}
              />
              <MetricCard
                icon={RouteIcon}
                label="Mazgai ir maršrutai"
                value={summary.infraNodesCount}
                subtitle={
                  summary.pendingRouteNodes > 0
                    ? `${summary.pendingRouteNodes} mazg. turi nepatvirtintų maršrutų`
                    : 'Exit mazgai, subnet maršrutizatoriai ir serveriai'
                }
              />
              <MetricCard
                icon={KeyRound}
                label="Saugumo dėmesys"
                value={summary.attentionCount}
                tone={summary.attentionCount > 0 ? 'warning' : 'default'}
                subtitle={
                  summary.updatesAvailable > 0
                    ? `${summary.updatesAvailable} įreng. turi Tailscale atnaujinimą`
                    : 'Patvirtinimai, raktų galiojimas ir maršrutai'
                }
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
              <Card className="border-border/80 shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 px-5 pt-5 pb-3 sm:px-6">
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Platformos ir ryšio būsena
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tikras įrenginių pasiskirstymas pagal operacinę sistemą ir būseną
                    </p>
                  </div>
                  <Activity className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-5 px-5 pb-5 sm:px-6">
                  {devices.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Tailnet dar neturi prijungtų įrenginių.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {summary.osBreakdown.map(item => (
                          <div key={item.os} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium capitalize">{item.os}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {item.count} įreng. ({item.percent}%)
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-300"
                                style={{ width: `${Math.max(item.percent, 4)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-3 border-t border-border/70 pt-4 sm:grid-cols-4">
                        <div className="rounded-xl bg-muted/50 p-3">
                          <p className="text-[11px] text-muted-foreground">Prisijungę</p>
                          <p className="mt-1 text-lg font-semibold tabular-nums">{summary.online}</p>
                        </div>
                        <div className="rounded-xl bg-muted/50 p-3">
                          <p className="text-[11px] text-muted-foreground">Atsijungę</p>
                          <p className="mt-1 text-lg font-semibold tabular-nums">{summary.offline}</p>
                        </div>
                        <div className="rounded-xl bg-muted/50 p-3">
                          <p className="text-[11px] text-muted-foreground">Laukia patvirt.</p>
                          <p className="mt-1 text-lg font-semibold tabular-nums">{summary.pendingAuth}</p>
                        </div>
                        <div className="rounded-xl bg-muted/50 p-3">
                          <p className="text-[11px] text-muted-foreground">Neterminuoti</p>
                          <p className="mt-1 text-lg font-semibold tabular-nums">{summary.permanentKeys}</p>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pt-5 pb-3">
                  <div>
                    <CardTitle className="text-base font-semibold">DERP relėjų regionai</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Iš įrenginių telemetrijos išmatuotas vėlinimas
                    </p>
                  </div>
                  <Link
                    to="/app/servers"
                    aria-label="Mazgai ir maršrutai"
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Globe2 className="size-4" />
                  </Link>
                </CardHeader>
                <CardContent className="space-y-1.5 px-4 pb-4">
                  {summary.derpRegions.length === 0 ? (
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Šiuo metu įrenginiai nepateikė DERP vėlinimo metrikų.
                    </div>
                  ) : (
                    summary.derpRegions.slice(0, 5).map(region => (
                      <div
                        key={region.region}
                        className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-muted/60"
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                          <Globe2 className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{region.region}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Pirmenybinis: {region.preferredCount} įreng. · Matuota: {region.measuredCount}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold tabular-nums">
                            {region.avgLatencyMs !== null ? `${region.avgLatencyMs} ms` : '—'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {region.minLatencyMs !== null ? `min. ${region.minLatencyMs} ms` : 'DERP'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <Link
                    to="/app/servers"
                    className="mt-2 flex items-center justify-center gap-1 rounded-xl border border-border/80 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Mazgai, maršrutai ir relėjos <ArrowUpRight className="size-3.5" />
                  </Link>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/80 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pt-5 pb-3">
                <div>
                  <CardTitle className="text-base font-semibold">Paskutinis aktyvumas tinkle</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aktyviausi ir naujausiai matyti tailnet įrenginiai
                  </p>
                </div>
                <Clock3 className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {summary.recentDevices.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Įrenginių nerasta.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {summary.recentDevices.map(device => {
                      const status = getDeviceStatus(device)
                      const StatusIcon =
                        status.kind === 'online'
                          ? Wifi
                          : status.kind === 'pending'
                            ? Clock3
                            : status.kind === 'offline'
                              ? WifiOff
                              : CircleCheck
                      return (
                        <Link
                          key={device.id}
                          to="/app/tailscale"
                          search={{ q: getDeviceName(device) }}
                          className="flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:bg-muted/60"
                        >
                          <div
                            className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                              status.kind === 'online'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <StatusIcon className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-semibold">
                                {getDeviceName(device)}
                              </p>
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                {getDeviceIpv4(device) ?? '—'}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {device.user || device.tags[0] || 'Tailnet įrenginys'} ·{' '}
                              {status.kind === 'online'
                                ? 'Prisijungęs dabar'
                                : formatRelativeTime(device.lastSeen)}
                            </p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
