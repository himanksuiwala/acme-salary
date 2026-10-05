export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

const tokenKey = 'acme.access-token'

export function accessToken(): string | null {
  return window.sessionStorage.getItem(tokenKey)
}

export function rememberAccessToken(token: string | null): void {
  if (token === null) window.sessionStorage.removeItem(tokenKey)
  else window.sessionStorage.setItem(tokenKey, token)
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = accessToken()
  if (token !== null) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers }).then((response) => {
    if (response.status === 401 && token !== null && accessToken() === token) {
      rememberAccessToken(null)
      window.dispatchEvent(new Event('auth:expired'))
    }
    return response
  })
}

export async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T
  let detail = `Request failed (${response.status})`
  try {
    const body = (await response.json()) as { detail?: string | { msg?: string }[] }
    if (typeof body.detail === 'string') detail = body.detail
    else if (Array.isArray(body.detail)) detail = body.detail.map((item) => item.msg).filter(Boolean).join('; ')
  } catch {
    // A non-JSON server error still has the HTTP status above.
  }
  throw new ApiError(detail, response.status)
}

export function presentParams<T extends Record<string, unknown>>(query: T, keys: readonly (keyof T)[] = Object.keys(query) as (keyof T)[]): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of keys) {
    const value = query[key]
    if (value !== undefined && value !== null && value !== '') params.set(String(key), String(value))
  }
  return params
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await apiFetch(path)
  if (!response.ok) { await parseResponse<never>(response); return }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
