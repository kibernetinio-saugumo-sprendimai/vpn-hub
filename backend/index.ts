import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isIP } from 'node:net'
import { extname } from 'node:path'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

const SESSION_COOKIE = 'vpn_hub_session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 60_000
const MAX_LOGIN_ATTEMPTS_PER_CLIENT = 10
const MAX_LOGIN_ATTEMPTS_GLOBAL = 60
const MAX_TRACKED_CLIENTS = 1000
const MAX_SESSIONS = 100
const UPSTREAM_TIMEOUT_MS = 10_000
const TAILSCALE_API_BASE = 'https://api.tailscale.com/api/v2'

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/
const PASSWORD_HASH_PATTERN = /^[a-f0-9]{32}:[a-f0-9]{128}$/

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export type Config = {
  origin: string
  passwordHash: string
  tailscaleApiKey?: string
  secureCookies: boolean
  trustProxy?: boolean
}

export type DeviceLatency = {
  region: string
  latencyMs: number
  preferred: boolean
}

export type Device = {
  id: string
  nodeId?: string
  name?: string
  hostname?: string
  user?: string
  addresses: string[]
  os?: string
  clientVersion?: string
  updateAvailable?: boolean
  created?: string
  lastSeen?: string
  expires?: string
  keyExpiryDisabled?: boolean
  connectedToControl?: boolean
  authorized?: boolean
  isExternal?: boolean
  blocksIncomingConnections?: boolean
  advertisedRoutes: string[]
  enabledRoutes: string[]
  tags: string[]
  tailnetLockError?: string
  derp?: string
  latencyMs?: number
  latencies: DeviceLatency[]
}

export function isValidCidr(value: string): boolean {
  if (value.length > 64) return false
  const slashIndex = value.indexOf('/')
  if (slashIndex <= 0 || slashIndex !== value.lastIndexOf('/')) return false

  const ip = value.slice(0, slashIndex)
  const prefixText = value.slice(slashIndex + 1)
  if (!/^\d{1,3}$/.test(prefixText)) return false

  const prefix = Number(prefixText)
  const family = isIP(ip)
  if (family === 4) return prefix >= 0 && prefix <= 32
  if (family === 6) return prefix >= 0 && prefix <= 128
  return false
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function readUser(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.loginName === 'string' && obj.loginName.trim()) return obj.loginName.trim()
    if (typeof obj.displayName === 'string' && obj.displayName.trim()) return obj.displayName.trim()
  }
  return undefined
}

