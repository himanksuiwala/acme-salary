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
  status: string
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

export type DirectoryResponse = {
  page: number
  page_size: number
  total: number
  items: Employee[]
}

export type DirectoryOptions = {
  countries: { code: string; name: string }[]
  departments: { code: string; name: string }[]
  locations: { id: number; name: string; city: string | null; country_code: string; country_name: string }[]
  roles: string[]
  statuses: string[]
  package_states: PackageState[]
}

export type DirectoryQuery = {
  search: string
  country: string
  department: string
  role: string
  status: string
  package_state: string
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
  allowances: { type_code: string; type_name: string; amount: number; frequency: string }[]
}

export type EmployeeDetail = {
  employee: EmployeeSummary
  current: CompensationPackage | null
  scheduled: CompensationPackage[]
  history: CompensationPackage[]
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

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T
  let detail = `Request failed (${response.status})`
  try {
    const body = (await response.json()) as { detail?: string | { msg?: string }[] }
    if (typeof body.detail === 'string') detail = body.detail
    else if (Array.isArray(body.detail)) detail = body.detail.map((item) => item.msg).filter(Boolean).join('; ')
  } catch {
    // A non-JSON server error still has the HTTP status above.
  }
  throw new Error(detail)
}

export function queryParams(query: DirectoryQuery, includePage = true): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of ['search', 'country', 'department', 'role', 'status', 'package_state'] as const) {
    if (query[key]) params.set(key, query[key])
  }
  if (includePage) {
    params.set('page', String(query.page))
    params.set('page_size', String(query.page_size))
  }
  return params
}

export async function getEmployees(query: DirectoryQuery, signal?: AbortSignal): Promise<DirectoryResponse> {
  return parseResponse<DirectoryResponse>(await fetch(`/api/employees?${queryParams(query)}`, { signal }))
}

export async function getDirectoryOptions(signal?: AbortSignal): Promise<DirectoryOptions> {
  return parseResponse<DirectoryOptions>(await fetch('/api/employees/directory-options', { signal }))
}

export async function getEmployeeDetail(employeeId: number, signal?: AbortSignal): Promise<EmployeeDetail> {
  return parseResponse<EmployeeDetail>(await fetch(`/api/employees/${employeeId}/compensation`, { signal }))
}

export async function createEmployee(employee: NewEmployee): Promise<EmployeeSummary> {
  const result = await parseResponse<{ employee: EmployeeSummary }>(await fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee),
  }))
  return result.employee
}

export async function downloadDirectory(query: DirectoryQuery): Promise<void> {
  const response = await fetch(`/api/employees/export?${queryParams(query, false)}`)
  if (!response.ok) {
    await parseResponse<never>(response)
    return
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = 'employee-directory.csv'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
