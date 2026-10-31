import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { useLocation } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

interface ShellProps {
  sidebar: ReactNode
  appName?: string
  children: ReactNode
}

export function Shell({ sidebar, appName = 'SafeStack VPN', children }: ShellProps) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh shrink-0 md:block">{sidebar}</aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">{appName} navigacija</SheetTitle>
          <SheetDescription className="sr-only">
            Pagrindinis valdymo skydelio meniu
          </SheetDescription>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            aria-label="Atidaryti meniu"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <img src="/favicon.png" alt="" className="size-6 rounded-md object-cover" />
          <span className="truncate text-sm font-semibold">{appName}</span>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  )
}
