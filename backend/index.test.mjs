import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, isValidCidr, mountStaticAssets } from '../dist-server/index.js'

const salt = '0123456789abcdef0123456789abcdef'
const password = 'test-password-123456789'
const config = {
  origin: 'https://vpn.example.test',
  secureCookies: true,
  tailscaleApiKey: 'fixture-secret',
  passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
}

function post(body, cookie, origin = config.origin, extraHeaders = {}) {
  return {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}

async function login(app, extraHeaders = {}) {
  const res = await app.request('/api/auth/login', post({ password }, undefined, config.origin, extraHeaders))
  assert.equal(res.status, 200)
  const setCookie = res.headers.get('set-cookie') ?? ''
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /Secure/)
  assert.match(setCookie, /SameSite=Strict/)
  return setCookie.split(';')[0]
}

test('all Tailscale endpoints reject unauthenticated requests without calling upstream', async () => {
  const app = createApp(config, async () => {
    throw new Error('must not call upstream')
  })

  assert.equal((await app.request('/api/tailscale/devices')).status, 401)
  assert.equal((await app.request('/api/tailscale/devices', post({}))).status, 401)
  assert.equal((await app.request('/api/tailscale/device/expire', post({ deviceId: '123' }))).status, 401)
  assert.equal((await app.request('/api/tailscale/devices/123/expire', post({}))).status, 401)
  assert.equal((await app.request('/api/tailscale/devices/123/authorize', post({ authorized: true }))).status, 401)
  assert.equal((await app.request('/api/tailscale/devices/123/key', post({ keyExpiryDisabled: true }))).status, 401)
  assert.equal((await app.request('/api/tailscale/devices/123/routes', post({ routes: ['10.0.0.0/24'] }))).status, 401)
  assert.equal(
    (await app.request('/api/tailscale/devices/123', { method: 'DELETE', headers: { Origin: config.origin } })).status,
    401,
  )
})

