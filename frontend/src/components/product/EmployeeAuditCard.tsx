import { useEffect, useId, useState } from 'react'
import {
  ClockIcon, DownloadSimpleIcon, NotePencilIcon, UserGearIcon, WarningCircleIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { defaultAuditQuery, getAudit } from '@/features/audit/api'
import type { AuditEvent } from '@/features/audit/api'
import { actionLabel, auditTimestamp, fieldLabel } from '@/features/audit/format'
import { formatDate, formatMoney } from '@/features/employees/format'
import { ActorIdentity } from './ActorIdentity'

function isScheduled(event: AuditEvent) {
  return event.action === 'CREATE_COMPENSATION' && event.outcome === 'SUCCESS'
    && Boolean(event.metadata.effective_from && event.metadata.effective_from > new Date().toISOString().slice(0, 10))
}

function eventAction(event: AuditEvent) {
  if (event.outcome === 'FAILED') return `failed: ${actionLabel(event.action).toLowerCase()}`
  if (isScheduled(event)) return 'scheduled a package'
  return ({
    CREATE_COMPENSATION: 'created a package', EMPLOYEE_CREATED: 'created employee record',
    EMPLOYEE_UPDATED: 'updated employee details', EXPORT_REQUESTED: 'requested an export',
    EXPORT_COMPLETED: 'completed an export', DATA_EXPORTED: 'exported data',
  } as Record<string, string>)[event.action] ?? actionLabel(event.action).toLowerCase()
}

function eventContext(event: AuditEvent) {
  const context: string[] = []
  if (event.reason) context.push(event.reason)
  if (event.outcome === 'SUCCESS' && event.action === 'CREATE_COMPENSATION') {
    const basePay = event.changes.find((change) => change.field === 'base_pay')?.after
    if (!event.reason && typeof basePay === 'number' && event.metadata.after_currency) {
      context.push(`Base adjusted to ${formatMoney(basePay, event.metadata.after_currency, event.metadata.after_frequency ?? undefined)}`)
    }
    if (event.metadata.effective_from) context.push(`Effective ${formatDate(event.metadata.effective_from)}`)
  }
  if (!context.length && event.metadata.dataset) {
    context.push(`${event.metadata.dataset}${event.metadata.row_count === undefined ? '' : ` · ${event.metadata.row_count} rows`}`)
  }
  if (!context.length && event.changes.length) context.push(event.changes.map((change) => fieldLabel(change.field)).join(', '))
  return context.join(' · ') || 'No additional context recorded'
}

export function EmployeeAuditCard({ employeeId, refreshKey = 0, onFullAuditLog }: {
  employeeId: number; refreshKey?: number; onFullAuditLog: (employeeId: number) => void
}) {
  const titleId = useId()
  const [retry, setRetry] = useState(0)
  const [load, setLoad] = useState<{ key: string; items?: AuditEvent[]; error?: string }>({ key: '' })
  const requestKey = JSON.stringify([employeeId, refreshKey, retry])
  const current = load.key === requestKey ? load : null

  useEffect(() => {
    const controller = new AbortController()
    getAudit({ ...defaultAuditQuery, page_size: 4 }, employeeId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setLoad({ key: requestKey, items: data.items })
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setLoad({ key: requestKey, error: cause instanceof Error ? cause.message : 'Employee activity could not be loaded.' })
      })
    return () => controller.abort()
  }, [employeeId, requestKey])

  return (
    <section aria-labelledby={titleId} className="rounded-xl border bg-card p-5">
      <header className="mb-5 flex items-start justify-between gap-2">
        <h2 id={titleId} className="flex min-w-0 items-start gap-2 text-lg font-semibold leading-[26px]">
          <UserGearIcon aria-hidden="true" size={20} className="mt-1 shrink-0 text-muted-foreground" /><span>Audit Log</span>
        </h2>
        <Button variant="ghost" size="sm" className="min-h-11 shrink-0 px-1 text-[13px] text-muted-foreground sm:min-h-9" onClick={() => onFullAuditLog(employeeId)}>Full audit log</Button>
      </header>
      {!current ? (
        <div role="status" aria-label="Loading employee activity" className="space-y-5">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-5 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div>
          </div>)}
        </div>
      ) : current.error ? (
        <div role="alert"><p className="text-sm font-medium">Couldn’t load employee activity</p>
          <p className="mt-1 break-words text-[13px] leading-5 text-muted-foreground">{current.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setRetry((value) => value + 1)}>Try again</Button>
        </div>
      ) : !current.items?.length ? (
        <p className="text-sm leading-5 text-muted-foreground">No activity recorded yet. Employee changes and exports will appear here.</p>
      ) : (
        <ol aria-label="Recent employee activity">
          {current.items.map((event, index) => {
            const scheduled = isScheduled(event)
            const failed = event.outcome === 'FAILED'
            const Icon = failed ? WarningCircleIcon : scheduled ? ClockIcon : event.action.includes('EXPORT') ? DownloadSimpleIcon : NotePencilIcon
            return <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
              {index < current.items!.length - 1 && <span aria-hidden="true" className="absolute top-9 bottom-1 left-4 border-l" />}
              <span className={`relative flex size-8 shrink-0 items-center justify-center rounded-full ${failed ? 'bg-destructive text-destructive-foreground' : scheduled ? 'bg-info text-info-foreground' : 'bg-muted text-muted-foreground'}`}>
                <Icon aria-hidden="true" size={18} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="break-words text-sm font-medium leading-5"><ActorIdentity actor={event.actor} /> {eventAction(event)}</p>
                <p className="mt-1 break-words text-[13px] leading-[18px] text-muted-foreground">{eventContext(event)}</p>
                <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground tabular-nums"><time>{auditTimestamp(event.timestamp)} UTC</time></p>
              </div>
            </li>
          })}
        </ol>
      )}
    </section>
  )
}
