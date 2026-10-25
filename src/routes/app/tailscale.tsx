import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Activity, ArrowUpRight, CircleAlert, Clock3, KeyRound, LogOut, MonitorSmartphone, RefreshCw, Search, ShieldCheck, Wifi, WifiOff, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { blink } from '@/blink/client'
import { BlinkClientBoundary } from '@/components/BlinkClientBoundary'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Device = {
  id: string
  name?: string
  hostname?: string
  user?: string | { displayName?: string; loginName?: string }
  addresses?: string[]
  os?: string
  clientVersion?: string
  lastSeen?: string
  connectedToControl?: boolean
  authorized?: boolean
}
type Filter = 'Visi' | 'Prisijungę' | 'Atsijungę' | 'Laukiantys'

function getUserLabel(user: Device['user']) {
  if (typeof user === 'string') return user
  return user?.displayName || user?.loginName || '—'
}

function getDeviceStatus(device: Device) {
  if (device.authorized === false) return 'Laukiantis'
  return device.connectedToControl ? 'Prisijungęs' : 'Atsijungęs'
}

function formatDate(value?: string) {
  if (!value) return 'Nėra duomenų'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Nėra duomenų' : new Intl.DateTimeFormat('lt-LT', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export const Route = createFileRoute('/app/tailscale')({
  head: () => ({ meta: [{ title: 'Tailscale · SafeStack VPN' }, { name: 'description', content: 'Tiesioginis Tailscale įrenginių sąrašas ir prieigos valdymas.' }] }),
  component: () => <BlinkClientBoundary fallback={<LoadingState />}><TailscaleDevices /></BlinkClientBoundary>,
})

function LoadingState() {
  return <div className="flex min-h-[60vh] items-center justify-center"><div className="flex items-center gap-3 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Tikrinama prisijungimo būsena...</div></div>
}

