import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Activity, CircleCheck, Globe2, Gauge, Plus, Server, ShieldAlert, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type ServerState = 'Veikia' | 'Priežiūra'
type Region = { id: string; city: string; country: string; code: string; nodes: number; clients: number; load: number; ping: string; state: ServerState }

const initialRegions: Region[] = [
  { id: 'rg-01', city: 'Frankfurtas', country: 'Vokietija', code: 'DE', nodes: 8, clients: 1438, load: 42, ping: '18 ms', state: 'Veikia' },
  { id: 'rg-02', city: 'Amsterdamas', country: 'Nyderlandai', code: 'NL', nodes: 6, clients: 1124, load: 68, ping: '24 ms', state: 'Veikia' },
  { id: 'rg-03', city: 'Helsinkis', country: 'Suomija', code: 'FI', nodes: 4, clients: 872, load: 31, ping: '29 ms', state: 'Veikia' },
  { id: 'rg-04', city: 'Singapūras', country: 'Singapūras', code: 'SG', nodes: 5, clients: 967, load: 56, ping: '42 ms', state: 'Veikia' },
  { id: 'rg-05', city: 'Toronto', country: 'Kanada', code: 'CA', nodes: 3, clients: 548, load: 74, ping: '36 ms', state: 'Veikia' },
  { id: 'rg-06', city: 'Tokijas', country: 'Japonija', code: 'JP', nodes: 4, clients: 711, load: 22, ping: '51 ms', state: 'Veikia' },
]

export const Route = createFileRoute('/app/servers')({
  head: () => ({ meta: [{ title: 'Serveriai · SafeStack VPN' }, { name: 'description', content: 'VPN serverių regionų ir apkrovos valdymas.' }] }),
  component: ServersPage,
})

