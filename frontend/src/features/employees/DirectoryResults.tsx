import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Employee } from './api'
import { formatDate, formatMoney, statusLabel } from './format'
import { PackageBadge } from './PackageBadge'

export type DirectoryColumn = 'role' | 'location' | 'status' | 'pay' | 'package'

function EmployeeName({ employee, onOpen }: { employee: Employee; onOpen?: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700" aria-hidden="true">
        {employee.first_name[0]}{employee.last_name[0]}
      </span>
      <div className="min-w-0">
        {onOpen ? (
          <button className="block max-w-full truncate text-left font-medium text-foreground underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring" onClick={(event) => { event.stopPropagation(); onOpen() }} type="button">
            {employee.first_name} {employee.last_name}
          </button>
        ) : (
          <span className="block max-w-full truncate font-medium text-foreground">{employee.first_name} {employee.last_name}</span>
        )}
        <p className="truncate text-xs text-muted-foreground" title={employee.email}>{employee.email}</p>
      </div>
    </div>
  )
}

export function DirectoryResults({
  employees,
  columns,
  compact,
  asOf,
  onOpen,
}: {
  employees: Employee[]
  columns: Record<DirectoryColumn, boolean>
  compact: boolean
  asOf: string
  onOpen: (id: number) => void
}) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {employees.map((employee) => (
          <div role="button" tabIndex={0} className="block w-full cursor-pointer rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" key={employee.employee_id} onClick={() => onOpen(employee.employee_id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(employee.employee_id) } }} aria-label={`Open ${employee.first_name} ${employee.last_name}'s profile`}>
            <div className="flex items-start justify-between gap-3">
              <EmployeeName employee={employee} />
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
              {columns.pay && <TableHead className="text-right">{asOf ? 'Base pay as of date' : 'Current base pay'}</TableHead>}
              {columns.package && <TableHead>Package state</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow className={`${compact ? 'h-10' : 'h-14'} cursor-pointer focus-within:bg-muted/40`} key={employee.employee_id} onClick={() => onOpen(employee.employee_id)} title={`Open ${employee.first_name} ${employee.last_name}'s profile`}>
                <TableCell className="pl-5 text-xs font-medium text-muted-foreground tabular-nums">{employee.employee_code}</TableCell>
                <TableCell className="sticky left-0 z-10 bg-card"><EmployeeName employee={employee} onOpen={() => onOpen(employee.employee_id)} /></TableCell>
                {columns.role && <TableCell><span className="block max-w-48 truncate" title={employee.job_title || undefined}>{employee.job_title || 'Not specified'}</span><span className="mt-1 block max-w-48 truncate text-xs text-muted-foreground" title={employee.department.name}>{employee.department.name}</span></TableCell>}
                {columns.location && <TableCell><span className="block max-w-40 truncate" title={`${employee.location.name}, ${employee.country.name}`}>{employee.location.name}, {employee.country.name}</span></TableCell>}
                {columns.status && <TableCell><Badge variant={employee.status === 'ACTIVE' ? 'success' : 'secondary'}>{statusLabel(employee.status)}</Badge></TableCell>}
                {columns.pay && <TableCell className="text-right tabular-nums">{employee.current_compensation ? <span className="font-medium">{formatMoney(employee.current_compensation.base_pay, employee.current_compensation.currency, employee.current_compensation.pay_frequency)}</span> : <span className="text-muted-foreground">Not specified</span>}</TableCell>}
                {columns.package && <TableCell><PackageBadge state={employee.package_state} />{employee.next_effective_from && <span className="mt-1 block text-xs text-muted-foreground">From {formatDate(employee.next_effective_from)}</span>}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