function TailscaleDevices() {
  const [signedIn, setSignedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [devices, setDevices] = useState<Device[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('Visi')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const loadDevices = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await blink.functions.invoke('api/tailscale/devices', { body: {} })
      const payload = response.data as { devices?: Device[]; error?: string } | null
      if (payload?.error) throw new Error(payload.error)
      setDevices(Array.isArray(payload?.devices) ? payload.devices : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nepavyko gauti Tailscale įrenginių.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged(state => {
      setSignedIn(Boolean(state.user))
      if (!state.isLoading) setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the protected remote load when the auth subscription confirms a signed-in user
    if (signedIn) void loadDevices()
  }, [signedIn, loadDevices])

  const visibleDevices = useMemo(() => devices.filter(device => {
    const status = getDeviceStatus(device)
    const matchesFilter = filter === 'Visi' || (filter === 'Prisijungę' && status === 'Prisijungęs') || (filter === 'Atsijungę' && status === 'Atsijungęs') || (filter === 'Laukiantys' && status === 'Laukiantis')
    const searchText = `${device.hostname ?? ''} ${device.name ?? ''} ${getUserLabel(device.user)} ${(device.addresses ?? []).join(' ')} ${device.os ?? ''}`
    return matchesFilter && searchText.toLowerCase().includes(query.toLowerCase())
  }), [devices, filter, query])

  const expireKey = async (device: Device) => {
    const label = device.hostname || device.name || device.id
    if (!window.confirm(`Atšaukti įrenginio „${label}“ raktą? Įrenginį reikės iš naujo patvirtinti, kad jis galėtų prisijungti.`)) return
    setBusyId(device.id)
    try {
      const response = await blink.functions.invoke('api/tailscale/device/expire', { body: { deviceId: device.id } })
      const payload = response.data as { error?: string } | null
      if (payload?.error) throw new Error(payload.error)
      toast.success('Įrenginio raktas atšauktas.')
      await loadDevices()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Nepavyko atšaukti įrenginio rakto.')
    } finally {
      setBusyId('')
    }
  }

  if (authLoading) return <LoadingState />

  if (!signedIn) return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background px-4 py-10 sm:px-6 lg:px-9">
      <div className="mx-auto flex min-h-[65vh] max-w-xl items-center">
        <Card className="w-full border-border/80 shadow-sm"><CardContent className="p-7 text-center sm:p-10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-7" /></div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Prisijunkite prie SafeStack</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Tailscale įrenginių valdymas prieinamas tik šio projekto savininkui.</p>
          <Button className="mt-6 rounded-xl" onClick={() => blink.auth.login(window.location.href)}>Prisijungti</Button>
        </CardContent></Card>
      </div>
    </main>
  )

  const onlineCount = devices.filter(device => getDeviceStatus(device) === 'Prisijungęs').length
  const pendingCount = devices.filter(device => getDeviceStatus(device) === 'Laukiantis').length
  const filters: Filter[] = ['Visi', 'Prisijungę', 'Atsijungę', 'Laukiantys']

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />Tailscale · įrenginių valdymas</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Įrenginiai</h1><p className="mt-2 text-sm text-muted-foreground">Tiesiogiai iš tailnet: būsenos, IP adresai ir prieigos raktai.</p></div>
          <div className="flex flex-wrap items-center gap-2"><Button variant="outline" className="rounded-xl" onClick={() => void loadDevices()} disabled={loading}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Atnaujinti</Button><Button variant="ghost" className="rounded-xl" onClick={() => blink.auth.logout()}><LogOut className="size-4" />Atsijungti</Button></div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Activity className="size-5" /></div><div><p className="text-sm font-semibold">Tailscale tailnet</p><p className="mt-0.5 text-xs text-muted-foreground">Saugus API ryšys per serverį · raktas naršyklei neatskleidžiamas</p></div></div>
          <a href="https://login.tailscale.com/admin/machines" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/75">Atidaryti Tailscale Admin <ArrowUpRight className="size-3.5" /></a>
        </div>
        {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2.5 text-foreground"><CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /><span>{error}</span></div><Button variant="outline" className="shrink-0 rounded-lg" onClick={() => void loadDevices()} disabled={loading}>Bandyti dar kartą</Button></div>}
        <div className="grid gap-3 sm:grid-cols-3"><StatCard icon={MonitorSmartphone} label="Visi įrenginiai" value={devices.length} /><StatCard icon={Wifi} label="Prisijungę" value={onlineCount} /><StatCard icon={Clock3} label="Laukiantys patvirtinimo" value={pendingCount} /></div>
        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ieškoti įrenginių..." className="pl-9" aria-label="Ieškoti įrenginių" /></div>
              <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted/70 p-1" role="group" aria-label="Filtruoti pagal būseną">{filters.map(option => <button key={option} onClick={() => setFilter(option)} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{option}</button>)}</div>
            </div>
            {loading && devices.length === 0 ? <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Jungiama prie Tailscale...</div> : visibleDevices.length ? (
              <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead><tr className="bg-muted/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><th className="px-5 py-3 font-medium">Įrenginys</th><th className="px-4 py-3 font-medium">Naudotojas</th><th className="px-4 py-3 font-medium">IP adresai</th><th className="px-4 py-3 font-medium">Paskutinį kartą matytas</th><th className="px-4 py-3 font-medium">Būsena</th><th className="px-5 py-3 text-right font-medium">Prieiga</th></tr></thead><tbody className="divide-y divide-border/70">{visibleDevices.map(device => <DeviceRow key={device.id} device={device} busy={busyId === device.id} onExpire={() => void expireKey(device)} />)}</tbody></table></div>
            ) : <div className="px-6 py-14 text-center"><MonitorSmartphone className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{devices.length ? 'Įrenginių nerasta' : 'Tailnet dar neturi įrenginių'}</p><p className="mt-1 text-xs text-muted-foreground">{devices.length ? 'Pakeiskite paiešką arba filtrą.' : 'Prisijunkite įrenginius per Tailscale Admin Console ir atnaujinkite sąrašą.'}</p></div>}
            <div className="flex items-center justify-between border-t border-border/80 px-5 py-3 text-xs text-muted-foreground"><span>Rodoma {visibleDevices.length} iš {devices.length} įrenginių</span><span>Tiesioginiai Tailscale duomenys</span></div>
          </CardContent>
        </Card>
        <p className="text-center text-[11px] text-muted-foreground">Įrenginio rakto atšaukimas privers jį iš naujo prisijungti prie tailnet.</p>
      </div>
    </main>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return <Card className="border-border/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="size-4" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div></CardContent></Card>
}

function DeviceRow({ device, busy, onExpire }: { device: Device; busy: boolean; onExpire: () => void }) {
  const status = getDeviceStatus(device)
  const StatusIcon = status === 'Prisijungęs' ? Wifi : status === 'Laukiantis' ? Clock3 : WifiOff
  const deviceName = device.hostname || device.name || device.id
  return <tr className="transition-colors hover:bg-muted/35"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><MonitorSmartphone className="size-4" /></div><div className="min-w-0"><p className="max-w-[250px] truncate font-medium">{deviceName}</p><p className="mt-0.5 text-xs capitalize text-muted-foreground">{device.os || 'Nežinoma OS'}{device.clientVersion ? ` · ${device.clientVersion}` : ''}</p></div></div></td><td className="px-4 py-4 text-xs text-muted-foreground">{getUserLabel(device.user)}</td><td className="px-4 py-4 text-xs text-muted-foreground">{device.addresses?.length ? device.addresses.join(', ') : '—'}</td><td className="px-4 py-4 text-xs text-muted-foreground">{formatDate(device.lastSeen)}</td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${status === 'Prisijungęs' ? 'bg-primary/10 text-primary' : status === 'Laukiantis' ? 'bg-chart-2/15 text-foreground' : 'bg-muted text-muted-foreground'}`}><StatusIcon className="size-3" />{status}</span></td><td className="px-5 py-4 text-right"><Button variant="ghost" size="sm" disabled={busy} onClick={onExpire} className="h-8 rounded-lg text-muted-foreground hover:text-destructive"><KeyRound className={`size-3.5 ${busy ? 'animate-pulse' : ''}`} />{busy ? 'Vykdoma...' : 'Atšaukti raktą'}</Button></td></tr>
}
