/**
 * Collapsible SaaS sidebar — OPT-IN (rendered by SharedAppLayout, which the
 * template root does NOT apply by default). Only reach for this when building a
 * SaaS / dashboard app; landing & marketing pages stay full-bleed.
 *
 * Expands to 15rem, collapses to 3rem (icon-only).
 * State is persisted to localStorage. Tooltips appear automatically when collapsed.
 *
 * A native flex-col implementation (shadcn Button/Avatar/Tooltip primitives) for
 * full layout control — every line is yours to edit.
 */
import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Activity,
  Globe2,
  LayoutDashboard,
  MonitorSmartphone,
  PanelLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link, useLocation } from '@tanstack/react-router'

const SIDEBAR_KEY = 'sidebar_collapsed'

interface NavItemDef {
  href: '/app' | '/app/clients' | '/app/servers' | '/app/tailscale'
  icon: ReactNode
  label: string
}

// Every href here MUST have a real route file, and every page you add under
// `src/routes/app/` should get an entry here — a nav link with no route ships a
// 404. Only the shipped dashboard route is listed; add yours as you create them,
// e.g. `src/routes/app/items.tsx` → { href: '/app/items', label: 'Items' }.
const NAV_ITEMS: NavItemDef[] = [
  { href: '/app', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Apžvalga' },
  { href: '/app/tailscale', icon: <MonitorSmartphone className="h-4 w-4" />, label: 'Tailscale' },
  { href: '/app/servers', icon: <Globe2 className="h-4 w-4" />, label: 'Serveriai' },
]

function NavItem({ item, collapsed }: { item: NavItemDef; collapsed: boolean }) {
  const { pathname } = useLocation()
  const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(`${item.href}/`))
  const link = (
    <Link
      to={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-200 cursor-pointer',
        collapsed ? 'justify-center w-8 h-8 mx-auto' : 'px-3 py-2 w-full',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

export function AppSidebarShell() {
  // SSR always renders expanded; the saved preference is restored after mount.
  // Reading localStorage in the initializer makes the client's first render
  // differ from the server markup → hydration mismatch on hard refresh.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (localStorage.getItem(SIDEBAR_KEY) === 'true') setCollapsed(true)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border overflow-hidden',
          'transition-[width] duration-200 ease-linear shrink-0',
          collapsed ? 'w-[3rem]' : 'w-[15rem]'
        )}
      >
        {/* ── Header ────────────────────────────────────── */}
        <div
          className={cn(
            'flex items-center gap-2 shrink-0 border-b border-border h-[52px] px-3',
            collapsed && 'justify-center px-2'
          )}
        >
          {!collapsed && (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sidebar-border bg-sidebar">
                <img src="/safestack-logo.png" alt="" className="h-[240%] w-[240%] max-w-none translate-y-[15%] object-cover" />
              </div>
              <span className="flex-1 font-semibold text-sm tracking-tight truncate">SafeStack</span>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
              className="h-7 w-7 p-0 shrink-0 text-sidebar-foreground/65 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
                onClick={toggle}
              >
                <PanelLeft
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    collapsed && 'rotate-180'
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── Nav (only this section scrolls) ───────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-0.5">
          {!collapsed && (
            <p className="px-3 pt-1 pb-1 text-[10px] font-medium text-sidebar-foreground/55 uppercase tracking-wider">
              VALDYMAS
            </p>
          )}
          {NAV_ITEMS.map(item => (
            <NavItem key={item.href} item={item} collapsed={collapsed} />
          ))}
        </div>

        {/* ── Footer status (pinned to the bottom) ───────── */}
        <div className={cn('shrink-0 border-t border-sidebar-border', collapsed ? 'p-2' : 'p-3')}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <Activity className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Demo aplinka · visi regionai veikia</TooltipContent>
            </Tooltip>
          ) : (
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground">
                <span className="h-2 w-2 rounded-full bg-sidebar-primary shadow-[0_0_12px_var(--color-sidebar-primary)]" />
                Visi regionai veikia
              </div>
              <p className="mt-1.5 pl-4 text-[10px] leading-relaxed text-sidebar-foreground/60">
                Demonstracinė aplinka
              </p>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
