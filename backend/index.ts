import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@blinkdotnew/sdk'

const app = new Hono()
const PROJECT_OWNER_ID = 'gcUc8tshYuUBexo4hWdqTzXie3X2'

app.use('*', cors({ allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type'] }))

app.use('/api/tailscale/*', async (c, next) => {
  const env = c.env as Record<string, string>
  try {
    const blink = createClient({ projectId: env.BLINK_PROJECT_ID, secretKey: env.BLINK_SECRET_KEY })
    const session = await blink.auth.verifyToken(c.req.header('Authorization') ?? '')
    if (!session.valid || !session.userId) return c.json({ error: 'Prisijunkite, kad galėtumėte valdyti Tailscale.' }, 401)
    if (session.userId !== PROJECT_OWNER_ID) return c.json({ error: 'Tailscale valdymas leidžiamas tik projekto savininkui.' }, 403)
  } catch {
    return c.json({ error: 'Nepavyko patvirtinti prisijungimo. Prisijunkite iš naujo.' }, 401)
  }
  await next()
})

function apiError(status: number) {
  if (status === 401) return 'Tailscale API raktas neteisingas arba pasibaigęs.'
  if (status === 403) return 'Tailscale raktui trūksta teisių įrenginiams valdyti.'
  if (status === 404) return 'Tailnet arba įrenginys nerastas.'
  if (status === 429) return 'Tailscale API užklausų limitas pasiektas. Pabandykite vėliau.'
  return `Tailscale API grąžino klaidą (${status}).`
}

app.post('/api/tailscale/devices', async (c) => {
  const env = c.env as Record<string, string>
  if (!env.TAILSCALE_API_KEY) return c.json({ error: 'Tailscale API raktas dar nesukonfigūruotas.' }, 503)

  try {
    const response = await fetch('https://api.tailscale.com/api/v2/tailnet/-/devices?fields=all', {
      headers: { Authorization: `Bearer ${env.TAILSCALE_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return c.json({ error: apiError(response.status) }, response.status as 400)

    const data: unknown = await response.json()
    if (!Array.isArray(data)) return c.json({ error: 'Tailscale API grąžino netikėtą įrenginių sąrašą.' }, 502)
    const devices = data.map((item: Record<string, unknown>) => ({
      id: String(item.id ?? item.nodeId ?? ''),
      name: item.name,
      hostname: item.hostname,
      user: item.user,
      addresses: item.addresses,
      os: item.os,
      clientVersion: item.clientVersion,
      lastSeen: item.lastSeen,
      connectedToControl: item.connectedToControl,
      authorized: item.authorized,
      expires: item.expires,
      keyExpiryDisabled: item.keyExpiryDisabled,
      tags: item.tags,
    })).filter((device: { id: string }) => device.id.length > 0)

    return c.json({ devices })
  } catch {
    return c.json({ error: 'Tailscale API nepasiekiamas arba užklausa baigėsi. Pabandykite dar kartą.' }, 502)
  }
})

app.post('/api/tailscale/device/expire', async (c) => {
  const env = c.env as Record<string, string>
  if (!env.TAILSCALE_API_KEY) return c.json({ error: 'Tailscale API raktas dar nesukonfigūruotas.' }, 503)

  const body = await c.req.json<{ deviceId?: unknown }>().catch(() => null)
  if (!body || typeof body.deviceId !== 'string' || body.deviceId.length === 0 || body.deviceId.length > 128) {
    return c.json({ error: 'Nurodykite galiojantį įrenginio ID.' }, 400)
  }

  try {
    const response = await fetch(`https://api.tailscale.com/api/v2/device/${encodeURIComponent(body.deviceId)}/expire`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TAILSCALE_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return c.json({ error: apiError(response.status) }, response.status as 400)
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Nepavyko atšaukti įrenginio rakto. Patikrinkite ryšį ir bandykite dar kartą.' }, 502)
  }
})

export default app