export function parseDevices(data: unknown): Device[] {
  if (!data || typeof data !== 'object' || !('devices' in data) || !Array.isArray(data.devices)) {
    throw new Error('Invalid devices envelope')
  }

  return data.devices.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid device')
    const raw = item as Record<string, unknown>

    const id = typeof raw.id === 'string' && raw.id
      ? raw.id
      : typeof raw.nodeId === 'string' && raw.nodeId
        ? raw.nodeId
        : ''
    if (!id) throw new Error('Missing device ID')

    const text = (key: string): string | undefined =>
      typeof raw[key] === 'string' && (raw[key] as string).length > 0 ? (raw[key] as string) : undefined
    const bool = (key: string): boolean | undefined =>
      typeof raw[key] === 'boolean' ? (raw[key] as boolean) : undefined

    let derp: string | undefined
    let latencyMs: number | undefined
    const latencies: DeviceLatency[] = []

    if (raw.clientConnectivity && typeof raw.clientConnectivity === 'object') {
      const connectivity = raw.clientConnectivity as Record<string, unknown>
      if (typeof connectivity.derp === 'string' && connectivity.derp.trim()) {
        derp = connectivity.derp.trim()
      }
      if (connectivity.latency && typeof connectivity.latency === 'object') {
        for (const [region, details] of Object.entries(connectivity.latency as Record<string, unknown>)) {
          if (!region || !details || typeof details !== 'object') continue
          const metric = details as Record<string, unknown>
          if (typeof metric.latencyMs === 'number' && Number.isFinite(metric.latencyMs) && metric.latencyMs >= 0) {
            latencies.push({
              region,
              latencyMs: Math.round(metric.latencyMs * 10) / 10,
              preferred: metric.preferred === true,
            })
          }
        }
        latencies.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.latencyMs - b.latencyMs)
        const primary = latencies.find(entry => entry.preferred) ?? latencies[0]
        if (primary) {
          latencyMs = primary.latencyMs
          if (!derp && primary.preferred) {
            derp = primary.region
          }
        }
      }
    }

    const device: Device = {
      id,
      addresses: readStringArray(raw.addresses),
      advertisedRoutes: readStringArray(raw.advertisedRoutes),
      enabledRoutes: readStringArray(raw.enabledRoutes),
      tags: readStringArray(raw.tags),
      latencies,
    }

    const nodeId = text('nodeId')
    const name = text('name')
    const hostname = text('hostname')
    const user = readUser(raw.user)
    const os = text('os')
    const clientVersion = text('clientVersion')
    const updateAvailable = bool('updateAvailable')
    const created = text('created')
    const lastSeen = text('lastSeen')
    const expires = text('expires')
    const keyExpiryDisabled = bool('keyExpiryDisabled')
    const connectedToControl = bool('connectedToControl')
    const authorized = bool('authorized')
    const isExternal = bool('isExternal')
    const blocksIncomingConnections = bool('blocksIncomingConnections')
    const tailnetLockError = text('tailnetLockError')

    if (nodeId) device.nodeId = nodeId
    if (name) device.name = name
    if (hostname) device.hostname = hostname
    if (user) device.user = user
    if (os) device.os = os
    if (clientVersion) device.clientVersion = clientVersion
    if (updateAvailable !== undefined) device.updateAvailable = updateAvailable
    if (created) device.created = created
    if (lastSeen) device.lastSeen = lastSeen
    if (expires) device.expires = expires
    if (keyExpiryDisabled !== undefined) device.keyExpiryDisabled = keyExpiryDisabled
    if (connectedToControl !== undefined) device.connectedToControl = connectedToControl
    if (authorized !== undefined) device.authorized = authorized
    if (isExternal !== undefined) device.isExternal = isExternal
    if (blocksIncomingConnections !== undefined) device.blocksIncomingConnections = blocksIncomingConnections
    if (tailnetLockError) device.tailnetLockError = tailnetLockError
    if (derp) device.derp = derp
    if (latencyMs !== undefined) device.latencyMs = latencyMs

    return device
  })
}

export function inferTailnetDomain(devices: Device[]): string | null {
  for (const device of devices) {
    if (!device.name) continue
    const normalized = device.name.replace(/\.$/, '')
    const dotIndex = normalized.indexOf('.')
    if (dotIndex > 0 && dotIndex < normalized.length - 1) {
      return normalized.slice(dotIndex + 1)
    }
  }
  return null
}

function mapUpstreamError(status: number): string {
  if (status === 401) return 'Tailscale API raktas neteisingas arba pasibaigęs.'
  if (status === 403) return 'Tailscale API raktui trūksta teisių šiam veiksmui atlikti.'
  if (status === 404) return 'Tailnet arba nurodytas įrenginys nerastas.'
  if (status === 429) return 'Tailscale API užklausų limitas pasiektas. Pabandykite vėliau.'
  return `Tailscale API grąžino klaidą (${status}).`
}

function getClientKey(c: Context, trustProxy: boolean): string {
  if (!trustProxy) return 'default'
  // Exactly one trusted local reverse proxy: its appended, rightmost address is authoritative.
  const forwarded = c.req.header('x-forwarded-for')
  const address = forwarded !== undefined
    ? forwarded.split(',').at(-1)?.trim()
    : c.req.header('x-real-ip')?.trim()
  if (!address || address.length > 64) return 'default'
  const family = isIP(address)
  if (family === 4) return address
  if (family === 6 && !address.includes('%')) {
    // Canonicalize equivalent IPv6 spellings into a single rate-limit bucket.
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1)
    // Treat the common IPv4-mapped form as the same client as native IPv4.
    const mapped = canonical.match(/^::ffff:([a-f0-9]+):([a-f0-9]+)$/)
    if (mapped) {
      const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16)
      return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
    }
    return canonical
  }
  return 'default'
}

