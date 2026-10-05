import { useEffect, useState } from 'react'
import {
  ColumnsIcon, DownloadSimpleIcon, MagnifyingGlassIcon,
  PlusIcon, RowsIcon, SlidersHorizontalIcon, UsersThreeIcon, WarningCircleIcon, XIcon,
} from '@phosphor-icons/react'
import { ContextInfo } from '@/components/product/ContextInfo'
import { DatePicker } from '@/components/product/DatePicker'
import { FilterSelect } from '@/components/product/FilterSelect'
import { PageContainer, PageHeader } from '@/components/product/PageLayout'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from '@/components/ui/menu'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { DirectoryOptions, DirectoryQuery, DirectoryResponse } from './api'
import { downloadDirectory, getDirectoryOptions, getEmployees } from './api'
import { CreateEmployeeSheet } from './CreateEmployeeSheet'
import { DirectoryResults, type DirectoryColumn } from './DirectoryResults'
import { formatDate, packageLabels, roleLabel, statusLabel } from './format'

type QueryPatch = Partial<DirectoryQuery>
type LoadState = { key: string; data: DirectoryResponse | null; error: string | null }

const directoryColumnNames: Record<DirectoryColumn, string> = {
  role: 'Role and department',
  location: 'Location',
  status: 'Status',
  pay: 'Current base pay',
  package: 'Package state',
}

