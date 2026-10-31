import { ArrowUpRight, KeyRound, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Props = {
  message?: string
  onRetry?: () => void
  retrying?: boolean
}

export function TailscaleNotConfiguredCard({ message, onRetry, retrying }: Props) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="size-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold tracking-tight">
                Nesukonfigūruotas Tailscale API raktas
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {message ||
                  'Serverio aplinkoje nerastas TAILSCALE_API_KEY kintamasis. Pridėkite API prieigos raktą su įrenginių valdymo teisėmis (devices:core / devices:routes) į .env failą ir perkraukite serverį.'}
              </p>
              <div className="pt-1 text-xs text-muted-foreground">
                Kintamasis serveryje: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">TAILSCALE_API_KEY=tskey-api-...</code>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onRetry && (
              <Button variant="outline" className="rounded-xl" onClick={onRetry} disabled={retrying}>
                <RefreshCw className={`size-4 ${retrying ? 'animate-spin' : ''}`} />
                Patikrinti iš naujo
              </Button>
            )}
            <Button asChild className="rounded-xl">
              <a href="https://login.tailscale.com/admin/settings/keys" target="_blank" rel="noreferrer">
                Tailscale API raktai
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

