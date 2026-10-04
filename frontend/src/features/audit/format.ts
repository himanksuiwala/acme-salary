import { statusLabel } from '@/features/employees/format'

export function actionLabel(action: string) {
  return ({ CREATE_COMPENSATION: 'Compensation change', EMPLOYEE_CREATED: 'Employee created',
    EMPLOYEE_UPDATED: 'Employee updated', EXPORT_REQUESTED: 'Export requested',
    EXPORT_COMPLETED: 'Export completed', EXPORT_FAILED: 'Export failed', DATA_EXPORTED: 'Data exported' } as Record<string, string>)[action] ?? sentenceLabel(action)
}
export function fieldLabel(field: string) {
  if (field.startsWith('allowances.')) {
    const [, code, property] = field.split('.')
    return `${statusLabel(code)} allowance · ${property === 'amount' ? 'amount' : 'frequency'}`
  }
  return ({ base_pay: 'Base pay', variable_pay: 'Target variable pay', currency: 'Currency',
    pay_frequency: 'Pay frequency', effective_from: 'Effective from', effective_to: 'Effective to',
    'previous_period.effective_to': 'Previous package ends' } as Record<string, string>)[field] ?? sentenceLabel(field.replaceAll('.', '_'))
}
function sentenceLabel(value: string) {
  const label = statusLabel(value)
  return label.slice(0, 1) + label.slice(1).toLowerCase()
}
export function auditTimestamp(timestamp: string) {
  const parsed = new Date(timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.getTime())) return `${timestamp} UTC`
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).format(parsed)
}
