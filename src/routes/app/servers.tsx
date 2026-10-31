import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Check,
  CircleAlert,
  Globe2,
  KeyRound,
  RefreshCw,
  Route as RouteIcon,
  Server,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { TailscaleNotConfiguredCard } from '@/components/TailscaleNotConfiguredCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import {
  useDevicesQuery,
  useUpdateDeviceKeyMutation,
  useUpdateDeviceRoutesMutation,
} from '@/lib/queries'
import {
  deriveDerpRegions,
  getDeviceIpv4,
  getDeviceName,
  getDeviceStatus,
  getExitNodeState,
  getSubnetRoutes,
  hasPendingRoutes,
  isExitNodeRoute,
  isInfrastructureNode,
  type TailscaleDevice,
} from '@/lib/tailscale'

export const Route = createFileRoute('/app/servers')({
  head: () => ({
    meta: [
      { title: 'Mazgai ir maršrutai · SafeStack VPN Hub' },
      { name: 'description', content: 'Tailscale Exit Node mazgai, subnet maršrutizatoriai, ACL serveriai ir DERP regionai.' },
    ],
  }),
  component: InfrastructureNodesPage,
})

function InfrastructureNodesPage() {
  const devicesQuery = useDevicesQuery(true)
  const updateRoutesMutation = useUpdateDeviceRoutesMutation()
  const updateKeyMutation = useUpdateDeviceKeyMutation()

  const devices = useMemo(() => devicesQuery.data?.devices ?? [], [devicesQuery.data])
  const infraNodes = useMemo(() => devices.filter(isInfrastructureNode), [devices])
  const derpRegions = useMemo(() => deriveDerpRegions(devices), [devices])

  const metrics = useMemo(() => {
    const exitNodes = devices.filter(d => getExitNodeState(d) !== 'none').length
    const subnetRouters = devices.filter(d => getSubnetRoutes(d).advertised.length > 0).length
    const taggedServers = devices.filter(d => d.tags.length > 0).length
    return {
      exitNodes,
      subnetRouters,
      taggedServers,
      derpCount: derpRegions.length,
    }
  }, [devices, derpRegions])

  const approveAllRoutes = async (node: TailscaleDevice) => {
    try {
      await updateRoutesMutation.mutateAsync({
        deviceId: node.id,
        routes: node.advertisedRoutes,
      })
      toast.success(`Visi mazgo „${getDeviceName(node)}“ maršrutai patvirtinti.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepavyko patvirtinti maršrutų.')
    }
  }

  const toggleSingleRoute = async (node: TailscaleDevice, route: string) => {
    const enabled = new Set(node.enabledRoutes)
    if (enabled.has(route)) {
      enabled.delete(route)
    } else {
      enabled.add(route)
    }
    try {
      await updateRoutesMutation.mutateAsync({
        deviceId: node.id,
        routes: Array.from(enabled),
      })
      toast.success('Maršruto būsena atnaujinta.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepavyko atnaujinti maršruto.')
    }
  }

  const enablePermanentKey = async (node: TailscaleDevice) => {
    try {
      await updateKeyMutation.mutateAsync({ deviceId: node.id, keyExpiryDisabled: true })
      toast.success(`Mazgui „${getDeviceName(node)}“ įjungtas neterminuotas raktas.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepavyko pakeisti rakto galiojimo.')
    }
  }

  const isNotConfigured =
    devicesQuery.error instanceof ApiError && devicesQuery.error.status === 503

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Infrastruktūra
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Mazgai ir maršrutai
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tikri jūsų tailnet Exit Node mazgai, subnet maršrutizatoriai, ACL žymėti serveriai ir DERP relėjų regionai.
            </p>
          </div>
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => void devicesQuery.refetch()}
            disabled={devicesQuery.isFetching}
          >
            <RefreshCw className={`size-4 ${devicesQuery.isFetching ? 'animate-spin' : ''}`} />
            Atnaujinti
          </Button>
        </div>

        {isNotConfigured ? (
          <TailscaleNotConfiguredCard
            message={devicesQuery.error instanceof Error ? devicesQuery.error.message : undefined}
            onRetry={() => void devicesQuery.refetch()}
            retrying={devicesQuery.isFetching}
          />
        ) : (
          <>
            {devicesQuery.isError && (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>
                    {devicesQuery.error instanceof Error
                      ? devicesQuery.error.message
                      : 'Nepavyko gauti tinklo mazgų.'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0 rounded-lg"
                  onClick={() => void devicesQuery.refetch()}
                  disabled={devicesQuery.isFetching}
                >
                  Bandyti dar kartą
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <Globe2 className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Exit Node mazgai</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{metrics.exitNodes}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <RouteIcon className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Subnet maršrutizatoriai</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{metrics.subnetRouters}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-secondary p-2.5 text-secondary-foreground">
                    <Server className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ACL žymėti serveriai</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{metrics.taggedServers}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-secondary p-2.5 text-secondary-foreground">
                    <ShieldCheck className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Matomi DERP regionai</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{metrics.derpCount}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {devicesQuery.isPending && devices.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/80 py-16 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" />
                Gaunama mazgų ir maršrutų informacija...
              </div>
            ) : (
              <>
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold tracking-tight">
                      Tinklo mazgai, maršrutai ir Exit Node
                    </h2>
                    <Link
                      to="/app/tailscale"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Visi įrenginiai ({devices.length})
                    </Link>
                  </div>

                  {infraNodes.length === 0 ? (
                    <Card className="border-border/80 shadow-sm">
                      <CardContent className="p-8 text-center">
                        <Server className="mx-auto size-8 text-muted-foreground/50" />
                        <p className="mt-3 text-sm font-medium">
                          Šiuo metu tailnet neturi Exit Node ar Subnet maršrutizatorių
                        </p>
                        <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
                          Kai serveryje paleisite{' '}
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                            tailscale up --advertise-exit-node
                          </code>{' '}
                          arba{' '}
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                            --advertise-routes=10.0.0.0/24
                          </code>
                          , mazgas pasirodys čia ir galėsite vienu paspaudimu patvirtinti maršrutus.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {infraNodes.map(node => {
                        const status = getDeviceStatus(node)
                        const ipv4 = getDeviceIpv4(node)
                        const pending = hasPendingRoutes(node)
                        const enabledSet = new Set(node.enabledRoutes)

                        return (
                          <Card key={node.id} className="border-border/80 shadow-sm">
                            <CardContent className="space-y-4 p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-base font-semibold">
                                      {getDeviceName(node)}
                                    </h3>
                                    {node.tags.map(tag => (
                                      <span
                                        key={tag}
                                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                                    {ipv4 ?? '—'} · <span className="capitalize font-sans">{node.os || 'Nežinoma OS'}</span>
                                    {node.derp ? ` · DERP: ${node.derp}` : ''}
                                  </p>
                                </div>
                                <span
                                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                    status.kind === 'online'
                                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {status.kind === 'online' ? (
                                    <Wifi className="size-3" />
                                  ) : (
                                    <WifiOff className="size-3" />
                                  )}
                                  {status.label}
                                </span>
                              </div>

                              {node.advertisedRoutes.length > 0 ? (
                                <div className="space-y-2 border-t border-border/70 pt-3">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-muted-foreground">
                                      Skelbiami maršrutai ({node.enabledRoutes.length}/
                                      {node.advertisedRoutes.length} patvirtinta)
                                    </span>
                                    {pending && (
                                      <Button
                                        size="sm"
                                        disabled={updateRoutesMutation.isPending}
                                        onClick={() => void approveAllRoutes(node)}
                                        className="h-7 rounded-lg px-2.5 text-xs"
                                      >
                                        <Check className="size-3" />
                                        Patvirtinti visus
                                      </Button>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {node.advertisedRoutes.map(route => {
                                      const isEnabled = enabledSet.has(route)
                                      return (
                                        <button
                                          key={route}
                                          type="button"
                                          disabled={updateRoutesMutation.isPending}
                                          onClick={() => void toggleSingleRoute(node, route)}
                                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors ${
                                            isEnabled
                                              ? 'border-primary/30 bg-primary/10 text-primary'
                                              : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                          }`}
                                          title={
                                            isEnabled
                                              ? 'Spustelėkite, kad išjungtumėte šį maršrutą'
                                              : 'Spustelėkite, kad patvirtintumėte šį maršrutą'
                                          }
                                        >
                                          <span>{route}</span>
                                          <span className="font-sans text-[10px] opacity-80">
                                            {isExitNodeRoute(route) ? '(Exit)' : ''}
                                            {isEnabled ? ' · Aktyvus' : ' · Laukia'}
                                          </span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <p className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
                                  ACL žymėtas mazgas be papildomų skelbiamų subnet maršrutų.
                                </p>
                              )}

                              <div className="flex items-center justify-between border-t border-border/70 pt-3 text-xs">
                                <span className="text-muted-foreground">
                                  Raktas:{' '}
                                  <strong className="font-medium text-foreground">
                                    {node.keyExpiryDisabled ? 'Neterminuotas' : 'Su galiojimo terminu'}
                                  </strong>
                                </span>
                                {!node.keyExpiryDisabled && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={updateKeyMutation.isPending}
                                    onClick={() => void enablePermanentKey(node)}
                                    className="h-7 rounded-lg px-2 text-xs"
                                  >
                                    <KeyRound className="size-3.5" />
                                    Padaryti neterminuotą
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </section>

                <Card className="border-border/80 shadow-sm">
                  <CardHeader className="px-5 pt-5 pb-3">
                    <CardTitle className="text-base font-semibold">
                      Tailscale DERP relėjų regionai
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tikri vėlinimo ir maršrutizavimo duomenys iš prijungtų įrenginių telemetrijos
                    </p>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {derpRegions.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Įrenginių DERP ryšio telemetrijos duomenų kol kas nėra.
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {derpRegions.map(region => (
                          <div
                            key={region.region}
                            className="rounded-xl border border-border/70 bg-muted/20 p-3.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold">{region.region}</p>
                              <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                                {region.avgLatencyMs !== null ? `${region.avgLatencyMs} ms` : '—'}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>Pirmenybinis: {region.preferredCount} įreng.</span>
                              <span>
                                {region.minLatencyMs !== null
                                  ? `min. ${region.minLatencyMs} ms`
                                  : `matuota: ${region.measuredCount}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
