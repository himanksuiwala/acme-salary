import { useEffect, useState } from 'react'
import { ArrowLeftIcon, CalendarBlankIcon, ClockIcon, UserCircleIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { CompensationPackage, EmployeeDetail } from './api'
import { getEmployeeDetail } from './api'
import { formatDate, formatMoney, statusLabel } from './format'

function PackageSection({ title, packages, empty }: {
  title: string
  packages: CompensationPackage[]
  empty: string
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">{packages.length}</span>
      </div>
      {packages.length === 0 ? <p className="rounded-xl border bg-card px-5 py-6 text-sm text-muted-foreground">{empty}</p> : (
        <div className="space-y-3">
          {packages.map((item) => <PackageCard key={item.id} item={item} />)}
        </div>
      )}
    </section>
  )
}

function PackageCard({ item, current = false }: { item: CompensationPackage; current?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Base pay</p>
          <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{formatMoney(item.base_pay, item.currency, item.pay_frequency)}</p>
        </div>
        {current && <Badge variant="success">Current</Badge>}
      </div>
      <div className="mt-5 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Effective period</p>
          <p className="mt-1 flex items-center gap-1.5"><CalendarBlankIcon aria-hidden="true" size={16} />{formatDate(item.effective_from)}–{item.effective_to ? formatDate(item.effective_to) : 'Ongoing'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Target variable pay</p>
          <p className="mt-1 tabular-nums">{item.variable_pay === null ? 'Not specified' : formatMoney(item.variable_pay, item.currency, item.pay_frequency)}</p>
        </div>
      </div>
      {item.allowances.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground">Allowances</p>
          <ul className="mt-2 space-y-2 text-sm">
            {item.allowances.map((allowance) => (
              <li className="flex flex-wrap justify-between gap-2" key={allowance.type_code}>
                <span>{allowance.type_name}</span>
                <span className="tabular-nums">{formatMoney(allowance.amount, item.currency, allowance.frequency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">Reason: {item.change_reason || 'Not recorded'}</p>
    </div>
  )
}

export function EmployeeProfile({ employeeId, onBack }: { employeeId: number; onBack: () => void }) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getEmployeeDetail(employeeId, controller.signal).then((result) => {
      setDetail(result)
      setError(null)
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Employee could not be loaded.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [employeeId, retry])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <Button variant="ghost" className="-ml-2 mb-5" onClick={onBack}><ArrowLeftIcon aria-hidden="true" />Back to employees</Button>
      {loading ? <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-48 w-full" /><Skeleton className="h-36 w-full" /></div> : error ? (
        <div className="rounded-xl border border-destructive/30 bg-card p-6" role="alert">
          <h1 className="text-xl font-semibold">Couldn’t load employee</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>Try again</Button>
        </div>
      ) : detail ? (
        <div className="space-y-8">
          <div className="border-b pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Employee · {detail.employee.employee_code}</p>
                <h1 className="mt-1 text-[28px] leading-9 font-semibold tracking-tight">{detail.employee.first_name} {detail.employee.last_name}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{detail.employee.job_title || 'Job title not specified'} · {detail.employee.department.name} · {detail.employee.location.name}, {detail.employee.country.name}</p>
              </div>
              <Badge variant={detail.employee.status === 'ACTIVE' ? 'success' : 'secondary'}>{statusLabel(detail.employee.status)}</Badge>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><UserCircleIcon aria-hidden="true" size={18} />{detail.employee.email}</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted px-4 py-3 text-xs text-muted-foreground"><ClockIcon aria-hidden="true" size={16} />Current compensation uses today’s UTC date. Stored packages keep their original currency and frequency.</div>
          <section className="space-y-3" aria-label="Current compensation">
            <h2 className="text-lg font-semibold">Current compensation</h2>
            {detail.current ? <PackageCard item={detail.current} current /> : <div className="rounded-xl border bg-card px-5 py-6 text-sm text-muted-foreground">No package is effective today.</div>}
          </section>
          <PackageSection title="Scheduled compensation" packages={detail.scheduled} empty="No scheduled packages." />
          <PackageSection title="Compensation history" packages={detail.history} empty="No past packages." />
        </div>
      ) : null}
    </div>
  )
}