export function createApp(config: Config, upstream: typeof fetch = fetch) {
  const origin = new URL(config.origin).origin
  if (origin !== config.origin || (config.secureCookies && !origin.startsWith('https://'))) {
    throw new Error('PUBLIC_ORIGIN must be an exact origin; production requires HTTPS')
  }
  if (!PASSWORD_HASH_PATTERN.test(config.passwordHash)) {
    throw new Error('Set ADMIN_PASSWORD_HASH using npm run password:hash')
  }

  const [salt, expectedHashHex] = config.passwordHash.split(':')
  const expectedHash = Buffer.from(expectedHashHex, 'hex')
  const trustProxy = config.trustProxy === true

  const sessions = new Map<string, number>()
  const clientAttempts = new Map<string, { count: number; resetAt: number }>()
  let globalAttempts = { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS }

  const digest = (token: string) => createHash('sha256').update(token).digest('hex')

  function isAuthenticated(token?: string): boolean {
    if (!token || token.length !== 64) return false
    const key = digest(token)
    const expiry = sessions.get(key)
    if (!expiry || expiry <= Date.now()) {
      sessions.delete(key)
      return false
    }
    return true
  }

  function validateDeviceId(value: unknown): value is string {
    return typeof value === 'string' && DEVICE_ID_PATTERN.test(value)
  }

  const app = new Hono()

  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY)
    if (config.secureCookies) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    if (c.req.path.startsWith('/api/')) {
      c.header('Cache-Control', 'no-store')
    }
    await next()
  })

  app.use('/api/*', bodyLimit({
    maxSize: 16_384,
    onError: c => c.json({ error: 'Užklausa per didelė.' }, 413),
  }))

  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      if (c.req.header('Origin') !== origin) {
        return c.json({ error: 'Neleistina užklausos kilmė.' }, 403)
      }
      if (c.req.method !== 'DELETE') {
        const contentType = c.req.header('Content-Type')?.toLowerCase() ?? ''
        if (!contentType.startsWith('application/json')) {
          return c.json({ error: 'Reikalingas JSON formatas.' }, 415)
        }
      }
    }
    await next()
  })

  app.get('/api/health', c => c.json({ ok: true }))

  app.get('/api/auth/session', c => {
    const signedIn = isAuthenticated(getCookie(c, SESSION_COOKIE))
    if (!signedIn) return c.json({ signedIn: false })
    return c.json({
      signedIn: true,
      tailscaleConfigured: Boolean(config.tailscaleApiKey),
    })
  })

  app.post('/api/auth/login', async c => {
    const now = Date.now()
    if (now >= globalAttempts.resetAt) {
      globalAttempts = { count: 0, resetAt: now + LOGIN_WINDOW_MS }
    }
    for (const [ip, record] of clientAttempts) {
      if (now >= record.resetAt) clientAttempts.delete(ip)
    }

    const clientKey = getClientKey(c, trustProxy)
    let clientRecord = clientAttempts.get(clientKey)
    if (!clientRecord || now >= clientRecord.resetAt) {
      if (!clientRecord && clientAttempts.size >= MAX_TRACKED_CLIENTS) {
        clientAttempts.delete(clientAttempts.keys().next().value!)
      }
      clientRecord = { count: 0, resetAt: now + LOGIN_WINDOW_MS }
      clientAttempts.set(clientKey, clientRecord)
    }

    if (
      clientRecord.count >= MAX_LOGIN_ATTEMPTS_PER_CLIENT ||
      globalAttempts.count >= MAX_LOGIN_ATTEMPTS_GLOBAL
    ) {
      const retrySeconds = Math.max(1, Math.ceil((clientRecord.resetAt - now) / 1000))
      c.header('Retry-After', String(retrySeconds))
      return c.json({ error: 'Per daug prisijungimo bandymų. Pabandykite po minutės.' }, 429)
    }

    clientRecord.count++
    globalAttempts.count++

    const body = await c.req.json<{ password?: unknown }>().catch(() => null)
    if (!body || typeof body.password !== 'string' || body.password.length === 0 || body.password.length > 1024) {
      return c.json({ error: 'Nurodykite slaptažodį.' }, 400)
    }

    const derived = (await scrypt(body.password, salt, 64)) as Buffer
    if (!timingSafeEqual(derived, expectedHash)) {
      return c.json({ error: 'Neteisingas slaptažodis.' }, 401)
    }

    clientAttempts.delete(clientKey)

    for (const [key, expiresAt] of sessions) {
      if (expiresAt <= now) sessions.delete(key)
    }
    const previousToken = getCookie(c, SESSION_COOKIE)
    if (previousToken) sessions.delete(digest(previousToken))
    if (sessions.size >= MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value!)
    }

    const token = randomBytes(32).toString('hex')
    sessions.set(digest(token), now + SESSION_TTL_MS)
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    })

    return c.json({
      ok: true,
      tailscaleConfigured: Boolean(config.tailscaleApiKey),
    })
  })

  app.post('/api/auth/logout', c => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) sessions.delete(digest(token))
    deleteCookie(c, SESSION_COOKIE, {
      path: '/',
      secure: config.secureCookies,
      sameSite: 'Strict',
    })
    return c.json({ ok: true })
  })

  app.use('/api/tailscale/*', async (c, next) => {
    if (!isAuthenticated(getCookie(c, SESSION_COOKIE))) {
      return c.json({ error: 'Prisijunkite prie administravimo aplinkos.' }, 401)
    }
    if (!config.tailscaleApiKey) {
      return c.json({ error: 'Tailscale API raktas dar nesukonfigūruotas serveryje.' }, 503)
    }
    await next()
  })

  async function callTailscale(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.tailscaleApiKey}`,
    }
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    return upstream(`${TAILSCALE_API_BASE}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  }

  async function handleListDevices(c: Context) {
    try {
      const response = await callTailscale('/tailnet/-/devices?fields=all')
      if (!response.ok) return c.json({ error: mapUpstreamError(response.status) }, 502)
      const devices = parseDevices(await response.json())
      return c.json({
        devices,
        tailnet: inferTailnetDomain(devices),
        syncedAt: new Date().toISOString(),
      })
    } catch {
      return c.json({ error: 'Nepavyko gauti Tailscale įrenginių arba atsakymo formatas netinkamas.' }, 502)
    }
  }

  async function expireDeviceById(c: Context, deviceId: unknown) {
    if (!validateDeviceId(deviceId)) {
      return c.json({ error: 'Nurodykite galiojantį įrenginio ID.' }, 400)
    }
    try {
      const response = await callTailscale(`/device/${encodeURIComponent(deviceId)}/expire`, {
        method: 'POST',
      })
      if (!response.ok) return c.json({ error: mapUpstreamError(response.status) }, 502)
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'Nepavyko atšaukti įrenginio rakto.' }, 502)
    }
  }

  app.get('/api/tailscale/devices', handleListDevices)
  app.post('/api/tailscale/devices', handleListDevices)

  app.post('/api/tailscale/device/expire', async c => {
    const body = await c.req.json<{ deviceId?: unknown }>().catch(() => null)
    return expireDeviceById(c, body?.deviceId)
  })

  app.post('/api/tailscale/devices/:deviceId/expire', async c => {
    return expireDeviceById(c, c.req.param('deviceId'))
  })

  app.post('/api/tailscale/devices/:deviceId/authorize', async c => {
    const deviceId = c.req.param('deviceId')
    if (!validateDeviceId(deviceId)) {
      return c.json({ error: 'Nurodykite galiojantį įrenginio ID.' }, 400)
    }
    const body = await c.req.json<{ authorized?: unknown }>().catch(() => null)
    if (!body || typeof body.authorized !== 'boolean') {
      return c.json({ error: 'Nurodykite patvirtinimo būseną (authorized).' }, 400)
    }
    try {
      const response = await callTailscale(`/device/${encodeURIComponent(deviceId)}/authorized`, {
        method: 'POST',
        body: JSON.stringify({ authorized: body.authorized }),
      })
      if (!response.ok) return c.json({ error: mapUpstreamError(response.status) }, 502)
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'Nepavyko pakeisti įrenginio patvirtinimo būsenos.' }, 502)
    }
  })

  app.post('/api/tailscale/devices/:deviceId/key', async c => {
    const deviceId = c.req.param('deviceId')
    if (!validateDeviceId(deviceId)) {
      return c.json({ error: 'Nurodykite galiojantį įrenginio ID.' }, 400)
    }
    const body = await c.req.json<{ keyExpiryDisabled?: unknown }>().catch(() => null)
    if (!body || typeof body.keyExpiryDisabled !== 'boolean') {
      return c.json({ error: 'Nurodykite rakto galiojimo nustatymą (keyExpiryDisabled).' }, 400)
    }
    try {
      const response = await callTailscale(`/device/${encodeURIComponent(deviceId)}/key`, {
        method: 'POST',
        body: JSON.stringify({ keyExpiryDisabled: body.keyExpiryDisabled }),
      })
      if (!response.ok) return c.json({ error: mapUpstreamError(response.status) }, 502)
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'Nepavyko atnaujinti įrenginio rakto galiojimo nustatymo.' }, 502)
    }
  })

  app.post('/api/tailscale/devices/:deviceId/routes', async c => {
    const deviceId = c.req.param('deviceId')
    if (!validateDeviceId(deviceId)) {
      return c.json({ error: 'Nurodykite galiojantį įrenginio ID.' }, 400)
    }
    const body = await c.req.json<{ routes?: unknown }>().catch(() => null)
    if (
      !body ||
      !Array.isArray(body.routes) ||
      body.routes.length > 128 ||
      !body.routes.every((route): route is string => typeof route === 'string' && isValidCidr(route))
    ) {
      return c.json({ error: 'Nurodykite galiojantį CIDR maršrutų sąrašą.' }, 400)
    }
    const uniqueRoutes = Array.from(new Set(body.routes))
    try {
      const response = await callTailscale(`/device/${encodeURIComponent(deviceId)}/routes`, {
        method: 'POST',
        body: JSON.stringify({ routes: uniqueRoutes }),
      })
      if (!response.ok) return c.json({ error: mapUpstreamError(response.status) }, 502)
      return c.json({ ok: true, routes: uniqueRoutes })
    } catch {
      return c.json({ error: 'Nepavyko atnaujinti įrenginio maršrutų.' }, 502)
    }
  })

  app.delete('/api/tailscale/devices/:deviceId', async c => {
    const deviceId = c.req.param('deviceId')
    if (!validateDeviceId(deviceId)) {
      return c.json({ error: 'Nurodykite galiojantį įrenginio ID.' }, 400)
    }
    try {
      const response = await callTailscale(`/device/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
      })
      if (!response.ok) return c.json({ error: mapUpstreamError(response.status) }, 502)
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'Nepavyko pašalinti įrenginio iš tailnet.' }, 502)
    }
  })

  app.all('/api/*', c => c.json({ error: 'API kelias nerastas.' }, 404))

  return app
}

export function mountStaticAssets(app: Hono, distRoot: string) {
  if (!existsSync(distRoot)) return app

  // Set headers on the finalized Response: the Node adapter creates it before onFound.
  app.use('*', async (c, next) => {
    await next()
    const cache = c.res.status >= 200 && c.res.status < 300
      ? c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
      : 'no-store'
    c.res.headers.set('Cache-Control', cache)
  })

  app.use('*', serveStatic({ root: distRoot }))

  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/assets/') || extname(c.req.path) !== '') {
      return c.text('Nerasta.', 404)
    }
    return serveStatic({ root: distRoot, path: 'index.html' })(c, next)
  })

  return app
}
