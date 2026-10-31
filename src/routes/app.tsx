import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SharedAppLayout } from '@/layouts/shared-app-layout'
export const Route = createFileRoute('/app')({ component: AppLayout })
function AppLayout() {
  return <SharedAppLayout appName="SafeStack VPN"><Outlet /></SharedAppLayout>
}
