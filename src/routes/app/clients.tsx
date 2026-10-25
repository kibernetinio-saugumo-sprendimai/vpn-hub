import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CircleCheck, Clock3, Pause, Play, Plus, Search, Shield, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type ClientStatus = 'Aktyvus' | 'Sustabdytas' | 'Laukiantis'
type Client = { id: string; name: string; email: string; location: string; status: ClientStatus; devices: number; lastSeen: string; initials: string }
type Filter = 'Visi' | ClientStatus

const initialClients: Client[] = [
  { id: 'cl-01', name: 'Milda Jankauskė', email: 'milda.j@example.test', location: 'Frankfurtas', status: 'Aktyvus', devices: 3, lastSeen: 'Dabar', initials: 'MJ' },
  { id: 'cl-02', name: 'Tomas Petrauskas', email: 'tomas.p@example.test', location: 'Amsterdamas', status: 'Aktyvus', devices: 2, lastSeen: 'Prieš 8 min.', initials: 'TP' },
  { id: 'cl-03', name: 'Gabija Kazlauskaitė', email: 'gabija.k@example.test', location: 'Helsinkis', status: 'Sustabdytas', devices: 1, lastSeen: 'Prieš 2 val.', initials: 'GK' },
  { id: 'cl-04', name: 'Lukas Vaitkus', email: 'lukas.v@example.test', location: 'Singapūras', status: 'Aktyvus', devices: 4, lastSeen: 'Dabar', initials: 'LV' },
  { id: 'cl-05', name: 'Ieva Stankevičiūtė', email: 'ieva.s@example.test', location: 'Frankfurtas', status: 'Laukiantis', devices: 0, lastSeen: 'Kvietimas išsiųstas', initials: 'IS' },
  { id: 'cl-06', name: 'Matas Žukauskas', email: 'matas.z@example.test', location: 'Amsterdamas', status: 'Aktyvus', devices: 2, lastSeen: 'Prieš 21 min.', initials: 'MŽ' },
]

