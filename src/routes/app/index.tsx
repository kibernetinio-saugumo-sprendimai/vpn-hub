import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Activity, ArrowUpRight, CircleCheck, Clock3, Globe2, LockKeyhole, ShieldCheck, UsersRound, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Period = '24 val.' | '7 d.' | '30 d.'
type TrafficPoint = { label: string; value: number }

const traffic: Record<Period, TrafficPoint[]> = {
  '24 val.': [{ label: '00', value: 32 }, { label: '04', value: 41 }, { label: '08', value: 37 }, { label: '12', value: 68 }, { label: '16', value: 56 }, { label: '20', value: 83 }, { label: '24', value: 72 }],
  '7 d.': [{ label: 'Pr', value: 36 }, { label: 'An', value: 52 }, { label: 'Tr', value: 43 }, { label: 'Kt', value: 71 }, { label: 'Pn', value: 56 }, { label: 'Št', value: 87 }, { label: 'Sk', value: 69 }],
  '30 d.': [{ label: '01', value: 28 }, { label: '05', value: 42 }, { label: '10', value: 36 }, { label: '15', value: 60 }, { label: '20', value: 52 }, { label: '25', value: 81 }, { label: '30', value: 73 }],
}

function StatCard({ icon: Icon, label, value, trend, detail }: { icon: LucideIcon; label: string; value: string; trend: string; detail: string }) {
  return (
    <Card className="group overflow-hidden border-border/80 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          </div>
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary transition-transform duration-200 group-hover:scale-105"><Icon className="size-4" /></div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-medium text-primary"><ArrowUpRight className="size-3.5" />{trend}</span>
          <span className="text-muted-foreground">{detail}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function TrafficChart({ period, onPeriodChange }: { period: Period; onPeriodChange: (value: Period) => void }) {
  const points = traffic[period]
  const maximum = Math.max(...points.map(point => point.value))
  const minimum = Math.min(...points.map(point => point.value))
  const coordinates = points.map((point, index) => {
    const x = 12 + index * (696 / (points.length - 1))
    const y = 157 - ((point.value - minimum) / Math.max(maximum - minimum, 1)) * 118
    return `${x},${y}`
  })
  const line = `M ${coordinates.join(' L ')}`
  const area = `${line} L 708,170 L 12,170 Z`

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 px-5 pb-2 pt-5 sm:px-6">
        <div><CardTitle className="text-base font-semibold">Tinklo srautas</CardTitle><p className="mt-1 text-xs text-muted-foreground">Išeinantis ir įeinantis duomenų srautas</p></div>
        <div className="flex rounded-lg border border-border bg-muted/60 p-0.5" role="group" aria-label="Srauto laikotarpis">
          {(['24 val.', '7 d.', '30 d.'] as Period[]).map(option => (
            <button key={option} onClick={() => onPeriodChange(option)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${period === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{option}</button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-6">
        <div className="mt-4 h-48 w-full">
          <svg className="h-full w-full overflow-visible" viewBox="0 0 720 180" preserveAspectRatio="none" role="img" aria-label={`Duomenų srauto grafikas, laikotarpis ${period}`}>
            <defs><linearGradient id="traffic-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.01" /></linearGradient></defs>
            {[38, 82, 126, 170].map(y => <line key={y} x1="10" x2="710" y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="3 5" />)}
            <path d={area} fill="url(#traffic-fill)" />
            <path d={line} fill="none" stroke="var(--color-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {coordinates.map((coordinate, index) => { const [cx, cy] = coordinate.split(','); return <circle key={index} cx={cx} cy={cy} r="4" fill="var(--color-card)" stroke="var(--color-primary)" strokeWidth="2.5" /> })}
          </svg>
        </div>
        <div className="mt-2 flex justify-between px-1 text-[10px] font-medium text-muted-foreground">{points.map(point => <span key={point.label}>{point.label}</span>)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />Duomenys: 16,8 TB</span>
          <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-chart-2" />Prisijungimai: 8 432</span>
          <span className="ml-auto font-medium text-foreground"><ArrowUpRight className="mr-1 inline size-3.5 text-primary" />12,4% šį laikotarpį</span>
        </div>
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute('/app/')({
  head: () => ({ meta: [{ title: 'Apžvalga · SafeStack VPN' }, { name: 'description', content: 'VPN tinklo būklė, srautas ir aktyvūs klientai.' }] }),
  component: DashboardHome,
})

function DashboardHome() {
  const [period, setPeriod] = useState<Period>('7 d.')
  const stats = [
    { icon: UsersRound, label: 'Aktyvūs klientai', value: '2 184', trend: '+8,2%', detail: 'per pastarąsias 30 d.' },
    { icon: Activity, label: 'Prisijungę dabar', value: '8 432', trend: '+12,4%', detail: 'nuo praėjusios sav.' },
    { icon: Globe2, label: 'Veikiantys regionai', value: '18 / 18', trend: '100%', detail: 'pasiekiamumas' },
    { icon: LockKeyhole, label: 'Duomenų srautas', value: '16,8 TB', trend: '+6,8%', detail: 'per 30 dienų' },
  ]
  const locations = [{ city: 'Frankfurtas', country: 'Vokietija', ping: '18 ms', load: 'Maža apkrova' }, { city: 'Amsterdamas', country: 'Nyderlandai', ping: '24 ms', load: 'Vidutinė apkrova' }, { city: 'Singapūras', country: 'Singapūras', ping: '42 ms', load: 'Maža apkrova' }]
  const events = [{ icon: UsersRound, title: 'Naujas klientas prijungtas', detail: 'Milda Jankauskė · prieš 4 min.' }, { icon: ShieldCheck, title: 'Raktas atnaujintas', detail: 'vpn-gateway-02 · prieš 18 min.' }, { icon: CircleCheck, title: 'Serveris patikrintas', detail: 'Frankfurtas · prieš 32 min.' }]

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="animate-fade-in"><div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />Valdymo centras</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tinklo apžvalga</h1><p className="mt-2 text-sm text-muted-foreground">Stebėkite ryšius, klientus ir savo VPN infrastruktūrą.</p></div>
          <Button asChild className="h-10 rounded-xl shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"><Link to="/app/tailscale">Tailscale įrenginiai</Link></Button>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-4" /></div><div><p className="text-sm font-semibold">Tinklas veikia sklandžiai</p><p className="mt-0.5 text-xs text-muted-foreground">Visi regionai pasiekiami · paskutinis patikrinimas prieš 2 min.</p></div></div>
          <Link to="/app/servers" className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/75">Serverių būklė <ArrowUpRight className="size-3.5" /></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(stat => <StatCard key={stat.label} {...stat} />)}</div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.9fr)]">
          <TrafficChart period={period} onPeriodChange={setPeriod} />
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-3 pt-5"><div><CardTitle className="text-base">Regionų būklė</CardTitle><p className="mt-1 text-xs text-muted-foreground">Populiariausios vietovės</p></div><Link to="/app/servers" aria-label="Visi serveriai" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Globe2 className="size-4" /></Link></CardHeader>
            <CardContent className="space-y-1 px-4 pb-4">{locations.map((location, index) => <div key={location.city} className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/60"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Globe2 className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{location.city}</p><p className="text-[11px] text-muted-foreground">{location.country} · {location.load.toLowerCase()}</p></div><div className="text-right"><p className="text-xs font-semibold tabular-nums">{location.ping}</p><p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-primary"><span className="size-1.5 rounded-full bg-primary" />Veikia</p></div>{index === 0 && <span className="sr-only">Geriausias pingas</span>}</div>)}<Link to="/app/servers" className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-border/80 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Atidaryti serverių valdymą <ArrowUpRight className="size-3.5" /></Link></CardContent>
          </Card>
        </div>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-2 pt-5"><div><CardTitle className="text-base">Naujausi įvykiai</CardTitle><p className="mt-1 text-xs text-muted-foreground">Paskutiniai svarbūs veiksmai tinkle</p></div><Clock3 className="size-4 text-muted-foreground" /></CardHeader>
          <CardContent className="grid gap-2 px-4 pb-4 sm:grid-cols-3">{events.map(event => { const Icon = event.icon; return <div key={event.title} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-muted/60"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-4" /></div><div className="min-w-0"><p className="truncate text-xs font-medium">{event.title}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{event.detail}</p></div></div> })}</CardContent>
        </Card>
        <p className="text-center text-[11px] text-muted-foreground">Apžvalgos metrikos ir regionai yra demonstraciniai · Tailscale įrenginių sąrašas rodomas atskirai tiesiogiai iš tailnet</p>
      </div>
    </div>
  )
}
