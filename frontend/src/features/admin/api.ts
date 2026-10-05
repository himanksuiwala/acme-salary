import { apiFetch, parseResponse } from '@/lib/api'

export type AllowanceType = {
  id: number
  code: string
  name: string
  description: string | null
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  updated_at: string
}

export type ReferenceData = {
  allowance_types: AllowanceType[]
  countries: { id: number; code: string; name: string; default_currency: string }[]
  locations: { id: number; name: string; city: string | null; state: string | null; country_code: string; country_name: string }[]
  departments: { id: number; code: string; name: string; manager_id: number | null; manager_name: string | null }[]
  currencies: { id: number; code: string; name: string; symbol: string | null; decimal_places: number }[]
  fx_rates: { id: number; source_currency: string; target_currency: string; rate_date: string; rate: string; source: string; approved: boolean }[]
}

export async function getReferenceData(signal?: AbortSignal): Promise<ReferenceData> {
  return parseResponse<ReferenceData>(await apiFetch('/api/admin/reference-data', { signal }))
}

export async function createAllowance(input: { code: string; name: string; description: string | null }): Promise<AllowanceType> {
  const result = await parseResponse<{ allowance_type: AllowanceType }>(await apiFetch('/api/admin/allowance-types', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }))
  return result.allowance_type
}

export async function updateAllowance(id: number, input: { name: string; description: string | null }): Promise<AllowanceType> {
  const result = await parseResponse<{ allowance_type: AllowanceType }>(await apiFetch(`/api/admin/allowance-types/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }))
  return result.allowance_type
}

export async function changeAllowanceStatus(id: number, status: AllowanceType['status'], reason: string): Promise<AllowanceType> {
  const action = status === 'ACTIVE' ? 'reactivate' : 'archive'
  const result = await parseResponse<{ allowance_type: AllowanceType }>(await apiFetch(`/api/admin/allowance-types/${id}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
  }))
  return result.allowance_type
}
