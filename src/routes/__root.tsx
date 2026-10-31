import { createRootRoute, HeadContent, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'

const queryClient = new QueryClient()
export const Route = createRootRoute({ component: Root })
function Root() {
  return <QueryClientProvider client={queryClient}><TooltipProvider delayDuration={0}>
    <HeadContent /><Toaster /><Outlet />
  </TooltipProvider></QueryClientProvider>
}