function ServersPage() {
  const [regions, setRegions] = useState<Region[]>(initialRegions)
  const [showForm, setShowForm] = useState(false)
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexora-vpn-regions')
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setRegions(parsed as Region[])
        }
      }
    } catch {
      toast.error('Nepavyko nuskaityti demonstracinių regionų.')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('nexora-vpn-regions', JSON.stringify(regions))
  }, [regions])

  const addRegion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanCity = city.trim()
    const cleanCountry = country.trim()
    if (!cleanCity || !cleanCountry) return
    setRegions(current => [{ id: crypto.randomUUID(), city: cleanCity, country: cleanCountry, code: cleanCountry.slice(0, 2).toUpperCase(), nodes: 1, clients: 0, load: 0, ping: '—', state: 'Veikia' }, ...current])
    setCity('')
    setCountry('')
    setShowForm(false)
    toast.success('Regionas įtrauktas į šios naršyklės demonstracinį sąrašą.')
  }

  const toggleRegion = (region: Region) => {
    setRegions(current => current.map(item => item.id === region.id ? { ...item, state: item.state === 'Veikia' ? 'Priežiūra' : 'Veikia' } : item))
    toast.success(`Demonstracinė būsena: ${region.city} ${region.state === 'Veikia' ? 'perkelta į priežiūrą' : 'vėl veikia'}.`)
  }

  const onlineCount = regions.filter(region => region.state === 'Veikia').length
  const averageLoad = regions.length ? Math.round(regions.reduce((sum, region) => sum + region.load, 0) / regions.length) : 0

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Infrastruktūra</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Serveriai ir regionai</h1><p className="mt-2 text-sm text-muted-foreground">Peržiūrėkite vietovių būklę, apkrovą ir aktyvias jungtis.</p></div><Button onClick={() => setShowForm(value => !value)} className="h-10 rounded-xl shadow-sm">{showForm ? <X className="size-4" /> : <Plus className="size-4" />}{showForm ? 'Uždaryti' : 'Pridėti regioną'}</Button></div>
        <div className="flex items-center gap-2 rounded-xl border border-chart-2/25 bg-chart-2/10 px-4 py-3 text-xs text-muted-foreground"><ShieldAlert className="size-4 shrink-0 text-chart-2" /><span><strong className="font-semibold text-foreground">Demonstracinė aplinka.</strong> Regionų būsena ir apkrova nėra susieta su realiais VPN serveriais.</span></div>
        {showForm && <Card className="animate-fade-in border-primary/20 shadow-sm"><CardContent className="p-5"><form onSubmit={addRegion} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="space-y-1.5 text-xs font-medium">Miestas arba regionas<Input value={city} onChange={event => setCity(event.target.value)} placeholder="Pvz., Vilnius" required /></label><label className="space-y-1.5 text-xs font-medium">Šalis<Input value={country} onChange={event => setCountry(event.target.value)} placeholder="Pvz., Lietuva" required /></label><Button type="submit" className="h-9 rounded-lg"><Plus className="size-4" />Pridėti</Button></form></CardContent></Card>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card className="border-border/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Globe2 className="size-4" /></div><div><p className="text-xs text-muted-foreground">Regionai veikia</p><p className="mt-1 text-xl font-semibold tabular-nums">{onlineCount} <span className="text-sm font-normal text-muted-foreground">/ {regions.length}</span></p></div></CardContent></Card><Card className="border-border/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-secondary p-2.5 text-secondary-foreground"><Server className="size-4" /></div><div><p className="text-xs text-muted-foreground">Serverių mazgai</p><p className="mt-1 text-xl font-semibold tabular-nums">{regions.reduce((sum, region) => sum + region.nodes, 0)}</p></div></CardContent></Card><Card className="border-border/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><UsersRound className="size-4" /></div><div><p className="text-xs text-muted-foreground">Aktyvios jungtys</p><p className="mt-1 text-xl font-semibold tabular-nums">{regions.reduce((sum, region) => sum + region.clients, 0).toLocaleString('lt-LT')}</p></div></CardContent></Card><Card className="border-border/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-chart-2/15 p-2.5 text-chart-2"><Gauge className="size-4" /></div><div><p className="text-xs text-muted-foreground">Vidutinė apkrova</p><p className="mt-1 text-xl font-semibold tabular-nums">{averageLoad}%</p></div></CardContent></Card></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{regions.map(region => <Card key={region.id} className="group border-border/80 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-sm font-semibold tracking-wide text-secondary-foreground">{region.code}</div><div><h2 className="text-sm font-semibold">{region.city}</h2><p className="mt-0.5 text-xs text-muted-foreground">{region.country}</p></div></div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${region.state === 'Veikia' ? 'bg-primary/10 text-primary' : 'bg-chart-2/15 text-foreground'}`}><span className={`size-1.5 rounded-full ${region.state === 'Veikia' ? 'bg-primary' : 'bg-chart-2'}`} />{region.state}</span></div><div className="mt-5 grid grid-cols-3 gap-3 border-y border-border/70 py-4"><div><p className="text-[10px] text-muted-foreground">Mazgo serveriai</p><p className="mt-1 text-sm font-semibold tabular-nums">{region.nodes}</p></div><div><p className="text-[10px] text-muted-foreground">Jungtys</p><p className="mt-1 text-sm font-semibold tabular-nums">{region.clients.toLocaleString('lt-LT')}</p></div><div><p className="text-[10px] text-muted-foreground">Pingas</p><p className="mt-1 text-sm font-semibold tabular-nums">{region.ping}</p></div></div><div className="mt-4"><div className="mb-2 flex items-center justify-between text-[10px]"><span className="text-muted-foreground">Apkrova</span><span className="font-medium tabular-nums">{region.load}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${region.load > 70 ? 'bg-chart-2' : 'bg-primary'} ${region.load <= 25 ? 'w-1/4' : region.load <= 40 ? 'w-1/3' : region.load <= 55 ? 'w-1/2' : region.load <= 70 ? 'w-2/3' : region.load <= 85 ? 'w-3/4' : 'w-full'}`} /></div></div><div className="mt-4 flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Activity className="size-3.5" />WireGuard · UDP</span><Button variant="ghost" size="sm" onClick={() => toggleRegion(region)} className="h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground">{region.state === 'Veikia' ? 'Priežiūra' : 'Atnaujinti'}</Button></div></CardContent></Card>)}</div>
        <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-muted-foreground"><CircleCheck className="size-3.5 text-primary" />Duomenys atnaujinti · pakeitimai saugomi tik šioje naršyklėje</div>
      </div>
    </div>
  )
}
