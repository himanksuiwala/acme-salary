import { apiFetch, downloadFile, parseResponse, presentParams } from '@/lib/api'
import type { Currency, DirectoryOptions } from '@/features/employees/api'

export type Metric = 'base' | 'variable' | 'allowances' | 'target'
export type AnalyticsQuery = {
  as_of: string
  country: string
  department: string
  role: string
  status: string
  location_id: string
  period_from: string
  period_to: string
}
export type MetricValue = {
  sum: number | null
  average: number | null
  median: number | null
  included: number
  excluded: number
  exclusion_reasons: Record<string, number>
  partial: boolean
}
export type Group = {
  key: string
  label: string
  employee_count: number
  included: number
  excluded: number
  exclusion_reasons: Record<string, number>
  sum: number | null
  average: number | null
  median: number | null
  partial: boolean
}
export type AnalyticsResult = {
  context: {
    as_of: string
    generated_at: string
    filters: Record<string, string | number | null>
    population: 'employed_as_of'
    reporting_currency: Currency
    fx_reference_date: string
    fx_reference_source: string
  }
  coverage: {
    employee_count: number
    base_included: number
    no_package: number
    hourly_base: number
    missing_fx: number
    missing_fx_currencies: string[]
    rates: { source_currency: string; target_currency: string; rate: string; rate_date: string; source_name: string }[]
  }
  metrics: Record<Metric, MetricValue>
  distribution: { lower: number; upper: number; count: number }[]
  breakdowns: Record<'country' | 'department' | 'role', Group[]>
  changes: {
    count: number
    items: {
      employee_id: number
      employee_code: string
      employee_name: string
      effective_from: string
      base_pay: number
      currency_code: string
      decimal_places: number
      pay_frequency: string
      previous_base: number | null
      previous_currency: string | null
      previous_decimal_places: number | null
      previous_frequency: string | null
      percentage: number | null
    }[]
  }
}
export function analyticsParams(query: AnalyticsQuery) {
  return presentParams(query)
}
export async function getAnalytics(query: AnalyticsQuery, signal?: AbortSignal): Promise<AnalyticsResult> {
  return parseResponse<AnalyticsResult>(await apiFetch(`/api/analytics/compensation?${analyticsParams(query)}`, { signal }))
}
export async function getAnalyticsOptions(signal?: AbortSignal): Promise<DirectoryOptions> {
  return parseResponse<DirectoryOptions>(await apiFetch('/api/employees/directory-options', { signal }))
}
export async function downloadAnalytics(query: AnalyticsQuery): Promise<void> {
  await downloadFile(`/api/analytics/compensation/export?${analyticsParams(query)}`, 'compensation-analytics.csv')
}
