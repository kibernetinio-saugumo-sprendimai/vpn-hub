import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, LockKeyhole, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLoginMutation } from '@/lib/queries'
import { useTheme } from '@/lib/theme'

export function LoginScreen() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const loginMutation = useLoginMutation()
  const { theme, toggleTheme } = useTheme()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password) return
    try {
      await loginMutation.mutateAsync(password)
      setPassword('')
    } catch {
      // Error rendered from loginMutation.error
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col justify-between bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/favicon.png"
            alt="SafeStack"
            className="size-8 rounded-lg border border-border/80 object-cover"
          />
          <span className="text-sm font-semibold tracking-tight">SafeStack VPN Hub</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Įjungti šviesią temą' : 'Įjungti tamsią temą'}
          className="rounded-xl"
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 items-center py-8">
        <Card className="w-full border-border/80 shadow-md">
          <CardContent className="p-7 sm:p-9">
            <div className="text-center">
              <div className="mx-auto flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-border/80 bg-[#050b16] shadow-sm">
                <img src="/favicon.png" alt="" className="size-12 object-contain" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight">
                Administratoriaus prisijungimas
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Prisijunkite serveryje nustatytu slaptažodžiu, kad valdytumėte SafeStack Tailscale VPN tinklą.
              </p>
            </div>

            <form className="mt-7 space-y-4" onSubmit={event => void handleSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Administratoriaus slaptažodis</Label>
                <div className="relative">
                  <Input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoFocus
                    required
                    maxLength={1024}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Įveskite slaptažodį..."
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(current => !current)}
                    aria-label={showPassword ? 'Slėpti slaptažodį' : 'Rodyti slaptažodį'}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {loginMutation.error && (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive"
                >
                  {loginMutation.error instanceof Error
                    ? loginMutation.error.message
                    : 'Prisijungti nepavyko.'}
                </div>
              )}

              <Button
                type="submit"
                className="h-10 w-full rounded-xl"
                disabled={loginMutation.isPending || password.length === 0}
              >
                <LockKeyhole className="size-4" />
                {loginMutation.isPending ? 'Jungiamasi...' : 'Prisijungti'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Saugus savarankiškai talpinamas valdymo centras · Tailscale API raktas saugomas tik serveryje
      </p>
    </main>
  )
}

