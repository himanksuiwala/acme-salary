import { apiFetch, downloadFile, parseResponse, presentParams } from '@/lib/api'
export { ApiError } from '@/lib/api'

export type Currency = {
  code: string
  name: string
  symbol: string | null
  decimal_places: number
}

export type PackageState =
  | 'CURRENT'
  | 'SCHEDULED_CHANGE'
  | 'SCHEDULED'
  | 'PAST_ONLY'
  | 'NO_PACKAGE'

export type Employee = {
  employee_id: number
  employee_code: string
  first_name: string
  last_name: string
  email: string
  job_title: string | null
  employment_type: string | null
  status: string
  joining_date: string
  termination_date: string | null
  department: { code: string; name: string }
  location: { id: number; name: string; city: string | null }
  country: { code: string; name: string }
  current_compensation: {
    base_pay: number
    pay_frequency: string
    currency: Currency
  } | null
  package_state: PackageState
  next_effective_from: string | null
}

export type EmployeeSummary = Omit<Employee, 'current_compensation' | 'package_state' | 'next_effective_from'>
export type ProfileEmployee = EmployeeSummary & {
  manager: { employee_id: number; employee_code: string; first_name: string; last_name: string } | null
}

export type DirectoryResponse = {
  page: number
  page_size: number
  total: number
  items: Employee[]
}

export type DirectoryOptions = {
  countries: { code: string; name: string; default_currency_code: string }[]
  departments: { code: string; name: string }[]
  locations: { id: number; name: string; city: string | null; country_code: string; country_name: string }[]
  roles: string[]
  statuses: string[]
  package_states: PackageState[]
  currencies: Currency[]
  allowance_types: { code: string; name: string }[]
}

export type DirectoryQuery = {
  search: string
  country: string
  department: string
  role: string
  status: string
  package_state: string
  as_of: string
  location_id: string
  employed_as_of: string
  page: number
  page_size: number
}

export type CompensationPackage = {
  id: number
  base_pay: number
  variable_pay: number | null
  currency: Currency
  pay_frequency: string
  effective_from: string
  effective_to: string | null
  change_reason: string | null
  change_trigger: ChangeTrigger | null
  authorization_reference: string | null
  allowances: { type_code: string; type_name: string; amount: number; frequency: string }[]
}

export type EmployeeDetail = {
  employee: ProfileEmployee
  as_of: string
  current: CompensationPackage | null
  scheduled: CompensationPackage[]
  history: CompensationPackage[]
  activity: { id: number; action: string; created_at: string; actor: string | null; reason: string | null; change_trigger: ChangeTrigger | null; authorization_reference: string | null; effective_from: string | null }[]
}

export type ChangeTrigger = 'ANNUAL_MERIT' | 'PROMOTION' | 'MARKET' | 'RETENTION' | 'RELOCATION' | 'OTHER'

export type NewCompensation = {
  base_pay: number
  variable_pay: number | null
  currency_code: string
  pay_frequency: 'ANNUAL' | 'MONTHLY' | 'HOURLY'
  effective_from: string
  reason: string
  change_trigger?: ChangeTrigger | null
  authorization_reference?: string | null
  allowances: { type_code: string; amount: number; frequency: 'ANNUAL' | 'MONTHLY' | 'HOURLY' }[]
}

export type NewEmployee = {
  employee_code: string
  first_name: string
  last_name: string
  email: string
  department_code: string
  location_id: number
  job_title: string | null
  employment_type: string | null
  joining_date: string
  status: string
}

export type EmployeeEdit = Pick<EmployeeSummary, 'first_name' | 'last_name' | 'email' | 'job_title' | 'employment_type' | 'status' | 'termination_date'> & {
  department_code: string
  location_id: number
}

export function queryParams(query: DirectoryQuery, includePage = true): URLSearchParams {
  const params = presentParams(query, ['search', 'country', 'department', 'role', 'status', 'package_state', 'as_of', 'location_id', 'employed_as_of'])
  if (includePage) {
    params.set('page', String(query.page))
    params.set('page_size', String(query.page_size))
  }
  return params
}

export async function getEmployees(query: DirectoryQuery, signal?: AbortSignal): Promise<DirectoryResponse> {
  return parseResponse<DirectoryResponse>(await apiFetch(`/api/employees?${queryParams(query)}`, { signal }))
}

export async function getDirectoryOptions(signal?: AbortSignal): Promise<DirectoryOptions> {
  return parseResponse<DirectoryOptions>(await apiFetch('/api/employees/directory-options', { signal }))
}

export async function getEmployeeDetail(employeeId: number, asOf?: string, signal?: AbortSignal): Promise<EmployeeDetail> {
  const params = asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''
  return parseResponse<EmployeeDetail>(await apiFetch(`/api/employees/${employeeId}/compensation${params}`, { signal }))
}

export async function createCompensation(employeeId: number, packageInput: NewCompensation): Promise<CompensationPackage> {
  const result = await parseResponse<{ compensation: CompensationPackage }>(await apiFetch(`/api/employees/${employeeId}/compensation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packageInput),
  }))
  return result.compensation
}

export async function downloadEmployeeCompensation(employeeId: number, asOf: string): Promise<void> {
  await downloadFile(`/api/employees/${employeeId}/compensation/export?as_of=${encodeURIComponent(asOf)}`, `employee-${employeeId}-compensation.csv`)
}

export async function createEmployee(employee: NewEmployee): Promise<EmployeeSummary> {
  const result = await parseResponse<{ employee: EmployeeSummary }>(await apiFetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee),
  }))
  return result.employee
}

export async function updateEmployee(employeeId: number, changes: EmployeeEdit): Promise<EmployeeSummary> {
  const result = await parseResponse<{ employee: EmployeeSummary }>(await apiFetch(`/api/employees/${employeeId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
  }))
  return result.employee
}

export async function downloadDirectory(query: DirectoryQuery): Promise<void> {
  await downloadFile(`/api/employees/export?${queryParams(query, false)}`, 'employee-directory.csv')
}
