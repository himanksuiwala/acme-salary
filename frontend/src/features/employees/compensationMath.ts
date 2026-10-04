import type { CompensationPackage, Currency, NewCompensation } from './api'

type Frequency = NewCompensation['pay_frequency']
type Components = { base_pay: number; variable_pay: number | null; pay_frequency: string; allowances: { amount: number; frequency: string }[] }

export function minorUnits(value: string, currency: Currency): number | null {
  const decimals = currency.decimal_places
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`)
  if (!pattern.test(value.trim())) return null
  const [whole, fraction = ''] = value.trim().split('.')
  const amount = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0'))
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

export function inputAmount(amount: number, currency: Currency): string {
  return (amount / 10 ** currency.decimal_places).toFixed(currency.decimal_places)
}

export function annualized(amount: number, frequency: string): number | null {
  const result = frequency === 'ANNUAL' ? amount : frequency === 'MONTHLY' ? amount * 12 : null
  return result !== null && Number.isSafeInteger(result) ? result : null
}

export function packageTotals(packageInput: Components) {
  const base = annualized(packageInput.base_pay, packageInput.pay_frequency)
  const variable = packageInput.variable_pay === null ? null : annualized(packageInput.variable_pay, packageInput.pay_frequency)
  const allowances = packageInput.allowances.map((item) => annualized(item.amount, item.frequency))
  const allowanceTotal = allowances.every((amount) => amount !== null)
    ? allowances.reduce<number>((sum, amount) => sum + (amount ?? 0), 0) : null
  const cash = base !== null && variable !== null ? base + variable : null
  const total = cash !== null && allowanceTotal !== null ? cash + allowanceTotal : null
  return {
    base,
    variable,
    allowances: allowanceTotal !== null && Number.isSafeInteger(allowanceTotal) ? allowanceTotal : null,
    cash: cash !== null && Number.isSafeInteger(cash) ? cash : null,
    total: total !== null && Number.isSafeInteger(total) ? total : null,
  }
}

export function priorCutoff(effectiveFrom: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return null
  const date = new Date(`${effectiveFrom}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== effectiveFrom) return null
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export function comparable(previous: CompensationPackage, currency: Currency, frequency: Frequency): boolean {
  return previous.currency.code === currency.code && previous.pay_frequency === frequency
}

export function percentageChange(previous: number, next: number): number | null {
  return previous > 0 ? ((next - previous) / previous) * 100 : null
}