test('correct API envelope is mapped with connectivity & routes while sensitive fields are excluded', async () => {
  const app = createApp(config, async (url, options) => {
    assert.match(String(url), /tailnet\/-\/devices\?fields=all$/)
    assert.equal(options.headers.Authorization, 'Bearer fixture-secret')
    return Response.json({
      devices: [
        {
          id: '123',
          nodeId: 'n123ABC',
          name: 'laptop.tail99.ts.net.',
          hostname: 'laptop',
          user: 'admin@safestack.lt',
          addresses: ['100.1.2.3', 'fd7a:115c:a1e0::1'],
          os: 'linux',
          clientVersion: '1.78.1',
          authorized: true,
          connectedToControl: true,
          keyExpiryDisabled: true,
          advertisedRoutes: ['10.10.0.0/16', '0.0.0.0/0'],
          enabledRoutes: ['10.10.0.0/16'],
          tags: ['tag:gateway'],
          nodeKey: 'private-node-key',
          machineKey: 'private-machine-key',
          clientConnectivity: {
            endpoints: ['203.0.113.10:41641'],
            derp: 'Frankfurt',
            latency: {
              Warsaw: { latencyMs: 14.24 },
              Frankfurt: { preferred: true, latencyMs: 18.67 },
            },
          },
        },
      ],
    })
  })

  const cookie = await login(app)
  const res = await app.request('/api/tailscale/devices', { headers: { Cookie: cookie } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self'/)
  assert.match(res.headers.get('strict-transport-security') ?? '', /max-age=31536000/)

  const body = await res.json()
  assert.equal(body.tailnet, 'tail99.ts.net')
  assert.equal(typeof body.syncedAt, 'string')
  assert.deepEqual(body.devices, [
    {
      id: '123',
      nodeId: 'n123ABC',
      name: 'laptop.tail99.ts.net.',
      hostname: 'laptop',
      user: 'admin@safestack.lt',
      addresses: ['100.1.2.3', 'fd7a:115c:a1e0::1'],
      os: 'linux',
      clientVersion: '1.78.1',
      authorized: true,
      connectedToControl: true,
      keyExpiryDisabled: true,
      advertisedRoutes: ['10.10.0.0/16', '0.0.0.0/0'],
      enabledRoutes: ['10.10.0.0/16'],
      tags: ['tag:gateway'],
      derp: 'Frankfurt',
      latencyMs: 18.7,
      latencies: [
        { region: 'Frankfurt', latencyMs: 18.7, preferred: true },
        { region: 'Warsaw', latencyMs: 14.2, preferred: false },
      ],
    },
  ])
})

test('logout invalidates the old cookie server-side and session hides config when signed out', async () => {
  const app = createApp(config)
  assert.deepEqual(await (await app.request('/api/auth/session')).json(), { signedIn: false })

  const cookie = await login(app)
  assert.deepEqual(await (await app.request('/api/auth/session', { headers: { Cookie: cookie } })).json(), {
    signedIn: true,
    tailscaleConfigured: true,
  })

  await app.request('/api/auth/logout', post({}, cookie))
  assert.deepEqual(await (await app.request('/api/auth/session', { headers: { Cookie: cookie } })).json(), {
    signedIn: false,
  })
  assert.equal((await app.request('/api/tailscale/devices', { headers: { Cookie: cookie } })).status, 401)
})

test('rejects wrong passwords, cross-origin writes, invalid JSON, and per-client excessive attempts', async () => {
  const app = createApp({ ...config, trustProxy: true })
  assert.equal((await app.request('/api/auth/login', post({ password }, undefined, 'https://evil.test'))).status, 403)
  assert.equal(
    (
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { Origin: config.origin, 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.5' },
        body: '{',
      })
    ).status,
    400,
  )
  for (let i = 0; i < 9; i++) {
    assert.equal(
      (await app.request('/api/auth/login', post({ password: 'wrong' }, undefined, config.origin, { 'X-Forwarded-For': '198.51.100.5' }))).status,
      401,
    )
  }
  assert.equal(
    (await app.request('/api/auth/login', post({ password }, undefined, config.origin, { 'X-Forwarded-For': '198.51.100.5' }))).status,
    429,
  )
  // Another client IP is not locked out by attacker IP
  const adminCookie = await login(app, { 'X-Forwarded-For': '198.51.100.99' })
  assert.ok(adminCookie)
})

test('malformed upstream data and upstream failures return 502 without leaking secrets', async () => {
  for (const makeFixture of [
    () => Response.json([]),
    () => Response.json({ devices: [null] }),
    () => new Response('secret error', { status: 403 }),
  ]) {
    const app = createApp(config, async () => makeFixture())
    const cookie = await login(app)
    const res = await app.request('/api/tailscale/devices', { headers: { Cookie: cookie } })
    assert.equal(res.status, 502)
    assert.doesNotMatch(await res.text(), /secret error|fixture-secret/)
  }
})

test('device management actions validate inputs and call the expected Tailscale v2 endpoints', async () => {
  const calls = []
  const app = createApp(config, async (url, options) => {
    calls.push({
      url: String(url),
      method: options.method ?? 'GET',
      body: options.body ? JSON.parse(String(options.body)) : null,
    })
    return new Response(null, { status: 204 })
  })

  const cookie = await login(app)

  assert.equal((await app.request('/api/tailscale/device/expire', post({ deviceId: '../invalid' }, cookie))).status, 400)
  assert.equal((await app.request('/api/tailscale/devices/n123ABC/authorize', post({ authorized: 'yes' }, cookie))).status, 400)
  assert.equal((await app.request('/api/tailscale/devices/n123ABC/key', post({ keyExpiryDisabled: 1 }, cookie))).status, 400)
  assert.equal((await app.request('/api/tailscale/devices/n123ABC/routes', post({ routes: ['999.1.1.1/24'] }, cookie))).status, 400)

  assert.equal((await app.request('/api/tailscale/devices/n123ABC/expire', post({}, cookie))).status, 200)
  assert.equal((await app.request('/api/tailscale/devices/n123ABC/authorize', post({ authorized: true }, cookie))).status, 200)
  assert.equal((await app.request('/api/tailscale/devices/n123ABC/key', post({ keyExpiryDisabled: true }, cookie))).status, 200)
  assert.equal(
    (await app.request('/api/tailscale/devices/n123ABC/routes', post({ routes: ['10.0.0.0/24', '0.0.0.0/0', '::/0'] }, cookie))).status,
    200,
  )
  assert.equal(
    (await app.request('/api/tailscale/devices/n123ABC', { method: 'DELETE', headers: { Origin: config.origin, Cookie: cookie } })).status,
    200,
  )
  assert.equal(
    (await app.request('/api/tailscale/devices/n123ABC', { method: 'DELETE', headers: { Origin: 'https://evil.test', Cookie: cookie } })).status,
    403,
  )

  assert.deepEqual(calls, [
    { url: 'https://api.tailscale.com/api/v2/device/n123ABC/expire', method: 'POST', body: null },
    { url: 'https://api.tailscale.com/api/v2/device/n123ABC/authorized', method: 'POST', body: { authorized: true } },
    { url: 'https://api.tailscale.com/api/v2/device/n123ABC/key', method: 'POST', body: { keyExpiryDisabled: true } },
    {
      url: 'https://api.tailscale.com/api/v2/device/n123ABC/routes',
      method: 'POST',
      body: { routes: ['10.0.0.0/24', '0.0.0.0/0', '::/0'] },
    },
    { url: 'https://api.tailscale.com/api/v2/device/n123ABC', method: 'DELETE', body: null },
  ])
})

test('CIDR validator accepts valid IPv4/IPv6 CIDRs and rejects malformed inputs', () => {
  assert.equal(isValidCidr('0.0.0.0/0'), true)
  assert.equal(isValidCidr('10.24.0.0/16'), true)
  assert.equal(isValidCidr('::/0'), true)
  assert.equal(isValidCidr('fd7a:115c:a1e0::/48'), true)
  assert.equal(isValidCidr('10.0.0.0/33'), false)
  assert.equal(isValidCidr('::/129'), false)
  assert.equal(isValidCidr('10.0.0.1'), false)
  assert.equal(isValidCidr('not-a-cidr/24'), false)
})

test('missing Tailscale configuration fails closed', async () => {
  const app = createApp({ ...config, tailscaleApiKey: undefined })
  const cookie = await login(app)
  assert.equal((await app.request('/api/tailscale/devices', { headers: { Cookie: cookie } })).status, 503)
  assert.throws(() => createApp({ ...config, passwordHash: '' }))
  assert.throws(() => createApp({ ...config, origin: 'http://vpn.example.test' }))
})

test('static asset mounting serves immutable hashed assets, SPA fallback, and 404 for missing files', async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'vpn-hub-dist-'))
  try {
    mkdirSync(join(fixtureDir, 'assets'))
    writeFileSync(join(fixtureDir, 'index.html'), '<!doctype html><title>SafeStack</title>')
    writeFileSync(join(fixtureDir, 'assets', 'app-123.js'), 'console.log("ok")')

    const app = mountStaticAssets(createApp(config), fixtureDir)

    const spaRes = await app.request('/app/tailscale')
    assert.equal(spaRes.status, 200)
    assert.equal(spaRes.headers.get('cache-control'), 'no-cache')
    assert.match(await spaRes.text(), /SafeStack/)

    const assetRes = await app.request('/assets/app-123.js')
    assert.equal(assetRes.status, 200)
    assert.equal(assetRes.headers.get('cache-control'), 'public, max-age=31536000, immutable')

    const missingAssetRes = await app.request('/assets/missing.js')
    assert.equal(missingAssetRes.status, 404)

    const missingExtRes = await app.request('/nonexistent.png')
    assert.equal(missingExtRes.status, 404)
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
})
