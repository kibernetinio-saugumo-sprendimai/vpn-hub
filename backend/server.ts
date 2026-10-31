import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './index.js'

const production = process.env.NODE_ENV === 'production'
const app = createApp({
  origin: process.env.PUBLIC_ORIGIN || 'http://localhost:3000',
  passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
  tailscaleApiKey: process.env.TAILSCALE_API_KEY,
  secureCookies: production,
})
app.use('*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))
const port = Number(process.env.PORT || 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
const server = serve({ fetch: app.fetch, hostname: process.env.HOST || '127.0.0.1', port }, () => console.log(`SafeStack VPN listening on port ${port}`))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => process.exit(0)) })
