export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
}

export async function api<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
  const method = options?.method ?? (options?.body !== undefined ? 'POST' : 'GET')
  const hasBody = options?.body !== undefined

  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Serverio klaida (${response.status}).`
    throw new ApiError(message, response.status)
  }

  if (payload === null) {
    throw new ApiError('Serveris grąžino netinkamą atsakymą.', 502)
  }

  return payload as T
}
