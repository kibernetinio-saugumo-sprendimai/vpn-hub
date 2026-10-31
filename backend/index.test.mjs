import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { createApp } from '../dist-server/index.js'

const salt = '0123456789abcdef0123456789abcdef'
const password = 'test-password-123456789'
const config = { origin: 'https://vpn.example.test', secureCookies: true, tailscaleApiKey: 'fixture-secret', passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` }
const post = (body, cookie, origin = config.origin) => ({ method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
async function login(app) {
  const res = await app.request('/api/auth/login', post({ password }))
  assert.equal(res.status, 200)
  assert.match(res.headers.get('set-cookie'), /HttpOnly/)
  assert.match(res.headers.get('set-cookie'), /Secure/)
  assert.match(res.headers.get('set-cookie'), /SameSite=Strict/)
  return res.headers.get('set-cookie').split(';')[0]
}

test('all Tailscale endpoints reject unauthenticated requests without calling upstream', async () => {
  const app = createApp(config, async () => { throw new Error('must not call upstream') })
  for (const path of ['/api/tailscale/devices', '/api/tailscale/device/expire']) {
    assert.equal((await app.request(path, post({ deviceId: '123' }))).status, 401)
  }
})
test('correct API envelope is mapped; sensitive fields are excluded', async () => {
  const app = createApp(config, async (url, options) => {
    assert.match(url, /tailnet\/-\/devices\?fields=all$/)
    assert.equal(options.headers.Authorization, 'Bearer fixture-secret')
    return Response.json({ devices: [{ id: '123', hostname: 'laptop', addresses: ['100.1.2.3'], authorized: true, nodeKey: 'private' }] })
  })
  const cookie = await login(app)
  const res = await app.request('/api/tailscale/devices', post({}, cookie))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { devices: [{ id: '123', hostname: 'laptop', addresses: ['100.1.2.3'], authorized: true }] })
  assert.equal(res.headers.get('cache-control'), 'no-store')
})
test('logout invalidates the old cookie server-side', async () => {
  const app = createApp(config)
  const cookie = await login(app)
  assert.deepEqual(await (await app.request('/api/auth/session', { headers: { Cookie: cookie } })).json(), { signedIn: true })
  await app.request('/api/auth/logout', post({}, cookie))
  assert.deepEqual(await (await app.request('/api/auth/session', { headers: { Cookie: cookie } })).json(), { signedIn: false })
  assert.equal((await app.request('/api/tailscale/devices', post({}, cookie))).status, 401)
})
test('rejects wrong passwords, cross-origin writes, invalid JSON and excessive attempts', async () => {
  const app = createApp(config)
  assert.equal((await app.request('/api/auth/login', post({ password }, undefined, 'https://evil.test'))).status, 403)
  assert.equal((await app.request('/api/auth/login', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: '{' })).status, 400)
  for (let i = 0; i < 9; i++) assert.equal((await app.request('/api/auth/login', post({ password: 'wrong' }))).status, 401)
  assert.equal((await app.request('/api/auth/login', post({ password }))).status, 429)
})
test('malformed upstream data and upstream failures return 502', async () => {
  for (const fixture of [Response.json([]), Response.json({ devices: [null] }), new Response('secret error', { status: 403 })]) {
    const app = createApp(config, async () => fixture)
    const cookie = await login(app)
    const res = await app.request('/api/tailscale/devices', post({}, cookie))
    assert.equal(res.status, 502)
    assert.doesNotMatch(await res.text(), /secret error|fixture-secret/)
  }
})
test('expiry validates the ID and uses the protected upstream route', async () => {
  const calls = []
  const app = createApp(config, async (url, options) => { calls.push([url, options.method]); return new Response(null, { status: 204 }) })
  const cookie = await login(app)
  assert.equal((await app.request('/api/tailscale/device/expire', post({ deviceId: '../invalid' }, cookie))).status, 400)
  const response = await app.request('/api/tailscale/device/expire', post({ deviceId: 'n123ABC' }, cookie))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [['https://api.tailscale.com/api/v2/device/n123ABC/expire', 'POST']])
})
test('missing Tailscale configuration fails closed', async () => {
  const app = createApp({ ...config, tailscaleApiKey: undefined })
  const cookie = await login(app)
  assert.equal((await app.request('/api/tailscale/devices', post({}, cookie))).status, 503)
  assert.throws(() => createApp({ ...config, passwordHash: '' }))
  assert.throws(() => createApp({ ...config, origin: 'http://vpn.example.test' }))
})
