export type DeviceLatency = {
  region: string
  latencyMs: number
  preferred: boolean
}

export type TailscaleDevice = {
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

export type DevicesResponse = {
  devices: TailscaleDevice[]
  tailnet: string | null
  syncedAt: string
}

export type DeviceStatusKind = 'online' | 'offline' | 'pending' | 'unknown'

const EXIT_NODE_ROUTES = new Set(['0.0.0.0/0', '::/0'])
const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000

export function isExitNodeRoute(route: string): boolean {
  return EXIT_NODE_ROUTES.has(route)
}

export function getDeviceName(device: TailscaleDevice): string {
  if (device.hostname) return device.hostname
  if (device.name) {
    const clean = device.name.replace(/\.$/, '')
    return clean.split('.')[0] || clean
  }
  return device.id
}

export function getDeviceFqdn(device: TailscaleDevice): string | null {
  if (!device.name) return null
  return device.name.replace(/\.$/, '')
}

export function getDeviceIpv4(device: TailscaleDevice): string | null {
  return device.addresses.find(addr => addr.includes('.')) ?? device.addresses[0] ?? null
}

export function getDeviceIpv6(device: TailscaleDevice): string | null {
  return device.addresses.find(addr => addr.includes(':')) ?? null
}

export function getDeviceStatus(device: TailscaleDevice): {
  kind: DeviceStatusKind
  label: string
} {
  if (device.authorized === false) {
    return { kind: 'pending', label: 'Laukiantis' }
  }
  if (device.connectedToControl === true) {
    return { kind: 'online', label: 'Prisijungęs' }
  }
  if (device.connectedToControl === false) {
    return { kind: 'offline', label: 'Atsijungęs' }
  }
  return { kind: 'unknown', label: 'Nežinoma' }
}

export function getExitNodeState(device: TailscaleDevice): 'approved' | 'pending' | 'none' {
  const advertised = device.advertisedRoutes.filter(isExitNodeRoute)
  if (advertised.length === 0) return 'none'
  const enabledSet = new Set(device.enabledRoutes)
  return advertised.every(route => enabledSet.has(route)) ? 'approved' : 'pending'
}

export function getSubnetRoutes(device: TailscaleDevice): {
  advertised: string[]
  enabled: string[]
  pending: string[]
} {
  const advertised = device.advertisedRoutes.filter(route => !isExitNodeRoute(route))
  const enabledSet = new Set(device.enabledRoutes)
  const enabled = advertised.filter(route => enabledSet.has(route))
  const pending = advertised.filter(route => !enabledSet.has(route))
  return { advertised, enabled, pending }
}

export function hasPendingRoutes(device: TailscaleDevice): boolean {
  const enabledSet = new Set(device.enabledRoutes)
  return device.advertisedRoutes.some(route => !enabledSet.has(route))
}

export function isInfrastructureNode(device: TailscaleDevice): boolean {
  return device.advertisedRoutes.length > 0 || device.tags.length > 0
}

export function getKeyExpiryInfo(device: TailscaleDevice, now = Date.now()): {
  state: 'disabled' | 'expired' | 'expiring_soon' | 'valid' | 'unknown'
  label: string
  daysLeft?: number
} {
  if (device.keyExpiryDisabled) {
    return { state: 'disabled', label: 'Neterminuotas' }
  }
  if (!device.expires) {
    return { state: 'unknown', label: 'Nėra duomenų' }
  }
  const expiresMs = new Date(device.expires).getTime()
  if (Number.isNaN(expiresMs) || expiresMs <= 0) {
    return { state: 'unknown', label: 'Nėra duomenų' }
  }
  const diff = expiresMs - now
  if (diff <= 0) {
    return { state: 'expired', label: 'Pasibaigęs' }
  }
  const daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000))
  if (diff <= EXPIRING_SOON_MS) {
    return { state: 'expiring_soon', label: `Liko ${daysLeft} d.`, daysLeft }
  }
  return { state: 'valid', label: formatDate(device.expires), daysLeft }
}

export function formatDateTime(value?: string): string {
  if (!value) return 'Nėra duomenų'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1971) return 'Nėra duomenų'
  return new Intl.DateTimeFormat('lt-LT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatDate(value?: string): string {
  if (!value) return 'Nėra duomenų'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1971) return 'Nėra duomenų'
  return new Intl.DateTimeFormat('lt-LT', { dateStyle: 'medium' }).format(date)
}

