import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { api } from './api.ts'
import { AUTH_QUERY_KEY, DEVICES_QUERY_KEY, handleSessionExpiry, setAuthSession, useExpireDeviceKeyMutation } from './queries.ts'
import { getRouteDraft, hasRouteConflict, sameRoutes } from './route-draft.ts'
import { deriveTailnetUsers, getDeviceIpv4, getDeviceIpv6 } from './tailscale.ts'

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

test('late session responses cannot undo a completed login or logout', async () => {
  for (const signedIn of [true, false]) {
    const client = new QueryClient()
    try {
      const oldSession = deferred()
      const pending = client.fetchQuery({ queryKey: AUTH_QUERY_KEY, queryFn: () => oldSession.promise }).catch(() => null)
      client.setQueryData(DEVICES_QUERY_KEY, { devices: [{ id: 'private-device' }] })
      await setAuthSession(client, { signedIn })
      oldSession.resolve({ signedIn: !signedIn })
      await pending
      assert.deepEqual(client.getQueryData(AUTH_QUERY_KEY), { signedIn })
      assert.equal(client.getQueryData(DEVICES_QUERY_KEY), undefined)
    } finally { client.clear() }
  }
})

test('session expiry from an active device query clears private data without deadlock', async () => {
  const client = new QueryClient()
  try {
    client.setQueryData(AUTH_QUERY_KEY, { signedIn: true })
    client.setQueryData(DEVICES_QUERY_KEY, { devices: [{ id: 'private-device' }] })
    const pending = client.fetchQuery({ queryKey: DEVICES_QUERY_KEY, staleTime: 0, queryFn: async () => {
      await setAuthSession(client, { signedIn: false })
      throw new Error('unauthorized')
    } }).catch(() => null)
    await pending
    // Let the cancelled query's transition finish before checking the authentication state.
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(client.getQueryData(AUTH_QUERY_KEY), { signedIn: false })
    assert.equal(client.getQueryData(DEVICES_QUERY_KEY), undefined)
  } finally { client.clear() }
})

test('api forwards query cancellation to fetch', async () => {
  const oldFetch = globalThis.fetch
  const controller = new AbortController()
  let observedSignal
  globalThis.fetch = async (_path, init) => {
    observedSignal = init.signal
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
  }
  try {
    const pending = api('/api/auth/session', { signal: controller.signal })
    controller.abort(new Error('cancelled old request'))
    await assert.rejects(pending, /cancelled old request/)
    assert.equal(observedSignal, controller.signal)
  } finally { globalThis.fetch = oldFetch }
})

test('background refresh preserves a route draft and flags concurrent server changes', () => {
  const device = { id: 'router', enabledRoutes: ['10.0.0.0/24'] }
  const draft = getRouteDraft(device, null)
  draft.routes.push('192.168.0.0/24')
  const refreshed = { ...device, enabledRoutes: [...device.enabledRoutes] }
  assert.deepEqual(getRouteDraft(refreshed, draft).routes, ['10.0.0.0/24', '192.168.0.0/24'])
  assert.equal(hasRouteConflict(refreshed, draft), false)
  assert.deepEqual(device.enabledRoutes, ['10.0.0.0/24'])
  assert.equal(hasRouteConflict({ ...device, enabledRoutes: [] }, draft), true)
  assert.deepEqual(getRouteDraft({ id: 'other-router', enabledRoutes: [] }, draft).routes, [])
  assert.equal(sameRoutes(['::/0', '0.0.0.0/0'], ['0.0.0.0/0', '::/0']), true)
})

test('IPv6-only devices do not invent an IPv4 address; online users get a current last-seen observation', () => {
  const device = { id: 'ipv6-only', user: 'admin@example.test', addresses: ['fd7a:115c:a1e0::1'], tags: [], latencies: [], advertisedRoutes: [], enabledRoutes: [], connectedToControl: true }
  assert.equal(getDeviceIpv4(device), null)
  assert.equal(getDeviceIpv6(device), 'fd7a:115c:a1e0::1')
  const before = Date.now()
  const [user] = deriveTailnetUsers([device])
  assert.ok(Date.parse(user.lastSeen) >= before)
  assert.ok(Date.parse(user.lastSeen) <= Date.now())
})

// Old mutations may finish after the administrator has started a new session.
test('a delayed old-session 401 cannot clear a newer login', async () => {
  const client = new QueryClient()
  try {
    const oldGeneration = 0
    await setAuthSession(client, { signedIn: false })
    await setAuthSession(client, { signedIn: true })
    client.setQueryData(DEVICES_QUERY_KEY, { devices: [{ id: 'new-session-device' }] })
    await handleSessionExpiry(client, oldGeneration)
    assert.deepEqual(client.getQueryData(AUTH_QUERY_KEY), { signedIn: true })
    assert.equal(client.getQueryData(DEVICES_QUERY_KEY).devices[0].id, 'new-session-device')
    await handleSessionExpiry(client, 2)
    assert.deepEqual(client.getQueryData(AUTH_QUERY_KEY), { signedIn: false })
  } finally { client.clear() }
})

test('an actual in-flight device mutation cannot sign out a later login', async () => {
  const client = new QueryClient()
  const oldFetch = globalThis.fetch
  const started = deferred()
  const response = deferred()
  let mutation
  function Host() { mutation = useExpireDeviceKeyMutation(); return null }
  globalThis.fetch = async () => { started.resolve(); return response.promise }
  try {
    renderToString(createElement(QueryClientProvider, { client }, createElement(Host)))
    const pending = mutation.mutateAsync('old-device').catch(() => null)
    await started.promise
    await setAuthSession(client, { signedIn: false })
    await setAuthSession(client, { signedIn: true })
    response.resolve(Response.json({ error: 'Old session expired' }, { status: 401 }))
    await pending
    assert.deepEqual(client.getQueryData(AUTH_QUERY_KEY), { signedIn: true })
  } finally { globalThis.fetch = oldFetch; client.clear() }
})
