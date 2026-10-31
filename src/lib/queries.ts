import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { DevicesResponse } from './tailscale'

export type SessionState = {
  signedIn: boolean
  tailscaleConfigured?: boolean
}

export const AUTH_QUERY_KEY = ['auth', 'session'] as const
export const DEVICES_QUERY_KEY = ['tailscale', 'devices'] as const

export function useAuthSession() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => api<SessionState>('/api/auth/session'),
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
    onSuccess: data => {
      queryClient.setQueryData<SessionState>(AUTH_QUERY_KEY, {
        signedIn: true,
        tailscaleConfigured: data.tailscaleConfigured,
      })
      void queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY })
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
    onSuccess: () => {
      queryClient.setQueryData<SessionState>(AUTH_QUERY_KEY, { signedIn: false })
      queryClient.removeQueries({ queryKey: DEVICES_QUERY_KEY })
    },
  })
}

export function useDevicesQuery(enabled = true) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: DEVICES_QUERY_KEY,
    enabled,
    queryFn: async () => {
      try {
        return await api<DevicesResponse>('/api/tailscale/devices')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          queryClient.setQueryData<SessionState>(AUTH_QUERY_KEY, { signedIn: false })
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY })
    },
    onError: error => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData<SessionState>(AUTH_QUERY_KEY, { signedIn: false })
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

