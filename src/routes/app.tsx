import { Outlet, createFileRoute } from '@tanstack/react-router'
import { CircleAlert, RefreshCw } from 'lucide-react'
import { LoginScreen } from '@/components/LoginScreen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SharedAppLayout } from '@/layouts/shared-app-layout'
import { useAuthSession } from '@/lib/queries'

export const Route = createFileRoute('/app')({
  component: AppLayout,
})

function AppLayout() {
  const sessionQuery = useAuthSession()

  if (sessionQuery.isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Tikrinama administratoriaus sesija...
        </div>
      </main>
    )
  }

  if (sessionQuery.isError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border/80 shadow-sm">
          <CardContent className="p-6 text-center sm:p-8">
            <CircleAlert className="mx-auto size-8 text-destructive" />
            <h1 className="mt-4 text-lg font-semibold">Serveris nepasiekiamas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {sessionQuery.error instanceof Error
                ? sessionQuery.error.message
                : 'Nepavyko patikrinti prisijungimo būsenos.'}
            </p>
            <Button
              className="mt-5 rounded-xl"
              onClick={() => void sessionQuery.refetch()}
              disabled={sessionQuery.isFetching}
            >
              <RefreshCw className={`size-4 ${sessionQuery.isFetching ? 'animate-spin' : ''}`} />
              Bandyti dar kartą
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!sessionQuery.data?.signedIn) {
    return <LoginScreen />
  }

  return (
    <SharedAppLayout appName="SafeStack VPN">
      <Outlet />
    </SharedAppLayout>
  )
}
