import { apiFetch, parseResponse, rememberAccessToken } from '@/lib/api'

export type AuthenticatedUser = {
  user_id: number
  email: string
  first_name: string | null
  last_name: string | null
  role: string
}

export async function signIn(email: string, password: string): Promise<AuthenticatedUser> {
  const result = await parseResponse<{ access_token: string; token_type: string }>(await fetch('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }))
  rememberAccessToken(result.access_token)
  try {
    return await getCurrentUser()
  } catch (error) {
    rememberAccessToken(null)
    throw error
  }
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  return parseResponse<AuthenticatedUser>(await apiFetch('/auth/me'))
}
