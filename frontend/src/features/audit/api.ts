import { apiFetch, downloadFile, parseResponse } from '@/lib/api'
import type { Currency } from '@/features/employees/api'

export type AuditQuery = {
  search: string; action: string; actor_id: string; entity_type: string; employee_id: string
  outcome: string; from_date: string; to_date: string; page: number; page_size: number
}
export const defaultAuditQuery: AuditQuery = {
  search: '', action: '', actor_id: '', entity_type: '', employee_id: '', outcome: '',
  from_date: '', to_date: '', page: 1, page_size: 20,
}
export const auditFilterKeys = ['employee_id', 'search', 'action', 'actor_id', 'entity_type', 'outcome', 'from_date', 'to_date'] as const
export type AuditValue = string | number | boolean | null | AuditValue[] | { [key: string]: AuditValue }
export type AuditEvent = {
  id: number; operation_id: string; timestamp: string; action: string
  entity_type: string; entity_id: number | null
  employee: { id: number; code: string; name: string } | null
  actor: { id: number | null; name: string; role: string | null }
  outcome: 'SUCCESS' | 'FAILED'; reason: string | null; legacy: boolean
  metadata: {
    dataset?: string; row_count?: number; affected_employees?: number; package_count?: number
    before_currency?: Currency | null; after_currency?: Currency | null
    before_frequency?: string | null; after_frequency?: string | null
    before_allowance_frequencies?: Record<string, string>; after_allowance_frequencies?: Record<string, string>
    effective_from?: string; previous_package_id?: number | null
    change_trigger?: string | null; authorization_reference?: string | null
  }
  changes: { field: string; before: AuditValue; after: AuditValue }[]
}
export type AuditResponse = {
  items: AuditEvent[]; total: number; page: number; page_size: number; total_pages: number
  summary: { events: number; compensation_changes: number; completed_exports: number; failed_operations: number }
}
export type AuditOptions = {
  actors: { id: number; name: string; role: string }[]; actions: string[]; entity_types: string[]
}
export function auditParams(query: AuditQuery, includePage = true) {
  const params = new URLSearchParams()
  for (const key of auditFilterKeys) if (query[key]) params.set(key, query[key])
  if (includePage) {
    params.set('page', String(query.page))
    params.set('page_size', String(query.page_size))
  }
  return params
}
export async function getAudit(query: AuditQuery, employeeId?: number, signal?: AbortSignal) {
  const path = employeeId ? `/api/employees/${employeeId}/audit` : '/api/audit/events'
  return parseResponse<AuditResponse>(await apiFetch(`${path}?${auditParams(query)}`, { signal }))
}
export async function getAuditOptions(signal?: AbortSignal) {
  return parseResponse<AuditOptions>(await apiFetch('/api/audit/options', { signal }))
}
export async function downloadAudit(query: AuditQuery, employeeId?: number) {
  const params = auditParams(query, false)
  if (employeeId) params.set('employee_id', String(employeeId))
  await downloadFile(`/api/audit/events/export?${params}`, 'audit-report.csv')
}
