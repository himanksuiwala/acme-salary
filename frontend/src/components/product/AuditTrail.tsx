import { Fragment, useEffect, useId, useState } from 'react'
import {
  ArrowsClockwiseIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, CheckCircleIcon,
  ClockCounterClockwiseIcon, DownloadSimpleIcon, FunnelIcon, MagnifyingGlassIcon,
  WarningCircleIcon, XIcon,
} from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { ContextInfo } from '@/components/product/ContextInfo'
import { DateRangePicker } from '@/components/product/DateRangePicker'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { statusLabel } from '@/features/employees/format'
import { AuditEventDetail } from './AuditEventDetail'
import { ActorIdentity } from './ActorIdentity'
import { actionLabel, auditTimestamp, fieldLabel } from '@/features/audit/format'
import { auditFilterKeys, defaultAuditQuery, downloadAudit, getAudit, getAuditOptions } from '@/features/audit/api'
import type { AuditEvent, AuditOptions, AuditQuery, AuditResponse } from '@/features/audit/api'

type LoadState = { key: string; data?: AuditResponse; options?: AuditOptions; error?: string }
function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label id={id} className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <Select value={value || 'all'} onValueChange={(selected) => onChange(selected === 'all' || selected === null ? '' : String(selected))}>
        <SelectTrigger aria-labelledby={id} className="min-h-11 min-w-0 sm:min-h-9">
          <SelectValue>{(selected: string | null) => selected === 'all' || selected === null ? `All ${label.toLowerCase()}` : options.find((option) => option.value === selected)?.label ?? statusLabel(selected)}</SelectValue>
        </SelectTrigger>
        <SelectPopup><SelectItem value="all">All {label.toLowerCase()}</SelectItem>
          {value && !options.some((option) => option.value === value) && <SelectItem value={value}>{statusLabel(value)}</SelectItem>}
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectPopup>
      </Select>
    </div>
  )
}
function EventBadge({ event }: { event: AuditEvent }) {
  return <Badge variant={event.outcome === 'FAILED' ? 'error' : event.action === 'CREATE_COMPENSATION' ? 'info' : 'secondary'} className="max-w-full">{actionLabel(event.action)}</Badge>
}
function eventSummary(event: AuditEvent) {
  if (event.outcome === 'FAILED') return event.reason || 'Operation failed'
  if (event.changes.length) return event.changes.length <= 2
    ? event.changes.map((change) => fieldLabel(change.field)).join(', ')
    : `${event.changes.length} fields changed`
  if (event.metadata.dataset) return `${event.metadata.dataset}${event.metadata.row_count !== undefined ? ` · ${event.metadata.row_count} rows` : ''}`
  return event.reason || 'No changed field values recorded'
}
function Target({ event, onOpenEmployee }: { event: AuditEvent; onOpenEmployee?: (id: number) => void }) {
  return event.employee ? (
    <div>
      {onOpenEmployee ? <button type="button" onClick={() => onOpenEmployee(event.employee!.id)} className="text-left font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring">{event.employee.name}</button> : <span className="font-medium">{event.employee.name}</span>}
      <p className="mt-1 text-[13px] text-muted-foreground">{event.employee.code}</p>
    </div>
  ) : <div><p className="font-medium">{event.metadata.dataset || statusLabel(event.entity_type)}</p><p className="mt-1 text-[13px] text-muted-foreground">{event.entity_type === 'export' ? 'Operation summary' : event.entity_id === null ? 'Target not recorded' : `Record #${event.entity_id}`}</p></div>
}