export function EmployeeDirectory({ query, updateQuery, onOpenEmployee }: {
  query: DirectoryQuery
  updateQuery: (patch: QueryPatch) => void
  onOpenEmployee: (id: number) => void
}) {
  const [loadState, setLoadState] = useState<LoadState>({ key: '', data: null, error: null })
  const [options, setOptions] = useState<DirectoryOptions | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState({ query, value: query.search })
  const searchInput = searchDraft.query === query ? searchDraft.value : query.search
  const setSearchInput = (value: string) => setSearchDraft({ query, value })
  const [retry, setRetry] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [compact, setCompact] = useState(false)
  const [columns, setColumns] = useState<Record<DirectoryColumn, boolean>>({ role: true, location: true, status: true, pay: true, package: true })
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
    if (searchInput === query.search) return
    const timeout = setTimeout(() => updateQuery({ search: searchInput }), 300)
    return () => clearTimeout(timeout)
  }, [searchInput, query.search, updateQuery])

  function changeFilter(patch: QueryPatch) {
    updateQuery(patch)
  }

  function clearFilters() {
    setSearchInput('')
    changeFilter({ search: '', country: '', department: '', role: '', status: '', package_state: '', as_of: '', location_id: '', employed_as_of: '' })
  }

  function clearCohortFilters() {
    changeFilter({ country: '', department: '', role: '', status: '', package_state: '', as_of: '', location_id: '', employed_as_of: '' })
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

  const selectedLocation = options?.locations.find((item) => String(item.id) === query.location_id)
  const activeFilters = ([
    { key: 'search', label: 'Search', value: query.search, display: query.search },
    { key: 'country', label: 'Country', value: query.country, display: options?.countries.find((item) => item.code === query.country)?.name ?? query.country },
    { key: 'department', label: 'Department', value: query.department, display: options?.departments.find((item) => item.code === query.department)?.name ?? query.department },
    { key: 'role', label: 'Role', value: query.role, display: roleLabel(query.role) },
    { key: 'status', label: 'Status', value: query.status, display: statusLabel(query.status) },
    { key: 'package_state', label: 'Package', value: query.package_state, display: packageLabels[query.package_state as keyof typeof packageLabels] ?? query.package_state },
    { key: 'as_of', label: 'As of UTC', value: query.as_of, display: query.as_of ? formatDate(query.as_of) : '' },
    { key: 'location_id', label: 'Location', value: query.location_id, display: selectedLocation ? `${selectedLocation.name}, ${selectedLocation.country_name}` : query.location_id },
    { key: 'employed_as_of', label: 'Population', value: query.employed_as_of, display: 'Employed as of date' },
  ] as const).filter((item) => item.value)
  const cohortFilterCount = activeFilters.filter((item) => item.key !== 'search').length
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const first = data && data.total ? (data.page - 1) * data.page_size + 1 : 0
  const last = data ? Math.min(data.page * data.page_size, data.total) : 0
  const pageOutOfRange = Boolean(data && data.total > 0 && data.items.length === 0)
  const noEmployees = Boolean(data && data.items.length === 0 && !pageOutOfRange && (!activeFilters.length || !options?.statuses.length))

  return (
    <PageContainer>
      <PageHeader
        className="mb-6"
        title="Employees"
        description="Find employees and review their compensation and employment details."
        titleAction={<ContextInfo label="About directory figures">Compensation uses each employee’s stored currency{query.as_of ? ` as of ${formatDate(query.as_of)} UTC` : ''}. Search and filters are applied by the server.</ContextInfo>}
        actions={
          <>
          <Button variant="outline" loading={exporting} disabled={!data || data.total === 0} onClick={handleExport}><DownloadSimpleIcon aria-hidden="true" />Export directory</Button>
          <Button onClick={() => setAddOpen(true)}><PlusIcon aria-hidden="true" />Add employee</Button>
          </>
        }
      />

      <div className="mb-5 rounded-xl border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56 sm:max-w-md">
            <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input aria-label="Search employees by name or code" className="[&_input]:pl-9" placeholder="Search by name or code…" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') changeFilter({ search: searchInput }) }} />
          </div>
          <Button variant="outline" onClick={() => setFiltersOpen(true)}><SlidersHorizontalIcon aria-hidden="true" />Filters{cohortFilterCount ? ` (${cohortFilterCount})` : ''}</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {activeFilters.length === 0 ? <span className="text-muted-foreground">All employees</span> : activeFilters.map(({ key, label, display }) => (
              <Button key={key} size="xs" variant="outline" className="max-w-full" aria-label={`Remove ${label} filter`} onClick={() => { if (key === 'search') setSearchInput(''); changeFilter(key === 'as_of' ? { as_of: '', employed_as_of: '' } : { [key]: '' }) }}>
                <span className="max-w-44 truncate">{label}: {display}</span><XIcon aria-hidden="true" size={12} />
              </Button>
            ))}
            {activeFilters.length > 0 && <Button size="xs" variant="ghost" onClick={clearFilters}>Clear all</Button>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {data && <span aria-live="polite" className="mr-2 tabular-nums">Showing {first}–{last} of {data.total.toLocaleString()}</span>}
            <Button aria-label={compact ? 'Comfortable rows' : 'Compact rows'} title={compact ? 'Comfortable rows' : 'Compact rows'} aria-pressed={compact} size="icon-sm" variant="ghost" onClick={() => setCompact((value) => !value)}><RowsIcon aria-hidden="true" /></Button>
            <Menu>
              <MenuTrigger render={<Button aria-label="Visible columns" title="Visible columns" size="icon-sm" variant="ghost" />}><ColumnsIcon aria-hidden="true" /></MenuTrigger>
              <MenuPopup align="end">
                {(Object.keys(directoryColumnNames) as DirectoryColumn[]).map((column) => (
                  <MenuCheckboxItem key={column} checked={columns[column]} onCheckedChange={(checked) => setColumns((current) => ({ ...current, [column]: checked }))}>{directoryColumnNames[column]}</MenuCheckboxItem>
                ))}
              </MenuPopup>
            </Menu>
          </div>
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}><SheetPopup aria-label="Employee filters"><SheetHeader><SheetTitle>Filter employees</SheetTitle><SheetDescription className="sr-only">Choose filters for the employee directory.</SheetDescription></SheetHeader><SheetPanel className="space-y-4">
        {optionsError && <p role="alert" className="rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm text-warning-foreground">Filter choices unavailable. <Button size="xs" variant="ghost" onClick={() => setRetry((value) => value + 1)}>Retry</Button></p>}
        <FilterSelect stacked label="Country" value={query.country} values={options?.countries.map((item) => ({ value: item.code, label: item.name })) ?? []} onChange={(value) => changeFilter({ country: value })} />
        <FilterSelect stacked label="Department" value={query.department} values={options?.departments.map((item) => ({ value: item.code, label: item.name })) ?? []} onChange={(value) => changeFilter({ department: value })} />
        <FilterSelect stacked label="Role" value={query.role} values={options?.roles.map((item) => ({ value: item, label: roleLabel(item) })) ?? []} onChange={(value) => changeFilter({ role: value })} />
        <FilterSelect stacked label="Status" value={query.status} values={(options?.statuses ?? ['ACTIVE']).map((item) => ({ value: item, label: statusLabel(item) }))} onChange={(value) => changeFilter({ status: value })} />
        <FilterSelect stacked label="Package" value={query.package_state} values={(options?.package_states ?? []).map((item) => ({ value: item, label: packageLabels[item] }))} onChange={(value) => changeFilter({ package_state: value })} />
        <FilterSelect stacked label="Location" value={query.location_id} values={options?.locations.map((item) => ({ value: String(item.id), label: `${item.name}, ${item.country_name}` })) ?? []} onChange={(value) => changeFilter({ location_id: value })} />
        <div><label htmlFor="directory-as-of" className="mb-1.5 block text-[13px] font-medium text-muted-foreground">As of (UTC)</label><DatePicker id="directory-as-of" label="As of (UTC)" value={query.as_of} onChange={(value) => changeFilter({ as_of: value, employed_as_of: value ? query.employed_as_of : '' })} /></div>
      </SheetPanel><SheetFooter className="flex justify-between"><Button variant="ghost" onClick={clearCohortFilters} disabled={!cohortFilterCount}>Clear filters</Button><Button onClick={() => setFiltersOpen(false)}>Show results</Button></SheetFooter></SheetPopup></Sheet>

      {optionsError && <div className="mb-4 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning-foreground" role="alert">Filter options could not be loaded: {optionsError} <Button size="xs" variant="ghost" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div>}
      {exportError && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive-foreground" role="alert">{exportError}</div>}
      {loading ? <div aria-label="Loading employees" className="space-y-2"><Skeleton className="h-10 w-full" />{Array.from({ length: 8 }, (_, index) => <Skeleton className="h-14 w-full" key={index} />)}</div> : error ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center" role="alert"><WarningCircleIcon aria-hidden="true" className="mx-auto text-destructive" size={28} /><h2 className="mt-4 text-lg font-semibold">Couldn’t load employees</h2><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button className="mt-5" variant="outline" onClick={() => setRetry((value) => value + 1)}>Try again</Button></div>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-xl border bg-card"><Empty><EmptyHeader><EmptyMedia variant="icon"><UsersThreeIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>{pageOutOfRange ? 'This page is unavailable' : noEmployees ? 'No employees yet' : 'No employees match these filters'}</EmptyTitle><p className="mt-2 text-sm text-muted-foreground">{pageOutOfRange ? 'The directory has fewer pages now.' : noEmployees ? 'Add an employee after departments and locations are configured.' : 'Try a different search or clear the filters.'}</p></EmptyHeader><div className="flex gap-2">{pageOutOfRange ? <Button variant="outline" onClick={() => changeFilter({ page: 1 })}>Go to first page</Button> : noEmployees ? <Button onClick={() => setAddOpen(true)}>Add employee</Button> : <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}</div></Empty></div>
      ) : data ? <DirectoryResults employees={data.items} columns={columns} compact={compact} asOf={query.as_of} onOpen={onOpenEmployee} /> : null}

      {data && data.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>Rows per page</span><FilterSelect label="Rows" showLabel={false} stacked={false} emptyLabel="Rows" selectClassName="w-20" value={String(query.page_size)} values={[20, 50, 100].map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => changeFilter({ page_size: Number(value) })} /><span className="ml-2 tabular-nums">Page {data.page} of {totalPages}</span></div>
          <Pagination className="mx-0 w-auto"><PaginationContent>
            <PaginationItem><Button aria-label="Previous page" disabled={data.page <= 1} size="sm" variant="ghost" onClick={() => changeFilter({ page: data.page - 1 })}>Previous</Button></PaginationItem>
            {Array.from(new Set([1, data.page - 1, data.page, data.page + 1, totalPages].filter((page) => page >= 1 && page <= totalPages))).sort((a, b) => a - b).map((page) => <PaginationItem key={page}><Button aria-label={`Page ${page}`} aria-current={page === data.page ? 'page' : undefined} size="icon-sm" variant={page === data.page ? 'outline' : 'ghost'} onClick={() => changeFilter({ page })}>{page}</Button></PaginationItem>)}
            <PaginationItem><Button aria-label="Next page" disabled={data.page >= totalPages} size="sm" variant="ghost" onClick={() => changeFilter({ page: data.page + 1 })}>Next</Button></PaginationItem>
          </PaginationContent></Pagination>
        </div>
      )}
      <CreateEmployeeSheet open={addOpen} onOpenChange={setAddOpen} options={options} onCreated={(employee) => { setSearchInput(employee.employee_code); changeFilter({ search: employee.employee_code, status: '', country: '', department: '', role: '', package_state: '' }); setRetry((value) => value + 1) }} />
    </PageContainer>
  )
}
