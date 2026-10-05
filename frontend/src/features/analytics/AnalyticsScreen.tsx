import { useEffect, useState } from 'react'
import {
  ArrowClockwiseIcon, ArrowRightIcon, ChartBarIcon, DownloadSimpleIcon,
  InfoIcon, SlidersHorizontalIcon, UsersThreeIcon, WarningCircleIcon,
} from '@phosphor-icons/react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { ContextInfo } from '@/components/product/ContextInfo'
import { DatePicker } from '@/components/product/DatePicker'
import { DateRangePicker } from '@/components/product/DateRangePicker'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip as Hint, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate, formatMoney } from '@/features/employees/format'
import type { Currency, DirectoryOptions } from '@/features/employees/api'
import type { AnalyticsQuery, AnalyticsResult, Group } from './api'
import { downloadAnalytics, getAnalytics, getAnalyticsOptions } from './api'

const chartMetricName = 'Annualized base salary'
type GroupKind = 'country' | 'department' | 'role'
const groupNames: Record<GroupKind, string> = { country: 'Country', department: 'Department', role: 'Role' }

function money(amount: number | null, currency: Currency | null, frequency = '') {
  if (amount === null || !currency) return 'Unavailable'
  const formatted = formatMoney(amount, currency, frequency, 'en-US')
  return currency.code === 'USD' && !frequency ? formatted.replace(/ USD$/, '') : formatted
}
function count(value: number) { return value.toLocaleString() }
function labelDate(value: string) { return value ? formatDate(value) : '—' }
function displayRate(value: string) { return Number(value).toPrecision(10).replace(/0+$/, '').replace(/\.$/, '') }

