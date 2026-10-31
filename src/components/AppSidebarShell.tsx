import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  Activity,
  CircleAlert,
  Globe2,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Moon,
  PanelLeft,
  Sun,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import { useDevicesQuery, useLogoutMutation } from '@/lib/queries'
import { getDeviceStatus, hasPendingRoutes } from '@/lib/tailscale'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const SIDEBAR_KEY = 'sidebar_collapsed'

interface NavItemDef {
  href: '/app' | '/app/tailscale' | '/app/servers' | '/app/clients'
  icon: ReactNode
  label: string
  badge?: number
}

function NavItem({ item, collapsed }: { item: NavItemDef; collapsed: boolean }) {
  const { pathname } = useLocation()
  const active =
    item.href === '/app'
      ? pathname === '/app' || pathname === '/app/'
      : pathname === item.href || pathname.startsWith(`${item.href}/`)

  const link = (
    <Link
      to={item.href}
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-200 cursor-pointer',
        collapsed ? 'mx-auto h-8 w-8 justify-center' : 'w-full px-3 py-2',
        active
          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="rounded-full bg-sidebar-primary/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-sidebar-primary">
          {item.badge}
        </span>
      )}
      {collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="absolute top-1 right-1 size-2 rounded-full bg-sidebar-primary" />
      )}
    </Link>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {item.badge ? ` (${item.badge})` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

export function AppSidebarShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const devicesQuery = useDevicesQuery(true)
  const logoutMutation = useLogoutMutation()

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === 'true') setCollapsed(true)
    } catch {
      // Ignore storage access errors
    }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed(current => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next))
      } catch {
        // Ignore storage access errors
      }
      return next
    })
  }, [])

  const devices = devicesQuery.data?.devices ?? []
  const onlineCount = devices.filter(d => getDeviceStatus(d).kind === 'online').length
  const pendingDevices = devices.filter(d => getDeviceStatus(d).kind === 'pending').length
  const pendingRoutesCount = devices.filter(hasPendingRoutes).length

  const notConfigured =
    devicesQuery.error instanceof ApiError && devicesQuery.error.status === 503
  const hasError = Boolean(devicesQuery.error)

  const navItems: NavItemDef[] = [
    { href: '/app', icon: <LayoutDashboard className="size-4" />, label: 'Apžvalga' },
    {
      href: '/app/tailscale',
      icon: <MonitorSmartphone className="size-4" />,
      label: 'Įrenginiai',
      badge: pendingDevices,
    },
    {
      href: '/app/servers',
      icon: <Globe2 className="size-4" />,
      label: 'Mazgai ir maršrutai',
      badge: pendingRoutesCount,
    },
    { href: '/app/clients', icon: <UsersRound className="size-4" />, label: 'Naudotojai' },
  ]

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync()
      toast.success('Sėkmingai atsijungėte.')
    } catch {
      toast.error('Nepavyko atsijungti. Bandykite dar kartą.')
    }
  }

  const statusSummary = notConfigured
    ? 'Nesukonfigūruotas API raktas'
    : hasError
      ? 'Ryšio su Tailscale klaida'
      : devicesQuery.isPending
        ? 'Tikrinamas tailnet...'
        : `${onlineCount} iš ${devices.length} prisijungę`

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear',
          collapsed ? 'w-[3.25rem]' : 'w-[15.5rem]',
        )}
      >
        <div
          className={cn(
            'flex h-[54px] shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3',
            collapsed && 'justify-center px-2',
          )}
        >
          {!collapsed && (
            <>
              <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sidebar-border bg-[#050b16]">
                <img src="/favicon.png" alt="SafeStack" className="size-6 object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight">SafeStack</p>
              </div>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={collapsed ? 'Išskleisti meniu' : 'Suskleisti meniu'}
                className="size-7 shrink-0 p-0 text-sidebar-foreground/65 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
                onClick={toggle}
              >
                <PanelLeft
                  className={cn('size-4 transition-transform duration-200', collapsed && 'rotate-180')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? 'Išskleisti meniu' : 'Suskleisti meniu'}
            </TooltipContent>
          </Tooltip>
        </div>

        <nav
          aria-label="Pagrindinė navigacija"
          className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto px-2 py-2.5"
        >
          {!collapsed && (
            <p className="px-3 pt-1 pb-1.5 text-[10px] font-medium tracking-wider text-sidebar-foreground/55 uppercase">
              Tailnet valdymas
            </p>
          )}
          {navItems.map(item => (
            <NavItem key={item.href} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <div className={cn('shrink-0 space-y-2 border-t border-sidebar-border', collapsed ? 'p-2' : 'p-3')}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mx-auto flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  {hasError ? <CircleAlert className="size-4" /> : <Activity className="size-4" />}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{statusSummary}</TooltipContent>
            </Tooltip>
          ) : (
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    hasError
                      ? 'bg-destructive'
                      : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]',
                  )}
                />
                <span className="truncate">{statusSummary}</span>
              </div>
              <p className="mt-1 truncate pl-4 text-[10px] leading-relaxed text-sidebar-foreground/60">
                {devicesQuery.data?.tailnet || 'Tiesioginis Tailscale API ryšys'}
              </p>
            </div>
          )}

          <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Šviesi tema' : 'Tamsi tema'}
                  className={cn(
                    'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    collapsed ? 'size-8 p-0' : 'h-8 px-2.5 text-xs',
                  )}
                >
                  {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                  {!collapsed && <span>{theme === 'dark' ? 'Šviesi' : 'Tamsi'}</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {theme === 'dark' ? 'Perjungti į šviesią temą' : 'Perjungti į tamsią temą'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={logoutMutation.isPending}
                  onClick={() => void handleLogout()}
                  aria-label="Atsijungti"
                  className={cn(
                    'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    collapsed ? 'size-8 p-0' : 'h-8 px-2.5 text-xs',
                  )}
                >
                  <LogOut className="size-3.5" />
                  {!collapsed && <span>Atsijungti</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Atsijungti</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
