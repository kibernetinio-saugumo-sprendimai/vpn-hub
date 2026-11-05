import { getRouteDraft, hasRouteConflict, sameRoutes, type RouteDraft } from '@/lib/route-draft'
import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  KeyRound,
  MonitorSmartphone,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { TailscaleNotConfiguredCard } from '@/components/TailscaleNotConfiguredCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import {
  useAuthorizeDeviceMutation,
  useDeleteDeviceMutation,
  useDevicesQuery,
  useExpireDeviceKeyMutation,
  useUpdateDeviceKeyMutation,
  useUpdateDeviceRoutesMutation,
} from '@/lib/queries'
import {
  formatDateTime,
  formatRelativeTime,
  getDeviceFqdn,
  getDeviceIpv4,
  getDeviceIpv6,
  getDeviceName,
  getDeviceStatus,
  getExitNodeState,
  getKeyExpiryInfo,
  getSubnetRoutes,
  isExitNodeRoute,
  isInfrastructureNode,
  type TailscaleDevice,
} from '@/lib/tailscale'

type Filter = 'Visi' | 'Prisijungę' | 'Atsijungę' | 'Laukiantys' | 'Mazgai'

export const Route = createFileRoute('/app/tailscale')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === 'string' && search.q.trim() ? search.q.trim() : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Įrenginiai · SafeStack VPN Hub' },
      { name: 'description', content: 'Tailscale įrenginių patvirtinimas, raktų galiojimas, maršrutai ir šalinimas.' },
    ],
  }),
  component: TailscaleDevicesPage,
})

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`Nukopijuota: ${label}`)
  } catch {
    toast.error('Nepavyko nukopijuoti į iškarpinę.')
  }
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function TailscaleDevicesPage() {
  const searchParams = Route.useSearch()
  const [query, setQuery] = useState(searchParams.q ?? '')
  const [filter, setFilter] = useState<Filter>('Visi')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmExpireDevice, setConfirmExpireDevice] = useState<TailscaleDevice | null>(null)
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<TailscaleDevice | null>(null)

  useEffect(() => {
    if (searchParams.q !== undefined) {
      setQuery(searchParams.q)
    }
  }, [searchParams.q])

  const devicesQuery = useDevicesQuery(true)
  const authorizeMutation = useAuthorizeDeviceMutation()
  const updateKeyMutation = useUpdateDeviceKeyMutation()
  const expireKeyMutation = useExpireDeviceKeyMutation()
  const updateRoutesMutation = useUpdateDeviceRoutesMutation()
  const deleteDeviceMutation = useDeleteDeviceMutation()

  const devices = useMemo(() => devicesQuery.data?.devices ?? [], [devicesQuery.data])
  const selectedDevice = useMemo(
    () => devices.find(d => d.id === selectedId) ?? null,
    [devices, selectedId],
  )

  const counts = useMemo(() => {
    const online = devices.filter(d => getDeviceStatus(d).kind === 'online').length
    const offline = devices.filter(d => getDeviceStatus(d).kind === 'offline').length
    const pending = devices.filter(d => getDeviceStatus(d).kind === 'pending').length
    const infra = devices.filter(isInfrastructureNode).length
    return { total: devices.length, online, offline, pending, infra }
  }, [devices])

  const visibleDevices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return devices.filter(device => {
      const status = getDeviceStatus(device).kind
      const matchesFilter =
        filter === 'Visi' ||
        (filter === 'Prisijungę' && status === 'online') ||
        (filter === 'Atsijungę' && status === 'offline') ||
        (filter === 'Laukiantys' && status === 'pending') ||
        (filter === 'Mazgai' && isInfrastructureNode(device))

      if (!matchesFilter) return false
      if (!normalizedQuery) return true

      const haystack = [
        device.hostname ?? '',
        device.name ?? '',
        device.user ?? '',
        device.os ?? '',
        ...device.addresses,
        ...device.tags,
        ...device.advertisedRoutes,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [devices, filter, query])

  const handleAuthorize = async (device: TailscaleDevice, authorized: boolean) => {
    try {
      await authorizeMutation.mutateAsync({ deviceId: device.id, authorized })
      toast.success(
        authorized ? 'Įrenginys patvirtintas tinkle.' : 'Įrenginio patvirtinimas atšauktas.',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepavyko pakeisti patvirtinimo būsenos.')
    }
  }

  const handleToggleKeyExpiry = async (device: TailscaleDevice, keyExpiryDisabled: boolean) => {
    try {
      await updateKeyMutation.mutateAsync({ deviceId: device.id, keyExpiryDisabled })
      toast.success(
        keyExpiryDisabled
          ? 'Įrenginiui nustatytas neterminuotas raktas.'
          : 'Įrenginiui vėl įjungtas rakto galiojimo terminas.',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepavyko pakeisti rakto galiojimo.')
    }
  }

  const handleConfirmExpire = async () => {
    if (!confirmExpireDevice) return
    try {
      await expireKeyMutation.mutateAsync(confirmExpireDevice.id)
      toast.success('Įrenginio raktas atšauktas.')
      setConfirmExpireDevice(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepavyko atšaukti įrenginio rakto.')
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDeleteDevice) return
    try {
      await deleteDeviceMutation.mutateAsync(confirmDeleteDevice.id)
      toast.success('Įrenginys pašalintas iš tailnet.')
      if (selectedId === confirmDeleteDevice.id) setSelectedId(null)
      setConfirmDeleteDevice(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepavyko pašalinti įrenginio.')
    }
  }

  const handleSaveRoutes = async (device: TailscaleDevice, routes: string[]) => {
    try {
      await updateRoutesMutation.mutateAsync({ deviceId: device.id, routes })
      toast.success('Patvirtinti įrenginio maršrutai atnaujinti.')
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepavyko atnaujinti maršrutų.')
      return false
    }
  }

  const isNotConfigured =
    devicesQuery.error instanceof ApiError && devicesQuery.error.status === 503

  const filters: { key: Filter; count: number }[] = [
    { key: 'Visi', count: counts.total },
    { key: 'Prisijungę', count: counts.online },
    { key: 'Atsijungę', count: counts.offline },
    { key: 'Laukiantys', count: counts.pending },
    { key: 'Mazgai', count: counts.infra },
  ]

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              <span className="size-1.5 rounded-full bg-primary" />
              Tailscale · įrenginių valdymas
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Įrenginiai</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Valdykite įrenginių patvirtinimą, raktų galiojimą, maršrutus ir prieigą prie tailnet.
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
            <Button asChild variant="ghost" className="h-10 rounded-xl">
              <a href="https://login.tailscale.com/admin/machines" target="_blank" rel="noreferrer">
                Tailscale Admin
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
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
                <div className="flex items-start gap-2.5 text-foreground">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>
                    {devicesQuery.error instanceof Error
                      ? devicesQuery.error.message
                      : 'Nepavyko gauti Tailscale įrenginių.'}
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
              <StatCard icon={MonitorSmartphone} label="Visi įrenginiai" value={counts.total} />
              <StatCard icon={Wifi} label="Prisijungę dabar" value={counts.online} />
              <StatCard icon={Clock3} label="Laukia patvirtinimo" value={counts.pending} />
              <StatCard icon={RouteIcon} label="Maršrutų ir ACL mazgai" value={counts.infra} />
            </div>

            <Card className="overflow-hidden border-border/80 shadow-sm">
              <CardContent className="p-0">
                <div className="flex flex-col gap-3 border-b border-border/80 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-sm">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder="Ieškoti pagal pavadinimą, IP, naudotoją, žymą..."
                      className="pl-9"
                      aria-label="Ieškoti įrenginių"
                    />
                  </div>
                  <div
                    className="flex gap-1 overflow-x-auto rounded-lg bg-muted/70 p-1"
                    role="group"
                    aria-label="Filtruoti pagal būseną"
                  >
                    {filters.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setFilter(option.key)}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          filter === option.key
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span>{option.key}</span>
                        <span className="text-[10px] opacity-70 tabular-nums">{option.count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {devicesQuery.isPending && devices.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
                    <RefreshCw className="size-4 animate-spin" />
                    Jungiama prie Tailscale...
                  </div>
                ) : visibleDevices.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                          <th className="px-5 py-3 font-medium">Įrenginys</th>
                          <th className="px-4 py-3 font-medium">Naudotojas / žymos</th>
                          <th className="px-4 py-3 font-medium">Tailscale IP</th>
                          <th className="px-4 py-3 font-medium">Raktas</th>
                          <th className="px-4 py-3 font-medium">Būsena</th>
                          <th className="px-5 py-3 text-right font-medium">Veiksmai</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/70">
                        {visibleDevices.map(device => (
                          <DeviceRow
                            key={device.id}
                            device={device}
                            authorizing={
                              authorizeMutation.isPending &&
                              authorizeMutation.variables?.deviceId === device.id
                            }
                            onAuthorize={() => void handleAuthorize(device, true)}
                            onOpenDetails={() => setSelectedId(device.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-6 py-14 text-center">
                    <MonitorSmartphone className="mx-auto size-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-medium">
                      {devices.length
                        ? 'Pagal pasirinktą filtrą įrenginių nerasta'
                        : devicesQuery.isError
                          ? 'Įrenginių sąrašo gauti nepavyko'
                          : 'Tailnet dar neturi įrenginių'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {devices.length
                        ? 'Pakeiskite paieškos frazę arba pasirinkite kitą būsenos filtrą.'
                        : 'Prijunkite įrenginius su Tailscale klientu ir atnaujinkite sąrašą.'}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 px-5 py-3 text-xs text-muted-foreground">
                  <span>
                    Rodoma {visibleDevices.length} iš {devices.length} įrenginių
                  </span>
                  <span>
                    Sinchronizuota: {formatRelativeTime(devicesQuery.data?.syncedAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <DeviceDetailsSheet
        device={selectedDevice}
        open={Boolean(selectedDevice)}
        onOpenChange={open => {
          if (!open) setSelectedId(null)
        }}
        authorizeBusy={authorizeMutation.isPending}
        keyBusy={updateKeyMutation.isPending}
        routesBusy={updateRoutesMutation.isPending}
        onToggleAuthorize={(device, authorized) => void handleAuthorize(device, authorized)}
        onToggleKeyExpiry={(device, disabled) => void handleToggleKeyExpiry(device, disabled)}
        onRequestExpire={device => setConfirmExpireDevice(device)}
        onRequestDelete={device => setConfirmDeleteDevice(device)}
        onSaveRoutes={handleSaveRoutes}
      />

      <ConfirmDialog
        open={Boolean(confirmExpireDevice)}
        onOpenChange={open => {
          if (!open) setConfirmExpireDevice(null)
        }}
        title="Atšaukti įrenginio raktą?"
        description={
          confirmExpireDevice
            ? `Įrenginio „${getDeviceName(confirmExpireDevice)}“ dabartinis autentifikacijos raktas nustos galioti iš karto. Norint vėl prisijungti, įrenginyje reikės prisijungti iš naujo.`
            : ''
        }
        confirmLabel="Atšaukti raktą"
        variant="destructive"
        busy={expireKeyMutation.isPending}
        onConfirm={() => void handleConfirmExpire()}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteDevice)}
        onOpenChange={open => {
          if (!open) setConfirmDeleteDevice(null)
        }}
        title="Pašalinti įrenginį iš tailnet?"
        description={
          confirmDeleteDevice
            ? `Įrenginys „${getDeviceName(confirmDeleteDevice)}“ bus visiškai pašalintas iš jūsų Tailscale tinklo. Šio veiksmo atšaukti negalima.`
            : ''
        }
        confirmLabel="Pašalinti įrenginį"
        variant="destructive"
        busy={deleteDeviceMutation.isPending}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  )
}

function DeviceRow({
  device,
  authorizing,
  onAuthorize,
  onOpenDetails,
}: {
  device: TailscaleDevice
  authorizing: boolean
  onAuthorize: () => void
  onOpenDetails: () => void
}) {
  const status = getDeviceStatus(device)
  const StatusIcon =
    status.kind === 'online' ? Wifi : status.kind === 'pending' ? Clock3 : WifiOff
  const deviceName = getDeviceName(device)
  const ipv4 = getDeviceIpv4(device)
  const exitState = getExitNodeState(device)
  const subnet = getSubnetRoutes(device)
  const keyInfo = getKeyExpiryInfo(device)

  return (
    <tr className="transition-colors hover:bg-muted/35">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenDetails}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-primary/15 hover:text-primary"
            aria-label={`Valdyti ${deviceName}`}
          >
            <MonitorSmartphone className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenDetails}
                className="max-w-[230px] truncate font-medium hover:underline"
              >
                {deviceName}
              </button>
              {exitState !== 'none' && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    exitState === 'approved'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  Exit Node
                </span>
              )}
              {subnet.advertised.length > 0 && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    subnet.pending.length === 0
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  Subnet ({subnet.enabled.length}/{subnet.advertised.length})
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="capitalize">{device.os || 'Nežinoma OS'}</span>
              {device.clientVersion ? ` · v${device.clientVersion}` : ''}
              {device.updateAvailable ? ' · Yra atnaujinimas' : ''}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-4">
        <p className="max-w-[200px] truncate text-xs font-medium">
          {device.user || '—'}
        </p>
        {device.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {device.tags.slice(0, 2).map(tag => (
              <span
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {device.tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{device.tags.length - 2}</span>
            )}
          </div>
        )}
      </td>

      <td className="px-4 py-4">
        {ipv4 ? (
          <button
            type="button"
            onClick={() => void copyText(ipv4, ipv4)}
            className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-muted"
            title="Kopijuoti IP adresą"
          >
            <span>{ipv4}</span>
            <Copy className="size-3 text-muted-foreground" />
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      <td className="px-4 py-4">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
            keyInfo.state === 'disabled'
              ? 'bg-primary/10 text-primary'
              : keyInfo.state === 'expired'
                ? 'bg-destructive/15 text-destructive'
                : keyInfo.state === 'expiring_soon'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground'
          }`}
        >
          <KeyRound className="size-3" />
          {keyInfo.label}
        </span>
      </td>

      <td className="px-4 py-4">
        <div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              status.kind === 'online'
                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                : status.kind === 'pending'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            <StatusIcon className="size-3" />
            {status.label}
          </span>
          {status.kind !== 'online' && device.lastSeen && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatRelativeTime(device.lastSeen)}
            </p>
          )}
        </div>
      </td>

      <td className="px-5 py-4 text-right">
        <div className="inline-flex items-center justify-end gap-1.5">
          {device.authorized === false && (
            <Button
              size="sm"
              disabled={authorizing}
              onClick={onAuthorize}
              className="h-8 rounded-lg text-xs"
            >
              <Check className="size-3.5" />
              {authorizing ? 'Tvirtinama...' : 'Patvirtinti'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenDetails}
            className="h-8 rounded-lg text-xs"
          >
            <Settings2 className="size-3.5" />
            Valdyti
          </Button>
        </div>
      </td>
    </tr>
  )
}

function DeviceDetailsSheet({
  device,
  open,
  onOpenChange,
  authorizeBusy,
  keyBusy,
  routesBusy,
  onToggleAuthorize,
  onToggleKeyExpiry,
  onRequestExpire,
  onRequestDelete,
  onSaveRoutes,
}: {
  device: TailscaleDevice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  authorizeBusy: boolean
  keyBusy: boolean
  routesBusy: boolean
  onToggleAuthorize: (device: TailscaleDevice, authorized: boolean) => void
  onToggleKeyExpiry: (device: TailscaleDevice, keyExpiryDisabled: boolean) => void
  onRequestExpire: (device: TailscaleDevice) => void
  onRequestDelete: (device: TailscaleDevice) => void
  onSaveRoutes: (device: TailscaleDevice, routes: string[]) => Promise<boolean>
}) {
  const [routeDraft, setRouteDraft] = useState<RouteDraft | null>(null)

  if (!device) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Įrenginio nustatymai</SheetTitle>
            <SheetDescription>Pasirinkite įrenginį iš sąrašo.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }

  const name = getDeviceName(device)
  const fqdn = getDeviceFqdn(device)
  const ipv4 = getDeviceIpv4(device)
  const ipv6 = getDeviceIpv6(device)
  const status = getDeviceStatus(device)
  const keyInfo = getKeyExpiryInfo(device)

  const currentDraft = getRouteDraft(device, routeDraft)
  const draftRoutes = currentDraft.routes
  const routeConflict = hasRouteConflict(device, currentDraft)
  const routesChanged = !sameRoutes(draftRoutes, device.enabledRoutes)

  const toggleRoute = (route: string) => {
    setRouteDraft({ ...currentDraft, routes: draftRoutes.includes(route)
      ? draftRoutes.filter(item => item !== route) : [...draftRoutes, route] })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/80 px-6 py-5">
          <div className="flex items-center gap-2.5">
            <SheetTitle className="truncate text-lg">{name}</SheetTitle>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                status.kind === 'online'
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                  : status.kind === 'pending'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {status.label}
            </span>
          </div>
          <SheetDescription className="truncate font-mono text-xs">
            {fqdn || `ID: ${device.id}`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-6">
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Tinklo duomenys
            </h3>
            <div className="divide-y divide-border/70 rounded-xl border border-border/80 bg-muted/20 text-xs">
              {fqdn && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-muted-foreground">MagicDNS</span>
                  <button
                    type="button"
                    onClick={() => void copyText(fqdn, 'MagicDNS vardas')}
                    className="inline-flex items-center gap-1.5 truncate font-mono font-medium hover:underline"
                  >
                    <span className="truncate">{fqdn}</span>
                    <Copy className="size-3 shrink-0 text-muted-foreground" />
                  </button>
                </div>
              )}
              {ipv4 && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-muted-foreground">Tailscale IPv4</span>
                  <button
                    type="button"
                    onClick={() => void copyText(ipv4, ipv4)}
                    className="inline-flex items-center gap-1.5 font-mono font-medium hover:underline"
                  >
                    <span>{ipv4}</span>
                    <Copy className="size-3 text-muted-foreground" />
                  </button>
                </div>
              )}
              {ipv6 && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-muted-foreground">Tailscale IPv6</span>
                  <button
                    type="button"
                    onClick={() => void copyText(ipv6, ipv6)}
                    className="inline-flex items-center gap-1.5 truncate font-mono font-medium hover:underline"
                  >
                    <span className="max-w-[220px] truncate">{ipv6}</span>
                    <Copy className="size-3 shrink-0 text-muted-foreground" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="text-muted-foreground">Naudotojas</span>
                <span className="truncate font-medium">{device.user || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="text-muted-foreground">Sistema ir versija</span>
                <span className="capitalize">
                  {device.os || 'Nežinoma'}
                  {device.clientVersion ? ` · ${device.clientVersion}` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="text-muted-foreground">Paskutinį kartą matytas</span>
                <span>{formatDateTime(device.lastSeen)}</span>
              </div>
              {device.created && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-muted-foreground">Užregistruotas</span>
                  <span>{formatDateTime(device.created)}</span>
                </div>
              )}
              {device.derp && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-muted-foreground">DERP relėja</span>
                  <span>
                    {device.derp}
                    {device.latencyMs !== undefined ? ` (${device.latencyMs} ms)` : ''}
                  </span>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Įrenginio patvirtinimas
            </h3>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 p-3.5">
              <div>
                <p className="text-sm font-medium">
                  {device.authorized === undefined ? 'Patvirtinimo būsena nežinoma' : device.authorized === false ? 'Laukia administratoriaus patvirtinimo' : 'Įrenginys patvirtintas'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {device.authorized === undefined ? 'Atnaujinkite duomenis prieš keisdami prieigą.' : device.authorized === false
                    ? 'Įrenginys negali pasiekti tailnet resursų, kol jo nepatvirtinsite.'
                    : 'Šis įrenginys turi leidimą jungtis prie tailnet.'}
                </p>
              </div>
              <Button
                variant={device.authorized === false ? 'default' : 'outline'}
                size="sm"
                disabled={authorizeBusy || device.authorized === undefined}
                onClick={() => onToggleAuthorize(device, device.authorized === false)}
                className="shrink-0 rounded-xl"
              >
                <ShieldCheck className="size-4" />
                {device.authorized === false ? 'Patvirtinti' : 'Atšaukti'}
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Rakto galiojimas
            </h3>
            <div className="space-y-3 rounded-xl border border-border/80 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {device.keyExpiryDisabled ? 'Neterminuotas raktas įjungtas' : `Galiojimas: ${keyInfo.label}`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {device.keyExpiryDisabled
                      ? 'Raktas nesibaigs automatiškai (rekomenduojama serveriams ir maršrutizatoriams).'
                      : device.expires
                        ? `Galioja iki ${formatDateTime(device.expires)}.`
                        : 'Standartinis Tailscale rakto galiojimo periodas.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={keyBusy || device.keyExpiryDisabled === undefined}
                  onClick={() => onToggleKeyExpiry(device, !device.keyExpiryDisabled)}
                  className="rounded-xl text-xs"
                >
                  <KeyRound className="size-3.5" />
                  {device.keyExpiryDisabled ? 'Įjungti galiojimo terminą' : 'Padaryti neterminuotą'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRequestExpire(device)}
                  className="rounded-xl text-xs text-destructive hover:text-destructive"
                >
                  <ShieldAlert className="size-3.5" />
                  Atšaukti raktą dabar
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Skelbiami maršrutai ir Exit Node
            </h3>
            {device.advertisedRoutes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                Šis įrenginys neskelbia jokių subnet maršrutų ar Exit Node.
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-border/80 p-3.5">
                {routeConflict && (
                  <div role="alert" className="space-y-2 text-xs text-amber-700 dark:text-amber-400">
                    <p>Maršrutai serveryje pasikeitė. Įkelkite naują būseną prieš išsaugodami.</p>
                    <Button variant="outline" size="sm" onClick={() => setRouteDraft(null)}>Įkelti naują būseną</Button>
                  </div>
                )}
                <div className="space-y-2">
                  {device.advertisedRoutes.map(route => {
                    const checked = draftRoutes.includes(route)
                    const isExit = isExitNodeRoute(route)
                    return (
                      <label
                        key={route}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={routesBusy || routeConflict}
                            onChange={() => toggleRoute(route)}
                            className="size-4 rounded border-border accent-primary"
                          />
                          <span className="font-mono font-medium">{route}</span>
                        </div>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {isExit ? 'Exit Node' : 'Subnet'}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={routesBusy || routeConflict}
                    onClick={() => setRouteDraft({ ...currentDraft, routes: [...device.advertisedRoutes] })}
                    className="h-8 rounded-lg text-xs"
                  >
                    Pažymėti visus
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!routesChanged || routesBusy || routeConflict}
                    onClick={async () => {
                      if (await onSaveRoutes(device, draftRoutes)) setRouteDraft(null)
                    }}
                    className="h-8 rounded-xl text-xs"
                  >
                    {routesBusy ? 'Saugoma...' : 'Išsaugoti maršrutus'}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {device.latencies.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                DERP vėlinimas pagal regioną
              </h3>
              <div className="space-y-1.5 rounded-xl border border-border/80 p-3.5">
                {device.latencies.slice(0, 5).map(entry => (
                  <div key={entry.region} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span>{entry.region}</span>
                      {entry.preferred && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          pirmenybinis
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {entry.latencyMs} ms
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3 border-t border-border/80 pt-5">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
              <div>
                <p className="text-sm font-medium text-destructive">Pašalinti įrenginį</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Visiškai ištrinti įrenginį iš Tailscale tinklo.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRequestDelete(device)}
                className="shrink-0 rounded-xl"
              >
                <Trash2 className="size-3.5" />
                Pašalinti
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
