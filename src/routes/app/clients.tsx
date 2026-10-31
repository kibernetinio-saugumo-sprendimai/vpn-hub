import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  RefreshCw,
  Search,
  Tag,
  UsersRound,
} from 'lucide-react'
import { TailscaleNotConfiguredCard } from '@/components/TailscaleNotConfiguredCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { useDevicesQuery } from '@/lib/queries'
import {
  deriveTailnetUsers,
  formatRelativeTime,
  getDeviceName,
  getDeviceStatus,
} from '@/lib/tailscale'

type UserFilter = 'Visi' | 'Prisijungę' | 'Laukiantys' | 'ACL žymos'

export const Route = createFileRoute('/app/clients')({
  head: () => ({
    meta: [
      { title: 'Naudotojai · SafeStack VPN Hub' },
      { name: 'description', content: 'Tailscale naudotojai, paslaugų tapatybės ir priskirti įrenginiai.' },
    ],
  }),
  component: TailnetUsersPage,
})

function TailnetUsersPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<UserFilter>('Visi')
  const devicesQuery = useDevicesQuery(true)

  const devices = useMemo(() => devicesQuery.data?.devices ?? [], [devicesQuery.data])
  const users = useMemo(() => deriveTailnetUsers(devices), [devices])

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(user => {
      const matchesFilter =
        filter === 'Visi' ||
        (filter === 'Prisijungę' && user.onlineCount > 0) ||
        (filter === 'Laukiantys' && user.pendingCount > 0) ||
        (filter === 'ACL žymos' && user.isTaggedIdentity)

      if (!matchesFilter) return false
      if (!q) return true

      const deviceNames = user.devices.map(getDeviceName).join(' ')
      return `${user.identity} ${user.osList.join(' ')} ${deviceNames}`.toLowerCase().includes(q)
    })
  }, [users, filter, query])

  const activeUsersCount = users.filter(u => u.onlineCount > 0).length
  const pendingUsersCount = users.filter(u => u.pendingCount > 0).length

  const isNotConfigured =
    devicesQuery.error instanceof ApiError && devicesQuery.error.status === 503

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Prieigos apžvalga
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Naudotojai</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tikri jūsų tailnet naudotojai ir ACL paslaugų tapatybės pagal prijungtus įrenginius.
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
                      : 'Nepavyko gauti naudotojų sąrašo.'}
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

            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="border-border/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <UsersRound className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Naudotojai ir tapatybės</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{users.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <CircleCheck className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Turi aktyvių įrenginių dabar</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{activeUsersCount}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-muted p-2.5 text-muted-foreground">
                    <Clock3 className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Su laukiančiais patvirtinimo</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{pendingUsersCount}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="overflow-hidden border-border/80 shadow-sm">
              <CardContent className="p-0">
                <div className="flex flex-col gap-3 border-b border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder="Ieškoti naudotojų ar įrenginių..."
                      className="pl-9"
                      aria-label="Ieškoti naudotojų"
                    />
                  </div>
                  <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted/70 p-1">
                    {(['Visi', 'Prisijungę', 'Laukiantys', 'ACL žymos'] as UserFilter[]).map(
                      option => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setFilter(option)}
                          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            filter === option
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {option}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                {devicesQuery.isPending && devices.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
                    <RefreshCw className="size-4 animate-spin" />
                    Gaunami tailnet naudotojai...
                  </div>
                ) : filteredUsers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                          <th className="px-5 py-3 font-medium">Naudotojas / tapatybė</th>
                          <th className="px-4 py-3 font-medium">Įrenginiai</th>
                          <th className="px-4 py-3 font-medium">Platformos</th>
                          <th className="px-4 py-3 font-medium">Paskutinis aktyvumas</th>
                          <th className="px-4 py-3 font-medium">Būsena</th>
                          <th className="px-5 py-3 text-right font-medium">Valdymas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/70">
                        {filteredUsers.map(user => (
                          <tr key={user.identity} className="transition-colors hover:bg-muted/35">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                                  {user.isTaggedIdentity ? <Tag className="size-4" /> : user.initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{user.identity}</p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {user.isTaggedIdentity ? 'ACL paslaugos tapatybė' : 'Tailnet naudotojas'}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {user.devices.slice(0, 3).map(dev => {
                                  const online = getDeviceStatus(dev).kind === 'online'
                                  return (
                                    <span
                                      key={dev.id}
                                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                                    >
                                      <span
                                        className={`size-1.5 rounded-full ${
                                          online ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                                        }`}
                                      />
                                      <span className="max-w-[120px] truncate">
                                        {getDeviceName(dev)}
                                      </span>
                                    </span>
                                  )
                                })}
                                {user.devices.length > 3 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{user.devices.length - 3}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-4 text-xs capitalize text-muted-foreground">
                              {user.osList.length > 0 ? user.osList.join(', ') : '—'}
                            </td>

                            <td className="px-4 py-4 text-xs text-muted-foreground">
                              {user.onlineCount > 0
                                ? 'Prisijungęs dabar'
                                : formatRelativeTime(user.lastSeen)}
                            </td>

                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                  user.onlineCount > 0
                                    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                                    : user.pendingCount > 0
                                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                      : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {user.onlineCount} / {user.devices.length} prisijungę
                              </span>
                            </td>

                            <td className="px-5 py-4 text-right">
                              <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg text-xs">
                                <Link to="/app/tailscale" search={{ q: user.identity }}>
                                  Įrenginiai
                                  <ArrowRight className="size-3.5" />
                                </Link>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-6 py-14 text-center">
                    <UsersRound className="mx-auto size-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-medium">Naudotojų nerasta</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pakeiskite paieškos frazę arba pasirinkite kitą filtrą.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border/80 px-5 py-3 text-xs text-muted-foreground">
                  <span>
                    Rodoma {filteredUsers.length} iš {users.length} tapatybių
                  </span>
                  <span>Duomenys iš aktyvių tailnet įrenginių</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