function FilterSelect({ label, value, values, onChange }: {
  label: string; value: string; values: { value: string; label: string }[]; onChange: (value: string) => void
}) {
  const emptyLabel = ({ Country: 'All countries', Department: 'All departments', Role: 'All roles', Status: 'All statuses', Location: 'All locations' } as Record<string, string>)[label] ?? 'All'
  return <div className="min-w-0">
    <span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">{label}</span>
    <Select value={value || 'all'} onValueChange={(next) => onChange(next === 'all' ? '' : String(next))}>
      <SelectTrigger aria-label={label} className="w-full min-w-0"><SelectValue>{(selected: string | null) => selected === 'all' ? emptyLabel : values.find((option) => option.value === selected)?.label ?? selected}</SelectValue></SelectTrigger>
      <SelectPopup><SelectItem value="all">{emptyLabel}</SelectItem>{values.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectPopup>
    </Select>
  </div>
}

function Methodology({ open, onOpenChange, data }: {
  open: boolean; onOpenChange: (value: boolean) => void; data: AnalyticsResult
}) {
  const base = data.metrics.base
  const reasons = base.exclusion_reasons
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetPopup aria-label="Analytics methodology" className="sm:max-w-xl">
      <SheetHeader><SheetTitle>Methodology and FX notes</SheetTitle></SheetHeader>
      <SheetPanel className="space-y-6 text-sm leading-6">
        <section><h3 className="font-semibold">Population and date</h3><p className="mt-1 text-muted-foreground">Employed on {labelDate(data.context.as_of)} UTC: joined on or before this date and not terminated before it. Current status filters narrow this group. Country, department, role and location reflect attributes stored now, including for historical dates. Separate rehire spells cannot be reconstructed.</p></section>
        <section><h3 className="font-semibold">{chartMetricName}</h3><p className="mt-1 text-muted-foreground">Annual or monthly base × 12. Hourly pay is excluded. These are contractual commitments, never cash paid. Mean is the sum divided by included employees; median is the middle value or average of the two middle values.</p></section>
        <section><h3 className="font-semibold">Coverage and exclusions</h3><p className="mt-1 text-muted-foreground">{count(base.included)} included of {count(data.coverage.employee_count)} employees; {count(base.excluded)} excluded.</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{Object.entries(reasons).filter(([, value]) => value > 0).map(([reason, value]) => <li key={reason}>{reason.replaceAll('_', ' ')}: {count(value)}</li>)}</ul>
        </section>
        <section><h3 className="font-semibold">Currency conversion</h3><p className="mt-1 text-muted-foreground">Analytics use USD. Amounts are annualized in their source currency, then converted with the fixed {labelDate(data.context.fx_reference_date)} reference-rate set ({data.context.fx_reference_source}), regardless of the selected as-of date. Rates express one source major unit in USD; results round to USD cents. USD records need no conversion.</p>
          {data.coverage.rates.length ? <Table aria-label="FX rates used" className="mt-3"><TableHeader><TableRow><TableHead>Pair</TableHead><TableHead>Rate</TableHead><TableHead>Date</TableHead><TableHead>Source</TableHead></TableRow></TableHeader><TableBody>{data.coverage.rates.map((rate) => <TableRow key={rate.source_currency}><TableCell>{rate.source_currency}/{rate.target_currency}</TableCell><TableCell className="tabular-nums" title={rate.rate}>{displayRate(rate.rate)}</TableCell><TableCell>{labelDate(rate.rate_date)}</TableCell><TableCell>{rate.source_name}</TableCell></TableRow>)}</TableBody></Table> : <p className="mt-2 text-muted-foreground">No cross-currency rates were used.</p>}
          {data.coverage.missing_fx_currencies.length ? <p className="mt-2 text-warning-foreground">Missing approved rates for: {data.coverage.missing_fx_currencies.join(', ')}.</p> : null}
        </section>
        <p className="border-t pt-4 text-xs text-muted-foreground">Calculated {new Date(data.context.generated_at).toLocaleString()} from stored compensation.</p>
      </SheetPanel>
    </SheetPopup>
  </Sheet>
}

const exclusionLabels: Record<string, string> = {
  no_package: 'No effective compensation package',
  hourly: 'Hourly pay has no contracted hours for annualization',
  not_specified: 'Target variable pay is not specified',
  missing_fx: 'No approved USD reference rate for the source currency',
}

function PartialBadge({ reasons, label }: { reasons: Record<string, number>; label: string }) {
  const entries = Object.entries(reasons).filter(([, value]) => value > 0)
  return <Hint><TooltipTrigger delay={0} tabIndex={0} render={<button type="button" aria-label={`Partial ${label}: show exclusion reasons`} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />}><Badge variant="warning">Partial</Badge></TooltipTrigger><TooltipPopup className="max-w-72 space-y-1 p-2" side="bottom"><p className="font-semibold">Excluded from {label.toLowerCase()}</p>{entries.length ? entries.map(([reason, value]) => <p key={reason}>{exclusionLabels[reason] ?? reason.replaceAll('_', ' ')}: {count(value)}</p>) : <p>Some employees have no comparable value.</p>}</TooltipPopup></Hint>
}

function MetricCard({ title, value, detail, reasons, partial }: { title: string; value: string; detail: string; reasons: Record<string, number>; partial: boolean }) {
  return <div className="flex min-w-0 flex-col justify-between rounded-xl border bg-card p-5">
    <div className="flex items-start justify-between gap-2"><h2 className="min-w-0 text-[13px] font-medium text-muted-foreground">{title}</h2><Popover><PopoverTrigger render={<Button size="icon-sm" variant="ghost" className="-mr-1 -mt-1 shrink-0" aria-label={`About ${title}`} />}><InfoIcon aria-hidden="true" size={16} /></PopoverTrigger><PopoverPopup tooltipStyle side="bottom" align="end" className="max-w-64" aria-label={`${title} details`}>{detail}</PopoverPopup></Popover></div>
    <p className="mt-3 break-words text-[25px] font-semibold leading-8 tabular-nums">{value}</p>
    {partial && <div className="mt-3"><PartialBadge reasons={reasons} label={title} /></div>}
  </div>
}

export function AnalyticsScreen({ query, onQueryChange, onViewEmployees }: {
  query: AnalyticsQuery
  onQueryChange: (patch: Partial<AnalyticsQuery>) => void
  onViewEmployees: (kind?: GroupKind, group?: Group) => void
}) {
  const [options, setOptions] = useState<DirectoryOptions | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const requestKey = JSON.stringify([query, retry])
  const [load, setLoad] = useState<{ key: string; data: AnalyticsResult | null; error: string | null }>({ key: '', data: null, error: null })
  const loading = load.key !== requestKey
  const data = loading ? null : load.data
  const error = loading ? null : load.error
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [groupKind, setGroupKind] = useState<GroupKind>('country')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getAnalyticsOptions(controller.signal).then((result) => { setOptions(result); setOptionsError(null) }).catch((cause) => {
      if (!controller.signal.aborted) setOptionsError(cause instanceof Error ? cause.message : 'Could not load filters.')
    })
    return () => controller.abort()
  }, [retry])
  useEffect(() => {
    const controller = new AbortController()
    getAnalytics(query, controller.signal).then((result) => {
      if (!controller.signal.aborted) setLoad({ key: requestKey, data: result, error: null })
    }).catch((cause) => {
      if (!controller.signal.aborted) setLoad({ key: requestKey, data: null, error: cause instanceof Error ? cause.message : 'Analytics could not be loaded.' })
    })
    return () => controller.abort()
  }, [query, requestKey])

  function update(patch: Partial<AnalyticsQuery>) { onQueryChange(patch) }
  function clear() { update({ country: '', department: '', role: '', status: '', location_id: '' }) }
  function clearCohort() { update({ country: '', department: '', role: '', status: '', location_id: '' }) }
  async function exportData() {
    setExportError(null); setExporting(true)
    try { await downloadAnalytics(query) }
    catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Export failed. Try again.') }
    finally { setExporting(false) }
  }
  const currency = data?.context.reporting_currency ?? null
  const selected = data?.metrics.base
  const total = data?.coverage.employee_count ?? 0
  const series = data?.distribution.map((bin) => ({
    label: `${money(bin.lower, currency, '')}–${money(bin.upper, currency, '')}`,
    short: currency ? `${Math.round(bin.lower / 10 ** currency.decimal_places / 1000)}k` : '',
    count: bin.count,
  })) ?? []
  const activeFilters = [
    { key: 'country', label: 'Country', value: query.country, display: options?.countries.find((item) => item.code === query.country)?.name ?? query.country },
    { key: 'department', label: 'Department', value: query.department, display: options?.departments.find((item) => item.code === query.department)?.name ?? query.department },
    { key: 'role', label: 'Role', value: query.role, display: query.role },
    { key: 'status', label: 'Status', value: query.status, display: query.status.replaceAll('_', ' ').toLowerCase() },
    { key: 'location_id', label: 'Location', value: query.location_id, display: options?.locations.find((item) => String(item.id) === query.location_id)?.name ?? query.location_id },
  ] as const
  const appliedFilters = activeFilters.filter((item) => item.value)

  return <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
    <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div><p className="text-[13px] text-muted-foreground">Workspace / Analytics</p><div className="mt-1 flex items-center gap-1.5"><h1 className="text-[28px] font-semibold leading-9 tracking-tight">Compensation analytics</h1><ContextInfo label="About compensation analytics">Annualized compensation commitments, distribution and cohort breakdowns as of {labelDate(query.as_of)} UTC. Figures are not actual cash paid.</ContextInfo></div></div>
      <div className="grid w-full grid-cols-1 gap-2 justify-self-end min-[380px]:grid-cols-2 sm:w-auto xl:flex xl:flex-wrap xl:justify-end">
        <Button variant="outline" className="w-full min-[380px]:col-span-2 xl:w-auto" onClick={() => setMethodologyOpen(true)} disabled={!data}><InfoIcon aria-hidden="true" />Methodology &amp; FX Notes</Button>
        <Button variant="outline" className="w-full xl:w-auto" onClick={exportData} loading={exporting} disabled={!data || !total}><DownloadSimpleIcon aria-hidden="true" />Export snapshot</Button>
        <Button className="w-full xl:w-auto" onClick={() => onViewEmployees()}><UsersThreeIcon aria-hidden="true" />View employees</Button>
      </div>
    </header>
    <section aria-label="Analytics filters" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44 flex-1 sm:max-w-64"><label htmlFor="analytics-as-of" className="mb-1.5 block text-[13px] font-medium text-muted-foreground">As of (UTC)</label><DatePicker id="analytics-as-of" label="As of (UTC)" value={query.as_of} onChange={(value) => { if (value) update({ as_of: value, period_to: value, period_from: value.slice(0, 7) + '-01' }) }} /></div>
        <div className="min-w-52 flex-[2] sm:max-w-80"><span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">Metric for chart and groups</span><p className="flex min-h-9 items-center rounded-lg bg-muted px-3 text-sm font-medium">Annualized Base Salary</p></div>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}><SlidersHorizontalIcon aria-hidden="true" />Filters{appliedFilters.length ? ` (${appliedFilters.length})` : ''}</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-[13px] text-muted-foreground"><span>{data ? `${count(total)} employees · ` : ''}Reporting currency: USD</span>{appliedFilters.map((item) => <Button key={item.key} size="xs" variant="outline" className="max-w-full" aria-label={`Remove ${item.label} filter`} onClick={() => update({ [item.key]: '' })}><span className="max-w-44 truncate">{item.label}: {item.display}</span>×</Button>)}{appliedFilters.length > 0 && <Button size="xs" variant="ghost" onClick={clearCohort}>Clear all</Button>}</div>
    </section>
    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}><SheetPopup aria-label="Cohort filters"><SheetHeader><SheetTitle>Filter cohort</SheetTitle><SheetDescription>Refine the employees included in every analytics result.</SheetDescription></SheetHeader><SheetPanel className="space-y-4">
      <FilterSelect label="Country" value={query.country} values={options?.countries.map((item) => ({ value: item.code, label: item.name })) ?? []} onChange={(value) => update({ country: value })} />
      <FilterSelect label="Department" value={query.department} values={options?.departments.map((item) => ({ value: item.code, label: item.name })) ?? []} onChange={(value) => update({ department: value })} />
      <FilterSelect label="Role" value={query.role} values={options?.roles.map((item) => ({ value: item, label: item })) ?? []} onChange={(value) => update({ role: value })} />
      <FilterSelect label="Status" value={query.status} values={options?.statuses.map((item) => ({ value: item, label: item.replaceAll('_', ' ').toLowerCase() })) ?? []} onChange={(value) => update({ status: value })} />
      <FilterSelect label="Location" value={query.location_id} values={options?.locations.map((item) => ({ value: String(item.id), label: `${item.name}, ${item.country_name}` })) ?? []} onChange={(value) => update({ location_id: value })} />
    </SheetPanel><SheetFooter className="flex justify-between"><Button variant="ghost" onClick={clearCohort} disabled={!appliedFilters.length}>Clear all</Button><Button onClick={() => setFiltersOpen(false)}>Show results</Button></SheetFooter></SheetPopup></Sheet>
    {optionsError && <p className="rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm text-warning-foreground" role="alert">Filter choices unavailable: {optionsError} <Button variant="ghost" size="xs" onClick={() => setRetry((value) => value + 1)}>Retry</Button></p>}
    {exportError && <p role="alert" className="text-sm text-destructive-foreground">{exportError}</p>}
    {loading ? <div className="space-y-5" aria-label="Loading analytics"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36" />)}</div><Skeleton className="h-80" /><Skeleton className="h-64" /></div> : error ? <div role="alert" className="rounded-xl border bg-card p-8"><h2 className="text-lg font-semibold">Couldn’t load analytics</h2><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={() => setRetry((value) => value + 1)}><ArrowClockwiseIcon aria-hidden="true" />Try again</Button></div> : !data ? null : total === 0 ? <Empty className="rounded-xl border bg-card"><EmptyHeader><EmptyTitle>No employees in this cohort</EmptyTitle><EmptyDescription>Change the date or filters to include employees employed on that date.</EmptyDescription></EmptyHeader><Button variant="outline" onClick={clear}>Clear filters</Button></Empty> : <>
      {selected?.partial && <div role="status" aria-live="polite" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm text-warning-foreground">
        <WarningCircleIcon aria-hidden="true" className="mt-0.5 shrink-0" /><p>Partial annualized base salary: {count(selected.excluded)} of {count(total)} employees excluded. Hover or focus a Partial badge for reasons.</p>
      </div>}
      <section aria-label="Summary metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Estimated annual base spend" value={money(data.metrics.base.sum, currency)} detail={`${count(data.metrics.base.included)} included · ${count(data.metrics.base.excluded)} excluded · ${labelDate(query.as_of)} UTC`} partial={data.metrics.base.partial} reasons={data.metrics.base.exclusion_reasons} />
        <MetricCard title="Average base salary" value={money(data.metrics.base.average, currency)} detail="Mean annualized base of included employees" partial={data.metrics.base.partial} reasons={data.metrics.base.exclusion_reasons} />
        <MetricCard title="Median base salary" value={money(data.metrics.base.median, currency)} detail="Middle annualized base value (P50)" partial={data.metrics.base.partial} reasons={data.metrics.base.exclusion_reasons} />
        <MetricCard title="Target variable pool" value={money(data.metrics.variable.sum, currency)} detail={`${count(data.metrics.variable.included)} included · target, not paid bonus`} partial={data.metrics.variable.partial} reasons={data.metrics.variable.exclusion_reasons} />
      </section>
      <section aria-labelledby="distribution-title" className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><h2 id="distribution-title" className="text-lg font-semibold">{chartMetricName} distribution</h2><p className="mt-1 text-[13px] text-muted-foreground">USD · {labelDate(query.as_of)} UTC · {count(selected?.included ?? 0)} employees included</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline"><ChartBarIcon aria-hidden="true" />Chart and exact values</Badge><Button variant="outline" size="sm" onClick={() => onViewEmployees()}>View employees <ArrowRightIcon aria-hidden="true" /></Button></div></div>
        {!series.length ? <div className="py-12 text-center text-sm text-muted-foreground">No comparable salary values for this cohort. Review exclusions with the Partial badge.</div> : <>
          <div role="img" aria-label={`Distribution of annualized base salary for ${selected?.included} employees; exact bin values follow in the table`} className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={series} accessibilityLayer margin={{ top: 12, right: 10, bottom: 8, left: 0 }}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="short" tickLine={false} axisLine={false} fontSize={11} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} /><Tooltip formatter={(value) => [count(Number(value)), 'Employees']} labelFormatter={(_label, payload) => payload?.[0]?.payload?.label ?? ''} /><Bar dataKey="count" fill="var(--color-neutral-500)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
          </div>
          <div className="mt-5"><h3 className="mb-2 text-sm font-semibold">Exact distribution values</h3><Table aria-label="Salary distribution bins"><TableHeader><TableRow><TableHead>From</TableHead><TableHead>Through (inclusive)</TableHead><TableHead className="text-right">Employees</TableHead></TableRow></TableHeader><TableBody>{data.distribution.map((bin) => <TableRow key={bin.lower}><TableCell className="tabular-nums">{money(bin.lower, currency, '')}</TableCell><TableCell className="tabular-nums">{money(bin.upper, currency, '')}</TableCell><TableCell className="text-right tabular-nums">{count(bin.count)}</TableCell></TableRow>)}</TableBody></Table></div>
        </>}
      </section>
      <section aria-labelledby="breakdown-title" className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><h2 id="breakdown-title" className="text-lg font-semibold">Compensation breakdown</h2><p className="mt-1 text-[13px] text-muted-foreground">{chartMetricName} · USD</p></div><div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">{(Object.keys(groupNames) as GroupKind[]).map((kind) => <Button key={kind} variant={groupKind === kind ? 'outline' : 'ghost'} size="sm" aria-pressed={groupKind === kind} onClick={() => setGroupKind(kind)}>{groupNames[kind]}</Button>)}</div></div>
        <Table aria-label={`${groupNames[groupKind]} compensation breakdown`} className="mt-3 min-w-[780px]"><TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-card">{groupNames[groupKind]}</TableHead><TableHead className="text-right">Employees</TableHead><TableHead className="text-right">Included</TableHead><TableHead className="text-right">Excluded</TableHead><TableHead className="text-right">Annual sum</TableHead><TableHead className="text-right">Average</TableHead><TableHead className="text-right">Median</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{data.breakdowns[groupKind].map((group) => <TableRow key={group.key}><TableCell className="sticky left-0 z-10 bg-card font-medium">{group.label}{group.partial && <span className="ml-2 inline-flex"><PartialBadge reasons={group.exclusion_reasons} label={`${group.label} ${chartMetricName}`} /></span>}</TableCell><TableCell className="text-right tabular-nums">{count(group.employee_count)}</TableCell><TableCell className="text-right tabular-nums">{count(group.included)}</TableCell><TableCell className="text-right tabular-nums">{count(group.excluded)}</TableCell><TableCell className="text-right tabular-nums">{money(group.sum, currency)}</TableCell><TableCell className="text-right tabular-nums">{money(group.average, currency)}</TableCell><TableCell className="text-right tabular-nums">{money(group.median, currency)}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => onViewEmployees(groupKind, group)}>View employees <ArrowRightIcon aria-hidden="true" /></Button></TableCell></TableRow>)}</TableBody></Table>
      </section>
      <section aria-labelledby="changes-title" className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><h2 id="changes-title" className="text-lg font-semibold">Compensation changes</h2><p className="mt-1 text-[13px] text-muted-foreground">Recorded package starts in the selected UTC period · {count(data.changes.count)} changes</p></div><DateRangePicker label="Changes date range (UTC)" value={{ from: query.period_from, to: query.period_to }} max={query.as_of} required onChange={({ from, to }) => update({ period_from: from, period_to: to })} /></div>
        {!data.changes.items.length ? <p className="py-8 text-center text-sm text-muted-foreground">No package starts in this period.</p> : <Table aria-label="Compensation changes" className="mt-3 min-w-[700px]"><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Effective date</TableHead><TableHead className="text-right">Previous base</TableHead><TableHead className="text-right">New base</TableHead><TableHead className="text-right">Change</TableHead></TableRow></TableHeader><TableBody>{data.changes.items.map((change, index) => { const valueCurrency = options?.currencies.find((item) => item.code === change.currency_code) ?? { code: change.currency_code, name: change.currency_code, symbol: null, decimal_places: change.decimal_places }; const previousCurrency = change.previous_currency ? options?.currencies.find((item) => item.code === change.previous_currency) ?? { code: change.previous_currency, name: change.previous_currency, symbol: null, decimal_places: change.previous_decimal_places ?? 2 } : null; return <TableRow key={`${change.employee_id}-${change.effective_from}-${index}`}><TableCell>{change.employee_name}<span className="block text-xs text-muted-foreground">{change.employee_code}</span></TableCell><TableCell>{labelDate(change.effective_from)}</TableCell><TableCell className="text-right tabular-nums">{change.previous_base === null ? 'First package' : money(change.previous_base, previousCurrency, change.previous_frequency ?? '')}</TableCell><TableCell className="text-right tabular-nums">{money(change.base_pay, valueCurrency, change.pay_frequency)}</TableCell><TableCell className="text-right tabular-nums">{change.percentage === null ? 'Not comparable' : `${change.percentage > 0 ? '+' : ''}${change.percentage}%`}</TableCell></TableRow> })}</TableBody></Table>}
        {data.changes.count > data.changes.items.length && <p className="mt-3 text-[13px] text-muted-foreground">Showing the newest {data.changes.items.length} changes. Export the snapshot for the full selected period.</p>}
      </section>
      <Methodology open={methodologyOpen} onOpenChange={setMethodologyOpen} data={data} />
    </>}
  </div>
}