export function formatRelativeTime(value?: string, now = Date.now()): string {
  if (!value) return 'Nėra duomenų'
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp) || timestamp <= 0) return 'Nėra duomenų'

  const diffSeconds = Math.round((now - timestamp) / 1000)
  if (diffSeconds < 45) return 'Ką tik'
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `Prieš ${diffMinutes} min.`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `Prieš ${diffHours} val.`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays <= 30) return `Prieš ${diffDays} d.`
  return formatDate(value)
}

export type TailnetUserSummary = {
  identity: string
  initials: string
  isTaggedIdentity: boolean
  devices: TailscaleDevice[]
  onlineCount: number
  pendingCount: number
  osList: string[]
  lastSeen?: string
}

function computeInitials(identity: string): string {
  const clean = identity.replace(/^tag:/i, '').split('@')[0] || identity
  const parts = clean.split(/[._\s-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return clean.slice(0, 2).toUpperCase() || 'TS'
}

export function deriveTailnetUsers(devices: TailscaleDevice[]): TailnetUserSummary[] {
  const groups = new Map<string, TailscaleDevice[]>()

  for (const device of devices) {
    const key =
      device.user ||
      (device.tags.length > 0 ? device.tags[0] : 'Nepriskirta paskyra')
    const list = groups.get(key) ?? []
    list.push(device)
    groups.set(key, list)
  }

  const summaries: TailnetUserSummary[] = []

  for (const [identity, userDevices] of groups) {
    const onlineCount = userDevices.filter(d => getDeviceStatus(d).kind === 'online').length
    const pendingCount = userDevices.filter(d => getDeviceStatus(d).kind === 'pending').length
    const osSet = new Set<string>()
    let latestMs = 0
    let latestIso: string | undefined

    for (const dev of userDevices) {
      if (dev.os) osSet.add(dev.os)
      if (dev.connectedToControl) {
        const current = dev.lastSeen ? new Date(dev.lastSeen).getTime() : Date.now()
        if (current > latestMs) {
          latestMs = current
          latestIso = dev.lastSeen
        }
      } else if (dev.lastSeen) {
        const seenMs = new Date(dev.lastSeen).getTime()
        if (!Number.isNaN(seenMs) && seenMs > latestMs) {
          latestMs = seenMs
          latestIso = dev.lastSeen
        }
      }
    }

    const isTaggedIdentity =
      identity.startsWith('tag:') || identity === 'tagged-devices' || userDevices.every(d => d.tags.length > 0 && !d.user)

    summaries.push({
      identity,
      initials: computeInitials(identity),
      isTaggedIdentity,
      devices: userDevices,
      onlineCount,
      pendingCount,
      osList: Array.from(osSet),
      lastSeen: latestIso,
    })
  }

  return summaries.sort(
    (a, b) => b.onlineCount - a.onlineCount || b.devices.length - a.devices.length || a.identity.localeCompare(b.identity),
  )
}

export type DerpRegionSummary = {
  region: string
  preferredCount: number
  measuredCount: number
  minLatencyMs: number | null
  avgLatencyMs: number | null
}

export function deriveDerpRegions(devices: TailscaleDevice[]): DerpRegionSummary[] {
  const buckets = new Map<
    string,
    { preferredCount: number; latencies: number[]; seenDevices: Set<string> }
  >()

  const ensureBucket = (region: string) => {
    let bucket = buckets.get(region)
    if (!bucket) {
      bucket = { preferredCount: 0, latencies: [], seenDevices: new Set() }
      buckets.set(region, bucket)
    }
    return bucket
  }

  for (const device of devices) {
    if (device.derp) {
      const bucket = ensureBucket(device.derp)
      bucket.preferredCount++
      bucket.seenDevices.add(device.id)
    }
    for (const item of device.latencies) {
      const bucket = ensureBucket(item.region)
      bucket.latencies.push(item.latencyMs)
      bucket.seenDevices.add(device.id)
    }
  }

  const results: DerpRegionSummary[] = []
  for (const [region, bucket] of buckets) {
    const minLatencyMs =
      bucket.latencies.length > 0 ? Math.round(Math.min(...bucket.latencies) * 10) / 10 : null
    const avgLatencyMs =
      bucket.latencies.length > 0
        ? Math.round((bucket.latencies.reduce((sum, v) => sum + v, 0) / bucket.latencies.length) * 10) / 10
        : null

    results.push({
      region,
      preferredCount: bucket.preferredCount,
      measuredCount: bucket.seenDevices.size,
      minLatencyMs,
      avgLatencyMs,
    })
  }

  return results.sort(
    (a, b) =>
      b.preferredCount - a.preferredCount ||
      (a.avgLatencyMs ?? Number.POSITIVE_INFINITY) - (b.avgLatencyMs ?? Number.POSITIVE_INFINITY) ||
      a.region.localeCompare(b.region),
  )
}

