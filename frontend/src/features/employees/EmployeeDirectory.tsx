import { useEffect, useState } from 'react'
import {
  ArrowRightIcon, ColumnsIcon, DownloadSimpleIcon, MagnifyingGlassIcon,
  PlusIcon, RowsIcon, UsersThreeIcon, WarningCircleIcon, XIcon,
} from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from '@/components/ui/menu'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DirectoryOptions, DirectoryQuery, DirectoryResponse, Employee } from './api'
import { downloadDirectory, getDirectoryOptions, getEmployees } from './api'
import { CreateEmployeeSheet } from './CreateEmployeeSheet'
import { formatDate, formatMoney, packageLabels, statusLabel } from './format'
import { PackageBadge } from './PackageBadge'

type QueryPatch = Partial<DirectoryQuery>
type Column = 'role' | 'location' | 'status' | 'pay' | 'package'
type LoadState = { key: string; data: DirectoryResponse | null; error: string | null }

const columnNames: Record<Column, string> = {
  role: 'Role and department', location: 'Location', status: 'Status',
  pay: 'Current base pay', package: 'Package state',
}

function FilterSelect({ label, value, values, onChange }: {
  label: string
  value: string
  values: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Select value={value || 'all'} onValueChange={(next) => onChange(next === 'all' ? '' : String(next))}>
      <SelectTrigger aria-label={label} className="min-w-0"><SelectValue>{(selected: string | null) => selected === 'all' ? `${label}: All` : values.find((item) => item.value === selected)?.label ?? selected}</SelectValue></SelectTrigger>
      <SelectPopup>
        <SelectItem value="all">{label}: All</SelectItem>
        {values.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
      </SelectPopup>
    </Select>
  )
}

function EmployeeName({ employee, onOpen }: { employee: Employee; onOpen: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700" aria-hidden="true">
        {employee.first_name[0]}{employee.last_name[0]}
      </span>
      <div className="min-w-0">
        <button className="block max-w-full truncate text-left font-medium text-foreground underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring" onClick={onOpen} type="button">
          {employee.first_name} {employee.last_name}
        </button>
        <p className="truncate text-xs text-muted-foreground" title={employee.email}>{employee.email}</p>
      </div>
    </div>
  )
}

function DirectoryRows({ employees, columns, compact, onOpen }: {
  employees: Employee[]
  columns: Record<Column, boolean>
  compact: boolean
  onOpen: (id: number) => void
}) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {employees.map((employee) => (
          <div className="rounded-xl border bg-card p-4" key={employee.employee_id}>
            <div className="flex items-start justify-between gap-3">
              <EmployeeName employee={employee} onOpen={() => onOpen(employee.employee_id)} />
              <Button aria-label={`Open ${employee.first_name} ${employee.last_name}`} title={`Open ${employee.first_name} ${employee.last_name}`} size="icon-sm" variant="ghost" onClick={() => onOpen(employee.employee_id)}><ArrowRightIcon aria-hidden="true" /></Button>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">{employee.employee_code} · {employee.country.name}</p>
            <p className="mt-1 text-sm">{employee.job_title || 'Role not specified'} · {employee.department.name}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant={employee.status === 'ACTIVE' ? 'success' : 'secondary'}>{statusLabel(employee.status)}</Badge><PackageBadge state={employee.package_state} /></div>
            <p className="mt-3 border-t pt-3 text-sm font-medium tabular-nums">{employee.current_compensation ? formatMoney(employee.current_compensation.base_pay, employee.current_compensation.currency, employee.current_compensation.pay_frequency) : 'No current base pay'}</p>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table aria-label="Employee directory" className="min-w-[920px]">
          <TableHeader className="bg-muted/70">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Code</TableHead>
              <TableHead className="sticky left-0 z-10 bg-muted">Employee</TableHead>
              {columns.role && <TableHead>Role and department</TableHead>}
              {columns.location && <TableHead>Location</TableHead>}
              {columns.status && <TableHead>Status</TableHead>}
              {columns.pay && <TableHead className="text-right">Current base pay</TableHead>}
              {columns.package && <TableHead>Package state</TableHead>}
              <TableHead className="pr-5 text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow className={compact ? 'h-10' : 'h-14'} key={employee.employee_id}>
                <TableCell className="pl-5 text-xs font-medium text-muted-foreground tabular-nums">{employee.employee_code}</TableCell>
                <TableCell className="sticky left-0 z-10 bg-card"><EmployeeName employee={employee} onOpen={() => onOpen(employee.employee_id)} /></TableCell>
                {columns.role && <TableCell><span className="block max-w-48 truncate" title={employee.job_title || undefined}>{employee.job_title || 'Not specified'}</span><span className="mt-1 block max-w-48 truncate text-xs text-muted-foreground" title={employee.department.name}>{employee.department.name}</span></TableCell>}
                {columns.location && <TableCell><span className="block max-w-40 truncate" title={`${employee.location.name}, ${employee.country.name}`}>{employee.location.name}, {employee.country.name}</span></TableCell>}
                {columns.status && <TableCell><Badge variant={employee.status === 'ACTIVE' ? 'success' : 'secondary'}>{statusLabel(employee.status)}</Badge></TableCell>}
                {columns.pay && <TableCell className="text-right tabular-nums">{employee.current_compensation ? <><span className="block font-medium">{formatMoney(employee.current_compensation.base_pay, employee.current_compensation.currency)}</span><span className="mt-1 block text-xs text-muted-foreground">{employee.current_compensation.currency.code} / {employee.current_compensation.pay_frequency.toLowerCase()}</span></> : <span className="text-muted-foreground">Not specified</span>}</TableCell>}
                {columns.package && <TableCell><PackageBadge state={employee.package_state} />{employee.next_effective_from && <span className="mt-1 block text-xs text-muted-foreground">From {formatDate(employee.next_effective_from)}</span>}</TableCell>}
                <TableCell className="pr-5 text-right"><Button aria-label={`Open ${employee.first_name} ${employee.last_name}`} title={`Open ${employee.first_name} ${employee.last_name}`} size="icon-sm" variant="ghost" onClick={() => onOpen(employee.employee_id)}><ArrowRightIcon aria-hidden="true" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

export function EmployeeDirectory({ query, updateQuery, onOpenEmployee }: {
  query: DirectoryQuery
  updateQuery: (patch: QueryPatch) => void
  onOpenEmployee: (id: number) => void
}) {
  const [loadState, setLoadState] = useState<LoadState>({ key: '', data: null, error: null })
  const [options, setOptions] = useState<DirectoryOptions | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(query.search)
  const [retry, setRetry] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [compact, setCompact] = useState(false)
  const [columns, setColumns] = useState<Record<Column, boolean>>({ role: true, location: true, status: true, pay: true, package: true })
  const requestKey = JSON.stringify([query, retry])
  const loading = loadState.key !== requestKey
  const data = loading ? null : loadState.data
  const error = loading ? null : loadState.error

  useEffect(() => {
    const controller = new AbortController()
    getDirectoryOptions(controller.signal).then((result) => { setOptions(result); setOptionsError(null) }).catch((cause) => {
      if (!controller.signal.aborted) setOptionsError(cause instanceof Error ? cause.message : 'Filters unavailable')
    })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    const controller = new AbortController()
    getEmployees(query, controller.signal).then((result) => {
      if (!controller.signal.aborted) setLoadState({ key: requestKey, data: result, error: null })
    }).catch((cause) => {
      if (!controller.signal.aborted) setLoadState({ key: requestKey, data: null, error: cause instanceof Error ? cause.message : 'Employees could not be loaded' })
    })
    return () => controller.abort()
  }, [query, requestKey])

  useEffect(() => {
    const syncSearchFromHistory = () => setSearchInput(new URLSearchParams(window.location.search).get('search') ?? '')
    window.addEventListener('popstate', syncSearchFromHistory)
    return () => window.removeEventListener('popstate', syncSearchFromHistory)
  }, [])

  useEffect(() => {
    if (searchInput === query.search) return
    const timeout = setTimeout(() => updateQuery({ search: searchInput }), 300)
    return () => clearTimeout(timeout)
  }, [searchInput, query.search, updateQuery])

  function changeFilter(patch: QueryPatch) {
    updateQuery(patch)
  }


  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await downloadDirectory(query)
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  const activeFilters = ([
    ['search', 'Search', query.search], ['country', 'Country', query.country],
    ['department', 'Department', query.department], ['role', 'Role', query.role],
    ['status', 'Status', query.status], ['package_state', 'Package', query.package_state],
  ] as const).filter((item) => item[2])
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const first = data && data.total ? (data.page - 1) * data.page_size + 1 : 0
  const last = data ? Math.min(data.page * data.page_size, data.total) : 0
  const pageOutOfRange = Boolean(data && data.total > 0 && data.items.length === 0)
  const noEmployees = Boolean(data && data.items.length === 0 && !pageOutOfRange && (!activeFilters.length || !options?.statuses.length))

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-3"><h1 className="text-[28px] leading-9 font-semibold tracking-tight">Employees</h1>{data && <span aria-live="polite" className="text-sm text-muted-foreground tabular-nums">{data.total.toLocaleString()} in view</span>}</div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Find employees, inspect effective compensation, and maintain the directory. Figures use each employee’s stored currency.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={exporting} disabled={!data || data.total === 0} onClick={handleExport}><DownloadSimpleIcon aria-hidden="true" />Export directory</Button>
          <Button onClick={() => setAddOpen(true)}><PlusIcon aria-hidden="true" />Add employee</Button>
        </div>
      </div>

      <div className="mb-5 rounded-xl border bg-card p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_repeat(5,minmax(135px,1fr))]">
          <div className="relative">
            <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input aria-label="Search employees by name or code" className="[&_input]:pl-9" placeholder="Search by name or code…" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') changeFilter({ search: searchInput }) }} />
          </div>
          <FilterSelect label="Country" value={query.country} values={options?.countries.map((item) => ({ value: item.code, label: item.name })) ?? []} onChange={(value) => changeFilter({ country: value })} />
          <FilterSelect label="Department" value={query.department} values={options?.departments.map((item) => ({ value: item.code, label: item.name })) ?? []} onChange={(value) => changeFilter({ department: value })} />
          <FilterSelect label="Role" value={query.role} values={options?.roles.map((item) => ({ value: item, label: item })) ?? []} onChange={(value) => changeFilter({ role: value })} />
          <FilterSelect label="Status" value={query.status} values={(options?.statuses ?? ['ACTIVE']).map((item) => ({ value: item, label: statusLabel(item) }))} onChange={(value) => changeFilter({ status: value })} />
          <FilterSelect label="Package" value={query.package_state} values={(options?.package_states ?? []).map((item) => ({ value: item, label: packageLabels[item] }))} onChange={(value) => changeFilter({ package_state: value })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 font-medium text-muted-foreground">Active filters</span>
            {activeFilters.length === 0 ? <span className="text-muted-foreground">None</span> : activeFilters.map(([key, label, value]) => (
              <Button key={key} size="xs" variant="outline" onClick={() => { if (key === 'search') setSearchInput(''); changeFilter({ [key]: '' }) }}>
                {label}: {key === 'status' ? statusLabel(value) : key === 'package_state' ? packageLabels[value as keyof typeof packageLabels] : value}<XIcon aria-hidden="true" size={12} />
              </Button>
            ))}
            {activeFilters.length > 0 && <Button size="xs" variant="ghost" onClick={() => { setSearchInput(''); changeFilter({ search: '', country: '', department: '', role: '', status: '', package_state: '' }) }}>Clear all</Button>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {data && <span className="mr-2 tabular-nums">Showing {first}–{last} of {data.total.toLocaleString()}</span>}
            <Button aria-label={compact ? 'Comfortable rows' : 'Compact rows'} title={compact ? 'Comfortable rows' : 'Compact rows'} aria-pressed={compact} size="icon-sm" variant="ghost" onClick={() => setCompact((value) => !value)}><RowsIcon aria-hidden="true" /></Button>
            <Menu>
              <MenuTrigger render={<Button aria-label="Visible columns" title="Visible columns" size="icon-sm" variant="ghost" />}><ColumnsIcon aria-hidden="true" /></MenuTrigger>
              <MenuPopup align="end">
                {(Object.keys(columnNames) as Column[]).map((column) => (
                  <MenuCheckboxItem key={column} checked={columns[column]} onCheckedChange={(checked) => setColumns((current) => ({ ...current, [column]: checked }))}>{columnNames[column]}</MenuCheckboxItem>
                ))}
              </MenuPopup>
            </Menu>
          </div>
        </div>
      </div>

      {optionsError && <div className="mb-4 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning-foreground" role="alert">Filter options could not be loaded: {optionsError} <Button size="xs" variant="ghost" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div>}
      {exportError && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive-foreground" role="alert">{exportError}</div>}
      {loading ? <div aria-label="Loading employees" className="space-y-2"><Skeleton className="h-10 w-full" />{Array.from({ length: 8 }, (_, index) => <Skeleton className="h-14 w-full" key={index} />)}</div> : error ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center" role="alert"><WarningCircleIcon aria-hidden="true" className="mx-auto text-destructive" size={28} /><h2 className="mt-4 text-lg font-semibold">Couldn’t load employees</h2><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button className="mt-5" variant="outline" onClick={() => setRetry((value) => value + 1)}>Try again</Button></div>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-xl border bg-card"><Empty><EmptyHeader><EmptyMedia variant="icon"><UsersThreeIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>{pageOutOfRange ? 'This page is unavailable' : noEmployees ? 'No employees yet' : 'No employees match these filters'}</EmptyTitle><p className="mt-2 text-sm text-muted-foreground">{pageOutOfRange ? 'The directory has fewer pages now.' : noEmployees ? 'Add an employee after departments and locations are configured.' : 'Try a different search or clear the filters.'}</p></EmptyHeader><div className="flex gap-2">{pageOutOfRange ? <Button variant="outline" onClick={() => changeFilter({ page: 1 })}>Go to first page</Button> : noEmployees ? <Button onClick={() => setAddOpen(true)}>Add employee</Button> : <Button variant="outline" onClick={() => { setSearchInput(''); changeFilter({ search: '', country: '', department: '', role: '', status: '', package_state: '' }) }}>Clear filters</Button>}</div></Empty></div>
      ) : data ? <DirectoryRows employees={data.items} columns={columns} compact={compact} onOpen={onOpenEmployee} /> : null}

      {data && data.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>Rows per page</span><div className="w-20"><FilterSelect label="Rows" value={String(query.page_size)} values={[20, 50, 100].map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => changeFilter({ page_size: Number(value) })} /></div><span className="ml-2 tabular-nums">Page {data.page} of {totalPages}</span></div>
          <Pagination className="mx-0 w-auto"><PaginationContent>
            <PaginationItem><Button aria-label="Previous page" disabled={data.page <= 1} size="sm" variant="ghost" onClick={() => changeFilter({ page: data.page - 1 })}>Previous</Button></PaginationItem>
            {Array.from(new Set([1, data.page - 1, data.page, data.page + 1, totalPages].filter((page) => page >= 1 && page <= totalPages))).sort((a, b) => a - b).map((page) => <PaginationItem key={page}><Button aria-label={`Page ${page}`} aria-current={page === data.page ? 'page' : undefined} size="icon-sm" variant={page === data.page ? 'outline' : 'ghost'} onClick={() => changeFilter({ page })}>{page}</Button></PaginationItem>)}
            <PaginationItem><Button aria-label="Next page" disabled={data.page >= totalPages} size="sm" variant="ghost" onClick={() => changeFilter({ page: data.page + 1 })}>Next</Button></PaginationItem>
          </PaginationContent></Pagination>
        </div>
      )}
      <CreateEmployeeSheet open={addOpen} onOpenChange={setAddOpen} options={options} onCreated={(employee) => { setSearchInput(employee.employee_code); changeFilter({ search: employee.employee_code, status: '', country: '', department: '', role: '', package_state: '' }); setRetry((value) => value + 1) }} />
    </div>
  )
}