function StatusPill({ status }: { status: ClientStatus }) {
  const style = status === 'Aktyvus' ? 'bg-primary/10 text-primary' : status === 'Sustabdytas' ? 'bg-muted text-muted-foreground' : 'bg-chart-2/15 text-foreground'
  const Icon = status === 'Aktyvus' ? CircleCheck : status === 'Sustabdytas' ? Pause : Clock3
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${style}`}><Icon className="size-3" />{status}</span>
}

export const Route = createFileRoute('/app/clients')({
  head: () => ({ meta: [{ title: 'Klientai · SafeStack VPN' }, { name: 'description', content: 'VPN klientų prieigos ir įrenginių valdymas.' }] }),
  component: ClientsPage,
})

function ClientsPage() {
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('Visi')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [location, setLocation] = useState('Frankfurtas')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexora-vpn-clients')
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the user's browser-local demo list after hydration
          setClients(parsed as Client[])
        }
      }
    } catch {
      toast.error('Nepavyko nuskaityti išsaugotų demonstracinių klientų.')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('nexora-vpn-clients', JSON.stringify(clients))
  }, [clients])

  const filteredClients = useMemo(() => clients.filter(client => {
    const matchesQuery = `${client.name} ${client.email} ${client.location}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (filter === 'Visi' || client.status === filter)
  }), [clients, filter, query])

  const addClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanName || !cleanEmail) return
    const initials = cleanName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
    setClients(current => [{ id: crypto.randomUUID(), name: cleanName, email: cleanEmail, location, status: 'Laukiantis', devices: 0, lastSeen: 'Kvietimas paruoštas', initials }, ...current])
    setName('')
    setEmail('')
    setShowForm(false)
    toast.success('Klientas įtrauktas į demonstracinį sąrašą.')
  }

  const toggleStatus = (client: Client) => {
    setClients(current => current.map(item => item.id === client.id ? { ...item, status: item.status === 'Sustabdytas' ? 'Aktyvus' : 'Sustabdytas' } : item))
    toast.success(client.status === 'Sustabdytas' ? 'Kliento būsena pakeista į aktyvią.' : 'Kliento prieiga sustabdyta.')
  }

  const activeCount = clients.filter(client => client.status === 'Aktyvus').length
  const suspendedCount = clients.filter(client => client.status === 'Sustabdytas').length

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Prieigos valdymas</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Klientai</h1><p className="mt-2 text-sm text-muted-foreground">Tvarkykite naudotojus, įrenginius ir VPN prieigos būseną.</p></div><Button onClick={() => setShowForm(value => !value)} className="h-10 rounded-xl shadow-sm">{showForm ? <X className="size-4" /> : <Plus className="size-4" />}{showForm ? 'Uždaryti' : 'Pridėti klientą'}</Button></div>
        <div className="flex items-center gap-2 rounded-xl border border-chart-2/25 bg-chart-2/10 px-4 py-3 text-xs text-muted-foreground"><Shield className="size-4 shrink-0 text-chart-2" /><span><strong className="font-semibold text-foreground">Demonstracinė aplinka.</strong> Klientų sąrašas saugomas tik šioje naršyklėje; kvietimai el. paštu nesiunčiami.</span></div>
        {showForm && <Card className="animate-fade-in border-primary/20 shadow-sm"><CardContent className="p-5"><form onSubmit={addClient} className="grid gap-4 md:grid-cols-[1fr_1fr_0.8fr_auto] md:items-end"><label className="space-y-1.5 text-xs font-medium">Vardas ir pavardė<Input value={name} onChange={event => setName(event.target.value)} placeholder="Pvz., Rūta Petraitytė" required /></label><label className="space-y-1.5 text-xs font-medium">El. paštas<Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="ruta@pavyzdys.lt" required /></label><label className="space-y-1.5 text-xs font-medium">Priskirtas regionas<select value={location} onChange={event => setLocation(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"><option>Frankfurtas</option><option>Amsterdamas</option><option>Helsinkis</option><option>Singapūras</option></select></label><Button type="submit" className="h-9 rounded-lg"><Plus className="size-4" />Įtraukti</Button></form></CardContent></Card>}
        <div className="grid gap-3 sm:grid-cols-3"><Card className="border-border/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><UsersRound className="size-4" /></div><div><p className="text-xs text-muted-foreground">Visi klientai</p><p className="mt-1 text-xl font-semibold tabular-nums">{clients.length}</p></div></CardContent></Card><Card className="border-border/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><CircleCheck className="size-4" /></div><div><p className="text-xs text-muted-foreground">Aktyvūs</p><p className="mt-1 text-xl font-semibold tabular-nums">{activeCount}</p></div></CardContent></Card><Card className="border-border/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-muted p-2.5 text-muted-foreground"><Pause className="size-4" /></div><div><p className="text-xs text-muted-foreground">Sustabdyti</p><p className="mt-1 text-xl font-semibold tabular-nums">{suspendedCount}</p></div></CardContent></Card></div>
        <Card className="overflow-hidden border-border/80 shadow-sm"><CardContent className="p-0"><div className="flex flex-col gap-3 border-b border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ieškoti klientų..." className="pl-9" aria-label="Ieškoti klientų" /></div><div className="flex gap-1 overflow-x-auto rounded-lg bg-muted/70 p-1">{(['Visi', 'Aktyvus', 'Sustabdytas', 'Laukiantis'] as Filter[]).map(option => <button key={option} onClick={() => setFilter(option)} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{option}</button>)}</div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="bg-muted/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><th className="px-5 py-3 font-medium">Klientas</th><th className="px-4 py-3 font-medium">Regionas</th><th className="px-4 py-3 font-medium">Įrenginiai</th><th className="px-4 py-3 font-medium">Paskutinis aktyvumas</th><th className="px-4 py-3 font-medium">Būsena</th><th className="px-5 py-3 text-right font-medium">Prieiga</th></tr></thead><tbody className="divide-y divide-border/70">{filteredClients.map(client => <tr key={client.id} className="transition-colors hover:bg-muted/35"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{client.initials}</div><div className="min-w-0"><p className="truncate font-medium">{client.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{client.email}</p></div></div></td><td className="px-4 py-4 text-xs text-muted-foreground">{client.location}</td><td className="px-4 py-4 text-xs tabular-nums">{client.devices}</td><td className="px-4 py-4 text-xs text-muted-foreground">{client.lastSeen}</td><td className="px-4 py-4"><StatusPill status={client.status} /></td><td className="px-5 py-4 text-right"><Button variant="ghost" size="sm" onClick={() => toggleStatus(client)} aria-label={client.status === 'Sustabdytas' ? `Atnaujinti ${client.name} prieigą` : `Sustabdyti ${client.name} prieigą`} className="h-8 rounded-lg text-muted-foreground hover:text-foreground">{client.status === 'Sustabdytas' ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}{client.status === 'Sustabdytas' ? 'Atnaujinti' : 'Sustabdyti'}</Button></td></tr>)}</tbody></table></div>
          {filteredClients.length === 0 && <div className="px-6 py-14 text-center"><UsersRound className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">Klientų nerasta</p><p className="mt-1 text-xs text-muted-foreground">Pakeiskite paiešką arba pasirinkite kitą filtrą.</p></div>}
          <div className="flex items-center justify-between border-t border-border/80 px-5 py-3 text-xs text-muted-foreground"><span>Rodoma {filteredClients.length} iš {clients.length} klientų</span><span>Saugoma šiame įrenginyje</span></div>
        </CardContent></Card>
      </div>
    </div>
  )
}
