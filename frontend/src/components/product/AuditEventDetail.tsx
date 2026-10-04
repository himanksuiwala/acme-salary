import { ArrowRightIcon, ClockIcon, InfoIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatMoney, statusLabel } from '@/features/employees/format'
import type { AuditEvent, AuditValue } from '@/features/audit/api'

import { actionLabel, auditTimestamp, fieldLabel } from '@/features/audit/format'

function valueLabel(value: AuditValue, field: string, event: AuditEvent, side: 'before' | 'after'): string {
  if (value === null && field.endsWith('effective_to')) return 'Ongoing'
  if (value === null && field === 'variable_pay') return 'Not specified'
  if (value === null) return side === 'before' ? 'Not recorded' : 'Not set / removed'
  if (Array.isArray(value)) return value.map((item) => valueLabel(item, field, event, side)).join(', ') || 'None'
  if (typeof value === 'object') {
    if (typeof value.name === 'string') return `${value.name}${typeof value.code === 'string' ? ` (${value.code})` : ''}`
    return Object.entries(value).map(([key, item]) => `${statusLabel(key)}: ${valueLabel(item, key, event, side)}`).join(' · ')
  }
  const currency = event.metadata[`${side}_currency`]
  if (typeof value === 'number' && (field === 'base_pay' || field === 'variable_pay' || field.endsWith('.amount')) && currency) {
    const frequencyField = field.replace(/\.amount$/, '.frequency')
    const allowanceFrequency = event.changes.find((change) => change.field === frequencyField)?.[side]
    const frequency = field.startsWith('allowances.')
      ? typeof allowanceFrequency === 'string' ? allowanceFrequency : event.metadata[`${side}_allowance_frequencies`]?.[field.split('.')[1]]
      : event.metadata[`${side}_frequency`] ?? undefined
    return formatMoney(value, currency, frequency)
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
  return typeof value === 'string' && (['pay_frequency', 'status', 'employment_type'].includes(field) || field.endsWith('.frequency')) ? statusLabel(value) : String(value)
}

export function AuditEventDetail({ event }: { event: AuditEvent }) {
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{actionLabel(event.action)} details</h3>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">Recorded by {event.actor.name} · {auditTimestamp(event.timestamp)} UTC</p>
        </div>
        <Badge variant={event.outcome === 'FAILED' ? 'error' : 'success'}>{event.outcome === 'FAILED' ? 'Failed' : 'Successful'}</Badge>
      </div>
      {event.legacy && <p className="flex gap-2 text-[13px] leading-5 text-muted-foreground"><InfoIcon aria-hidden="true" className="mt-0.5 shrink-0" size={16} />Historical entry. Comparisons reflect the values recorded at that time and may be incomplete.</p>}
      {event.outcome === 'FAILED' ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm font-medium">{event.reason || 'Operation could not be completed'}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Submitted values are not stored for failed operations.</p>
        </div>
      ) : event.changes.length ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="grid grid-cols-2 gap-x-4 border-b bg-muted px-4 py-3 text-[13px] font-medium sm:grid-cols-3">
            <span className="hidden sm:block">Changed field</span><span>Before</span><span className="flex items-center gap-2"><ArrowRightIcon aria-hidden="true" size={14} />After</span>
          </div>
          <dl className="divide-y">
            {event.changes.map((change) => (
              <div key={change.field} className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm leading-5 sm:grid-cols-3">
                <dt className="col-span-2 min-w-0 break-words font-medium sm:col-span-1">{fieldLabel(change.field)}</dt>
                <dd className="min-w-0 break-words text-muted-foreground tabular-nums"><span className="sr-only">Before: </span>{valueLabel(change.before, change.field, event, 'before')}</dd>
                <dd className="min-w-0 break-words tabular-nums"><span className="sr-only">After: </span>{valueLabel(change.after, change.field, event, 'after')}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : <p className="text-sm text-muted-foreground">{event.action.startsWith('EXPORT_') || event.action === 'DATA_EXPORTED' ? 'This export event does not change employee or compensation values.' : 'No changed field values were recorded.'}</p>}
      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <div><dt className="text-[13px] text-muted-foreground">Recorded target</dt><dd className="mt-1">{statusLabel(event.entity_type)}{event.entity_id !== null ? ` #${event.entity_id}` : ''}</dd></div>
        {event.outcome === 'SUCCESS' && event.reason && <div className="sm:col-span-2"><dt className="text-[13px] text-muted-foreground">Change reason</dt><dd className="mt-1 whitespace-pre-wrap break-words">{event.reason}</dd></div>}
        {event.metadata.effective_from && <div><dt className="flex items-center gap-1 text-[13px] text-muted-foreground"><ClockIcon aria-hidden="true" size={14} />Effective from</dt><dd className="mt-1">{formatDate(event.metadata.effective_from)}</dd></div>}
        {event.metadata.change_trigger && <div><dt className="text-[13px] text-muted-foreground">Change category</dt><dd className="mt-1">{statusLabel(event.metadata.change_trigger)}</dd></div>}
        {event.metadata.authorization_reference && <div><dt className="text-[13px] text-muted-foreground">Recorded authorization reference</dt><dd className="mt-1 break-words">{event.metadata.authorization_reference}</dd></div>}
        {event.metadata.dataset && <div><dt className="text-[13px] text-muted-foreground">Dataset</dt><dd className="mt-1">{event.metadata.dataset}{event.metadata.row_count !== undefined ? ` · ${event.metadata.row_count} rows` : ''}{event.metadata.package_count !== undefined ? ` · ${event.metadata.package_count} packages` : ''}</dd></div>}
        {event.metadata.affected_employees !== undefined && <div><dt className="text-[13px] text-muted-foreground">Export scope</dt><dd className="mt-1">{event.employee ? 'Affected-employee event' : 'Operation summary'} · {event.metadata.affected_employees} employees</dd></div>}
        <div className="sm:col-span-2"><dt className="text-[13px] text-muted-foreground">Operation reference</dt><dd className="mt-1 break-all text-[13px] tabular-nums">{event.operation_id} · Event #{event.id}</dd></div>
      </dl>
      {event.action === 'EXPORT_COMPLETED' && <p className="text-[13px] leading-5 text-muted-foreground">Completion confirms server response delivery. It does not confirm that the file was saved or opened.</p>}
    </div>
  )
}