export function AuditTrail({ employeeId, query: controlledQuery, onQueryChange, refreshKey = 0, onOpenEmployee }: {
  employeeId?: number; query?: AuditQuery; onQueryChange?: (patch: Partial<AuditQuery>) => void
  refreshKey?: number; onOpenEmployee?: (id: number) => void
}) {
  const [localQuery, setLocalQuery] = useState(defaultAuditQuery)
  const query = controlledQuery ?? localQuery
  const [draft, setDraft] = useState({ query, value: query.search })
  const search = draft.query === query ? draft.value : query.search
  const setSearch = (value: string) => setDraft({ query, value })
  const [refresh, setRefresh] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [load, setLoad] = useState<LoadState>({ key: '' })
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exported, setExported] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const instanceId = useId()
  const requestKey = JSON.stringify([query, employeeId, refresh, refreshKey])
  const dateError = query.from_date && query.to_date && query.from_date > query.to_date ? 'From date must be on or before to date.' : null
  const current = load.key === requestKey ? load : null
  const loading = !current && !dateError
  const data = current?.data
  const scopedEmployee = data?.items.find((event) => String(event.employee?.id) === query.employee_id)?.employee
  const employeeScopeLabel = scopedEmployee ? `${scopedEmployee.name} (${scopedEmployee.code})` : `Employee #${query.employee_id}`
  const options = current?.options ?? load.options
  const hasFilters = auditFilterKeys.some((key) => Boolean(query[key]))
  const filterCount = auditFilterKeys.filter((key) => key !== 'search' && Boolean(query[key])).length
  function updateQuery(patch: Partial<AuditQuery>) {
    setExpanded(null)
    if (onQueryChange) onQueryChange(patch)
    else setLocalQuery((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }))
  }
  function clearFilters() {
    setSearch('')
    updateQuery({ ...defaultAuditQuery, page_size: query.page_size })
  }
  useEffect(() => {
    if (search === query.search) return
    const timer = window.setTimeout(() => {
      if (onQueryChange) onQueryChange({ search, page: 1 })
      else setLocalQuery((previous) => ({ ...previous, search, page: 1 }))
      setExpanded(null)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search, query.search, onQueryChange])
  useEffect(() => {
    if (dateError) return
    const controller = new AbortController()
    const [snapshot, scopedEmployeeId] = JSON.parse(requestKey) as [AuditQuery, number | null]
    Promise.all([getAudit(snapshot, scopedEmployeeId ?? undefined, controller.signal), getAuditOptions(controller.signal)])
      .then(([result, filterOptions]) => {
        if (!controller.signal.aborted) setLoad({ key: requestKey, data: result, options: filterOptions })
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setLoad({ key: requestKey, error: cause instanceof Error ? cause.message : 'Audit events could not be loaded.' })
      })
    return () => controller.abort()
  }, [requestKey, dateError])
  async function exportReport() {
    setExporting(true); setExportError(null); setExported(false)
    try {
      await downloadAudit(query, employeeId)
      setExported(true)
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Audit export failed.')
    } finally {
      setExporting(false); setRefresh((value) => value + 1)
    }
  }
  const toggle = (id: number) => setExpanded((previous) => previous === id ? null : id)
  const totalPages = data?.total_pages ?? 0
  const metrics = [
    { label: 'Recorded events', value: data?.summary.events, note: 'Includes operation and employee entries', icon: ClockCounterClockwiseIcon },
    { label: 'Compensation changes', value: data?.summary.compensation_changes, note: 'Successful package changes', icon: ArrowsClockwiseIcon },
    { label: 'Completed exports', value: data?.summary.completed_exports, note: 'Distinct server-delivered operations', icon: CheckCircleIcon },
    { label: 'Failed operations', value: data?.summary.failed_operations, note: 'Distinct unsuccessful operations', icon: WarningCircleIcon },
  ]
  return (
    <section aria-label={employeeId ? 'Employee audit trail' : 'Audit log'} className={employeeId ? 'mt-8 space-y-5' : 'mx-auto w-full max-w-[1440px] space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-9'}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {employeeId ? <h2 className="text-lg font-semibold leading-[26px]">Audit trail</h2> : <div className="flex items-center gap-1.5"><h1 className="text-[28px] font-semibold leading-9 tracking-tight">Audit log</h1><ContextInfo label="About audit timestamps">Timestamps and date filters use UTC. Export completion means the server delivered the response.</ContextInfo></div>}
          <p className="mt-1.5 max-w-[65ch] text-[15px] leading-[22px] text-muted-foreground">{employeeId ? 'Changes and data exports associated with this employee.' : 'Review employee changes, compensation updates, and data exports.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setExpanded(null); setRefresh((value) => value + 1) }} disabled={loading}><ArrowsClockwiseIcon aria-hidden="true" />Refresh</Button>
          <Button onClick={exportReport} loading={exporting} disabled={Boolean(dateError) || loading || Boolean(current?.error)}><DownloadSimpleIcon aria-hidden="true" />Export audit report</Button>
        </div>
      </header>
      {exportError && <p role="alert" className="text-sm text-destructive-foreground">Export failed: {exportError}</p>}
      {exported && <p role="status" className="text-sm text-success-foreground">Audit report delivered. The export is recorded in the trail.</p>}
      {!employeeId && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtered audit summary">
        {metrics.map(({ label, value, note, icon: Icon }) => <div key={label} className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-foreground"><span>{label}</span><Icon aria-hidden="true" size={18} /></div>
          {loading ? <Skeleton className="my-3 h-8 w-20" /> : <p className="my-2.5 text-[26px] font-semibold leading-8 tabular-nums">{value === undefined ? '—' : value.toLocaleString()}</p>}
          <p className="text-[13px] leading-[18px] text-muted-foreground">{note}</p>
        </div>)}
      </div>}
      <div className="rounded-xl border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56 sm:max-w-md">
            <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" size={17} />
            <Input id={`${instanceId}-search`} aria-label="Search audit events" type="search" className="[&_input]:pl-9" maxLength={200} placeholder="Search events, employees, or actors…" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') updateQuery({ search }) }} />
          </div>
          <Button variant="outline" onClick={() => setFiltersOpen(true)}><FunnelIcon aria-hidden="true" />Filters{filterCount ? ` (${filterCount})` : ''}</Button>
        </div>
        {hasFilters && <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3" aria-label="Active audit filters">
          {auditFilterKeys.filter((key) => query[key]).map((key) => <Button key={key} variant="outline" size="xs" className="max-w-full" onClick={() => { if (key === 'search') setSearch(''); updateQuery({ [key]: '' }) }} aria-label={`Remove ${statusLabel(key)} filter`}>
            <span className="max-w-44 truncate">{key === 'employee_id' ? employeeScopeLabel : key === 'action' ? actionLabel(query[key]) : key === 'actor_id' ? options?.actors.find((actor) => String(actor.id) === query[key])?.name ?? query[key] : `${statusLabel(key)}: ${key === 'outcome' || key === 'entity_type' ? statusLabel(query[key]) : query[key]}`}</span><XIcon aria-hidden="true" size={12} />
          </Button>)}<Button variant="ghost" size="xs" onClick={clearFilters}>Clear all</Button>
        </div>}
      </div>
      {dateError && <p role="alert" id={`${instanceId}-dates-error`} className="text-sm text-destructive-foreground">{dateError} <Button variant="ghost" size="xs" onClick={() => setFiltersOpen(true)}>Edit date filters</Button></p>}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}><SheetPopup aria-label="Audit filters"><SheetHeader><SheetTitle>Filter activity</SheetTitle><SheetDescription>Refine the audit events shown. Date filters use UTC.</SheetDescription></SheetHeader><SheetPanel className="space-y-4">
            <FilterSelect label="Event types" value={query.action} options={(options?.actions ?? []).map((value) => ({ value, label: actionLabel(value) }))} onChange={(action) => updateQuery({ action })} />
            <FilterSelect label="Actors" value={query.actor_id} options={(options?.actors ?? []).map((actor) => ({ value: String(actor.id), label: actor.name }))} onChange={(actor_id) => updateQuery({ actor_id })} />
            <FilterSelect label="Target types" value={query.entity_type} options={(options?.entity_types ?? []).map((value) => ({ value, label: statusLabel(value) }))} onChange={(entity_type) => updateQuery({ entity_type })} />
            <FilterSelect label="Outcomes" value={query.outcome} options={[{ value: 'SUCCESS', label: 'Successful' }, { value: 'FAILED', label: 'Failed' }]} onChange={(outcome) => updateQuery({ outcome })} />
            <div className="min-w-0"><span className="mb-1.5 block text-[13px] font-medium">Date range</span><DateRangePicker label="Audit date range (UTC)" value={{ from: query.from_date, to: query.to_date }} onChange={({ from, to }) => updateQuery({ from_date: from, to_date: to })} invalid={Boolean(dateError)} /></div>
        </SheetPanel><SheetFooter className="flex justify-between"><Button variant="ghost" onClick={clearFilters} disabled={!hasFilters}>Clear all</Button><Button onClick={() => setFiltersOpen(false)}>Show results</Button></SheetFooter></SheetPopup></Sheet>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">Chronological activity</h2>
          <p role="status" aria-live="polite" className="text-[13px] text-muted-foreground tabular-nums">{loading ? 'Loading events…' : data ? `${data.total.toLocaleString()} matching events · Newest first` : 'Events unavailable'}</p>
        </div>
        {dateError ? <p className="p-6 text-sm text-muted-foreground">Correct the date range to load events.</p> : loading ? (
          <div className="space-y-4 p-5" aria-label="Loading audit events">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
        ) : current?.error ? (
          <div role="alert" className="p-6"><h3 className="text-base font-semibold">Couldn’t load audit events</h3><p className="mt-2 text-sm text-muted-foreground">{current.error}</p><Button variant="outline" className="mt-4" onClick={() => setRefresh((value) => value + 1)}>Try again</Button></div>
        ) : !data?.items.length ? (
          <Empty className="border-0 py-12"><EmptyHeader><EmptyMedia variant="icon"><ClockCounterClockwiseIcon aria-hidden="true" size={24} /></EmptyMedia><EmptyTitle>{data?.total ? 'No events on this page' : hasFilters ? 'No matching audit events' : 'No audit events yet'}</EmptyTitle><EmptyDescription>{data?.total ? 'Return to the first page to view the matching events.' : hasFilters ? 'Try another search or clear the filters.' : 'Employee changes, compensation updates and exports will appear here when they occur.'}</EmptyDescription></EmptyHeader>
            {(hasFilters || Boolean(data?.total)) && <EmptyContent><Button variant="outline" onClick={data?.total ? () => updateQuery({ page: 1 }) : clearFilters}>{data?.total ? 'Go to first page' : 'Clear filters'}</Button></EmptyContent>}
          </Empty>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table aria-label={employeeId ? 'Employee audit events' : 'Audit events'}>
                <TableHeader className="bg-muted"><TableRow>
                  <TableHead className="pl-5">Timestamp (UTC)</TableHead><TableHead>Event type</TableHead><TableHead className="sticky left-0 z-10 bg-muted">Entity / target</TableHead><TableHead>Actor</TableHead><TableHead>Change summary</TableHead><TableHead className="pr-5 text-right">Details</TableHead>
                </TableRow></TableHeader>
                <TableBody>{data.items.map((event) => <Fragment key={event.id}>
                  <TableRow data-state={expanded === event.id ? 'selected' : undefined}>
                    <TableCell className="pl-5 text-[13px] leading-5 tabular-nums"><time>{auditTimestamp(event.timestamp)}</time><p className="text-muted-foreground">#{event.id}</p></TableCell>
                    <TableCell><EventBadge event={event} />{event.outcome === 'FAILED' && <p className="mt-1 text-[13px] text-destructive-foreground">Failed</p>}</TableCell>
                    <TableCell className="sticky left-0 z-10 max-w-52 whitespace-normal bg-card leading-5"><Target event={event} onOpenEmployee={onOpenEmployee} /></TableCell>
                    <TableCell className="max-w-48 whitespace-normal break-words leading-5"><ActorIdentity actor={event.actor} /></TableCell>
                    <TableCell className="max-w-60 whitespace-normal leading-5 text-muted-foreground">{eventSummary(event)}</TableCell>
                    <TableCell className="pr-5 text-right"><Button variant="ghost" size="sm" aria-expanded={expanded === event.id} aria-controls={expanded === event.id ? `${instanceId}-desktop-${event.id}` : undefined} onClick={() => toggle(event.id)} aria-label={`${expanded === event.id ? 'Hide' : 'View'} details for event ${event.id}`}>{expanded === event.id ? 'Hide' : 'View'}<CaretDownIcon aria-hidden="true" className={expanded === event.id ? 'rotate-180' : ''} size={14} /></Button></TableCell>
                  </TableRow>
                  {expanded === event.id && <TableRow className="bg-muted/50"><TableCell colSpan={6} className="whitespace-normal p-0"><div id={`${instanceId}-desktop-${event.id}`}><AuditEventDetail event={event} /></div></TableCell></TableRow>}
                </Fragment>)}</TableBody>
              </Table>
            </div>
            <ol className="divide-y lg:hidden">{data.items.map((event) => <li key={event.id}>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><EventBadge event={event} /><Badge variant={event.outcome === 'FAILED' ? 'error' : 'success'}>{event.outcome === 'FAILED' ? 'Failed' : 'Successful'}</Badge></div>
                <div className="text-sm leading-5"><Target event={event} onOpenEmployee={onOpenEmployee} /></div>
                <p className="break-words text-[13px] leading-5 text-muted-foreground"><ActorIdentity actor={event.actor} className="text-muted-foreground" /> · {auditTimestamp(event.timestamp)} UTC</p>
                <p className="text-sm leading-5">{eventSummary(event)}</p>
                <Button variant="outline" className="min-h-11 w-full" aria-expanded={expanded === event.id} aria-controls={expanded === event.id ? `${instanceId}-mobile-${event.id}` : undefined} onClick={() => toggle(event.id)}>{expanded === event.id ? 'Hide' : 'View'} details · #{event.id}<CaretDownIcon aria-hidden="true" className={expanded === event.id ? 'rotate-180' : ''} /></Button>
              </div>
              {expanded === event.id && <div id={`${instanceId}-mobile-${event.id}`} className="border-t bg-muted/50"><AuditEventDetail event={event} /></div>}
            </li>)}</ol>
          </>
        )}
        {data && data.total > 0 && <footer className="flex flex-wrap items-center justify-between gap-4 border-t p-4 sm:px-5">
          <p className="text-[13px] text-muted-foreground tabular-nums">{data.items.length ? `Showing ${(query.page - 1) * query.page_size + 1}–${(query.page - 1) * query.page_size + data.items.length} of ${data.total}` : `${data.total} events available`}</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2"><span className="text-[13px] text-muted-foreground">Rows</span><Select value={String(query.page_size)} onValueChange={(value) => value && updateQuery({ page_size: Number(value), page: 1 })}><SelectTrigger aria-label="Audit rows per page" className="min-h-11 min-w-20 sm:min-h-9"><SelectValue /></SelectTrigger><SelectPopup>{[20,50,100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectPopup></Select></div>
            <Pagination aria-label="Audit pagination" className="w-auto"><PaginationContent>
              <PaginationItem><Button size="icon" variant="outline" className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9" aria-label="Previous audit page" disabled={query.page <= 1} onClick={() => updateQuery({ page: query.page - 1 })}><CaretLeftIcon aria-hidden="true" /></Button></PaginationItem>
              <PaginationItem><span className="px-2 text-sm tabular-nums">{query.page} / {totalPages}</span></PaginationItem>
              <PaginationItem><Button size="icon" variant="outline" className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9" aria-label="Next audit page" disabled={query.page >= totalPages} onClick={() => updateQuery({ page: query.page + 1 })}><CaretRightIcon aria-hidden="true" /></Button></PaginationItem>
            </PaginationContent></Pagination>
          </div>
        </footer>}
      </div>
      <p className="text-[13px] leading-5 text-muted-foreground">{employeeId ? 'Audit activity is independent of the compensation as-of date.' : 'Summary counts follow the current filters. Export operations are counted once; their employee entries remain visible below.'}</p>
    </section>
  )
}
