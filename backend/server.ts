import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp, mountStaticAssets } from './index.js'

const production = process.env.NODE_ENV === 'production'
const distRoot = fileURLToPath(new URL('../dist', import.meta.url))

const app = createApp({
  origin: process.env.PUBLIC_ORIGIN || 'http://localhost:3000',
  passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
  tailscaleApiKey: process.env.TAILSCALE_API_KEY,
  secureCookies: production,
  trustProxy: process.env.TRUST_PROXY === 'true',
})

mountStaticAssets(app, distRoot)

const port = Number(process.env.PORT || 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid PORT')
}

const hostname = process.env.HOST || '127.0.0.1'
const server = serve({ fetch: app.fetch, hostname, port }, () => {
  console.log(`SafeStack VPN Hub listening on http://${hostname}:${port}`)
})

function shutdown() {
  const forceTimer = setTimeout(() => process.exit(0), 5000)
  forceTimer.unref()
  server.close(() => process.exit(0))
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, shutdown)
}
