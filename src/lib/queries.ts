import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { DevicesResponse } from './tailscale'

export type SessionState = {
  signedIn: boolean
  tailscaleConfigured?: boolean
}

export const AUTH_QUERY_KEY = ['auth', 'session'] as const
export const DEVICES_QUERY_KEY = ['tailscale', 'devices'] as const

const sessionGenerations = new WeakMap<QueryClient, number>()
const sessionGeneration = (client: QueryClient) => sessionGenerations.get(client) ?? 0

export async function handleSessionExpiry(queryClient: QueryClient, generation: number) {
  if (generation === sessionGeneration(queryClient)) await setAuthSession(queryClient, { signedIn: false })
}

// Cancel old session responses before committing a login/logout/expiry transition.
export async function setAuthSession(queryClient: QueryClient, session: SessionState) {
  const generation = sessionGeneration(queryClient) + 1
  sessionGenerations.set(queryClient, generation)
  await queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY })
  await queryClient.cancelQueries({ queryKey: DEVICES_QUERY_KEY })
  if (generation !== sessionGeneration(queryClient)) return
  queryClient.removeQueries({ queryKey: DEVICES_QUERY_KEY })
  queryClient.setQueryData<SessionState>(AUTH_QUERY_KEY, session)
}

export function useAuthSession() {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const session = await api<SessionState>('/api/auth/session', { signal })
      if (!session.signedIn) {
        await queryClient.cancelQueries({ queryKey: DEVICES_QUERY_KEY })
        queryClient.removeQueries({ queryKey: DEVICES_QUERY_KEY })
      }
      return session
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useLoginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (password: string) =>
      api<{ ok: boolean; tailscaleConfigured: boolean }>('/api/auth/login', {
        method: 'POST',
        body: { password },
      }),
    onSuccess: async data => {
      await setAuthSession(queryClient, {
        signedIn: true,
        tailscaleConfigured: data.tailscaleConfigured,
      })
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => setAuthSession(queryClient, { signedIn: false }),
  })
}

export function useDevicesQuery(enabled = true) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: DEVICES_QUERY_KEY,
    enabled,
    queryFn: async ({ signal }) => {
      const generation = sessionGeneration(queryClient)
      try {
        return await api<DevicesResponse>('/api/tailscale/devices', { signal })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await handleSessionExpiry(queryClient, generation)
        }
        throw error
      }
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && [401, 403, 503].includes(error.status)) {
        return false
      }
      return failureCount < 1
    },
  })
}

function useDeviceMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onMutate: () => sessionGeneration(queryClient),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY })
    },
    onError: async (error, _variables, generation) => {
      if (error instanceof ApiError && error.status === 401 && generation !== undefined) {
        await handleSessionExpiry(queryClient, generation)
      }
    },
  })
}

export function useAuthorizeDeviceMutation() {
  return useDeviceMutation(({ deviceId, authorized }: { deviceId: string; authorized: boolean }) =>
    api(`/api/tailscale/devices/${encodeURIComponent(deviceId)}/authorize`, {
      method: 'POST',
      body: { authorized },
    }),
  )
}

export function useUpdateDeviceKeyMutation() {
  return useDeviceMutation(({ deviceId, keyExpiryDisabled }: { deviceId: string; keyExpiryDisabled: boolean }) =>
    api(`/api/tailscale/devices/${encodeURIComponent(deviceId)}/key`, {
      method: 'POST',
      body: { keyExpiryDisabled },
    }),
  )
}

export function useExpireDeviceKeyMutation() {
  return useDeviceMutation((deviceId: string) =>
    api(`/api/tailscale/devices/${encodeURIComponent(deviceId)}/expire`, {
      method: 'POST',
      body: {},
    }),
  )
}

export function useUpdateDeviceRoutesMutation() {
  return useDeviceMutation(({ deviceId, routes }: { deviceId: string; routes: string[] }) =>
    api(`/api/tailscale/devices/${encodeURIComponent(deviceId)}/routes`, {
      method: 'POST',
      body: { routes },
    }),
  )
}

export function useDeleteDeviceMutation() {
  return useDeviceMutation((deviceId: string) =>
    api(`/api/tailscale/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    }),
  )
}

