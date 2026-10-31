import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const COOKIE = 'vpn_hub_session'
const SESSION_MS = 8 * 60 * 60 * 1000
export type Config = { origin: string; passwordHash: string; tailscaleApiKey?: string; secureCookies: boolean }

type Device = { id: string; name?: string; hostname?: string; user?: string; addresses?: string[]; os?: string; clientVersion?: string; lastSeen?: string; connectedToControl?: boolean; authorized?: boolean }
export function parseDevices(data: unknown): Device[] {
  if (!data || typeof data !== 'object' || !('devices' in data) || !Array.isArray(data.devices)) throw new Error('Invalid devices envelope')
  return data.devices.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid device')
    const d = item as Record<string, unknown>
    const id = typeof d.id === 'string' ? d.id : typeof d.nodeId === 'string' ? d.nodeId : ''
    if (!id) throw new Error('Missing device ID')
    const text = (key: string) => typeof d[key] === 'string' ? d[key] as string : undefined
    return { id, name: text('name'), hostname: text('hostname'), user: text('user'),
      addresses: Array.isArray(d.addresses) ? d.addresses.filter((v): v is string => typeof v === 'string') : [],
      os: text('os'), clientVersion: text('clientVersion'), lastSeen: text('lastSeen'),
      connectedToControl: typeof d.connectedToControl === 'boolean' ? d.connectedToControl : undefined,
      authorized: typeof d.authorized === 'boolean' ? d.authorized : undefined }
  })
}
function apiError(status: number) {
  if (status === 401) return 'Tailscale API raktas neteisingas arba pasibaigęs.'
  if (status === 403) return 'Tailscale raktui trūksta teisių įrenginiams valdyti.'
  if (status === 404) return 'Tailnet arba įrenginys nerastas.'
  if (status === 429) return 'Tailscale API užklausų limitas pasiektas. Pabandykite vėliau.'
  return `Tailscale API grąžino klaidą (${status}).`
}
export function createApp(config: Config, upstream: typeof fetch = fetch) {
  const origin = new URL(config.origin).origin
  if (origin !== config.origin || (config.secureCookies && !origin.startsWith('https://'))) throw new Error('PUBLIC_ORIGIN must be an origin; production requires HTTPS')
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.passwordHash)) throw new Error('Set ADMIN_PASSWORD_HASH using npm run password:hash')
  const [salt, hash] = config.passwordHash.split(':')
  const sessions = new Map<string, number>()
  const digest = (token: string) => createHash('sha256').update(token).digest('hex')
  let loginAttempts = 0
  let loginWindow = Date.now()
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store')
    await next()
  })
  app.use('/api/*', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'Užklausa per didelė.' }, 413) }))
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      if (c.req.header('Origin') !== origin) return c.json({ error: 'Neleistina užklausos kilmė.' }, 403)
      if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) return c.json({ error: 'Reikalingas JSON formatas.' }, 415)
    }
    await next()
  })
  function authenticated(token?: string) {
    if (!token || token.length !== 64) return false
    const key = digest(token)
    const expiry = sessions.get(key)
    if (!expiry || expiry <= Date.now()) { sessions.delete(key); return false }
    return true
  }
  app.get('/api/health', c => c.json({ ok: true }))
  app.get('/api/auth/session', c => c.json({ signedIn: authenticated(getCookie(c, COOKIE)) }))
  app.post('/api/auth/login', async c => {
    if (Date.now() - loginWindow > 60000) { loginAttempts = 0; loginWindow = Date.now() }
    if (loginAttempts >= 10) { c.header('Retry-After', '60'); return c.json({ error: 'Per daug bandymų. Pabandykite po minutės.' }, 429) }
    loginAttempts++
    const body = await c.req.json<{ password?: unknown }>().catch(() => null)
    if (!body || typeof body.password !== 'string' || body.password.length > 1024) return c.json({ error: 'Nurodykite slaptažodį.' }, 400)
    const derived = await scrypt(body.password, salt, 64) as Buffer
    if (!timingSafeEqual(derived, Buffer.from(hash, 'hex'))) return c.json({ error: 'Neteisingas slaptažodis.' }, 401)
    for (const [key, expires] of sessions) if (expires <= Date.now()) sessions.delete(key)
    const old = getCookie(c, COOKIE)
    if (old) sessions.delete(digest(old))
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!)
    const token = randomBytes(32).toString('hex')
    sessions.set(digest(token), Date.now() + SESSION_MS)
    setCookie(c, COOKIE, token, { httpOnly: true, secure: config.secureCookies, sameSite: 'Strict', path: '/', maxAge: SESSION_MS / 1000 })
    return c.json({ ok: true })
  })
  app.post('/api/auth/logout', c => {
    const token = getCookie(c, COOKIE)
    if (token) sessions.delete(digest(token))
    deleteCookie(c, COOKIE, { path: '/', secure: config.secureCookies, sameSite: 'Strict' })
    return c.json({ ok: true })
  })
  app.use('/api/tailscale/*', async (c, next) => {
    if (!authenticated(getCookie(c, COOKIE))) return c.json({ error: 'Prisijunkite prie administravimo aplinkos.' }, 401)
    if (!config.tailscaleApiKey) return c.json({ error: 'Tailscale API raktas dar nesukonfigūruotas.' }, 503)
    await next()
  })
  const headers = { Authorization: `Bearer ${config.tailscaleApiKey}` }
  app.post('/api/tailscale/devices', async c => {
    try {
      const response = await upstream('https://api.tailscale.com/api/v2/tailnet/-/devices?fields=all', { headers, signal: AbortSignal.timeout(10000) })
      if (!response.ok) return c.json({ error: apiError(response.status) }, 502)
      return c.json({ devices: parseDevices(await response.json()) })
    } catch { return c.json({ error: 'Nepavyko gauti Tailscale įrenginių arba atsakymo formatas netinkamas.' }, 502) }
  })
  app.post('/api/tailscale/device/expire', async c => {
    const body = await c.req.json<{ deviceId?: unknown }>().catch(() => null)
    if (!body || typeof body.deviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.deviceId)) return c.json({ error: 'Nurodykite galiojantį įrenginio ID.' }, 400)
    try {
      const response = await upstream(`https://api.tailscale.com/api/v2/device/${encodeURIComponent(body.deviceId)}/expire`, { method: 'POST', headers, signal: AbortSignal.timeout(10000) })
      if (!response.ok) return c.json({ error: apiError(response.status) }, 502)
      return c.json({ ok: true })
    } catch { return c.json({ error: 'Nepavyko atšaukti įrenginio rakto.' }, 502) }
  })
  app.all('/api/*', c => c.json({ error: 'API kelias nerastas.' }, 404))
  return app
}
