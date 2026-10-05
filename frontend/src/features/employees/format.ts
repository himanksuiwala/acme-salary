import type { Currency, PackageState } from './api'

const frequencyLabels: Record<string, string> = {
  ANNUAL: 'year',
  MONTHLY: 'month',
  HOURLY: 'hour',
}

export function formatMoney(amount: number, currency: Currency, frequency?: string, locale?: string): string {
  const decimals = currency.decimal_places
  const value = amount / 10 ** decimals
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: value % 1 === 0 ? 0 : decimals,
    maximumFractionDigits: decimals,
  }).format(value)
  return `${formatted} ${currency.code}${frequency ? ` / ${frequencyLabels[frequency] ?? frequency.toLowerCase()}` : ''}`
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export function statusLabel(status: string): string {
  return status.toLowerCase().split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')
}

export const packageLabels: Record<PackageState, string> = {
  CURRENT: 'Current',
  SCHEDULED_CHANGE: 'Scheduled change',
  SCHEDULED: 'Scheduled package',
  PAST_ONLY: 'Past only',
  NO_PACKAGE: 'No package',
}
