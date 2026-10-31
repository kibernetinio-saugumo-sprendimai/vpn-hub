export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(payload?.error || `Serverio klaida (${response.status}).`, response.status)
  if (payload === null) throw new ApiError('Serveris grąžino netinkamą atsakymą.', 502)
  return payload as T
}
