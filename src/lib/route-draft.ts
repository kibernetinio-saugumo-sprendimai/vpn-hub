import type { TailscaleDevice } from './tailscale'

export type RouteDraft = { deviceId: string; baseline: string[]; routes: string[] }

type RouteDevice = Pick<TailscaleDevice, 'id' | 'enabledRoutes'>

export function getRouteDraft(device: RouteDevice, draft: RouteDraft | null): RouteDraft {
  return draft?.deviceId === device.id ? draft : {
    deviceId: device.id,
    baseline: [...device.enabledRoutes],
    routes: [...device.enabledRoutes],
  }
}

export function sameRoutes(left: string[], right: string[]): boolean {
  const expected = new Set(left)
  return expected.size === new Set(right).size && right.every(route => expected.has(route))
}

export function hasRouteConflict(device: RouteDevice, draft: RouteDraft): boolean {
  return draft.deviceId === device.id && !sameRoutes(device.enabledRoutes, draft.baseline)
}
