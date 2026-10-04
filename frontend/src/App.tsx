import { useCallback, useEffect, useRef, useState } from 'react'
import { ListIcon, UsersThreeIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { EmployeeDirectory } from '@/features/employees/EmployeeDirectory'
import { EmployeeProfile } from '@/features/employees/EmployeeProfile'
import { CompensationForm } from '@/features/employees/CompensationForm'
import type { DirectoryQuery } from '@/features/employees/api'

type LocationState = { query: DirectoryQuery; employeeId: number | null; compensationForm: boolean }

function readLocation(): LocationState {
  const params = new URLSearchParams(window.location.search)
  const page = Number(params.get('page'))
  const pageSize = Number(params.get('page_size'))
  const employeeId = Number(params.get('employee'))
  return {
    query: {
      search: params.get('search') ?? '',
      country: params.get('country') ?? '',
      department: params.get('department') ?? '',
      role: params.get('role') ?? '',
      status: params.get('status') === 'all' ? '' : (params.get('status') ?? 'ACTIVE'),
      package_state: params.get('package_state') ?? '',
      page: Number.isInteger(page) && page > 0 ? page : 1,
      page_size: [20, 50, 100].includes(pageSize) ? pageSize : 20,
    },
    employeeId: Number.isInteger(employeeId) && employeeId > 0 ? employeeId : null,
    compensationForm: Number.isInteger(employeeId) && employeeId > 0 && params.get('view') === 'new-package',
  }
}

function writeLocation(state: LocationState, replace = false) {
  const params = new URLSearchParams()
  const { query, employeeId, compensationForm } = state
  for (const key of ['search', 'country', 'department', 'role', 'package_state'] as const) {
    if (query[key]) params.set(key, query[key])
  }
  if (query.status !== 'ACTIVE') params.set('status', query.status || 'all')
  if (query.page > 1) params.set('page', String(query.page))
  if (query.page_size !== 20) params.set('page_size', String(query.page_size))
  if (employeeId) params.set('employee', String(employeeId))
  if (employeeId && compensationForm) params.set('view', 'new-package')
  const url = `${window.location.pathname}${params.size ? `?${params}` : ''}`
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white">A</div>
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-semibold tracking-tight">ACME</p>
        <p className="text-[11px] text-muted-foreground">Salary management</p>
      </div>
    </div>
  )
}

function NavContents({ onEmployees }: { onEmployees: () => void }) {
  return (
    <>
      <Brand />
      <nav aria-label="Main navigation" className="px-3 pt-5">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Workspace</p>
        <button type="button" aria-current="page" onClick={onEmployees} className="flex w-full items-center gap-3 rounded-lg bg-neutral-100 px-3 py-2.5 text-left text-sm font-medium text-neutral-950 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <UsersThreeIcon size={19} weight="fill" aria-hidden="true" />Employees
        </button>
      </nav>
      <div className="mt-auto border-t px-5 py-5">
        <p className="text-xs font-medium">Local development</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">This workspace has no sign in or access controls.</p>
      </div>
    </>
  )
}

function App() {
  const [location, setLocation] = useState<LocationState>(readLocation)
  const locationRef = useRef(location)
  const [navOpen, setNavOpen] = useState(false)
  const [savedPackageId, setSavedPackageId] = useState<number | null>(null)

  useEffect(() => { locationRef.current = location }, [location])
  useEffect(() => {
    const onPopState = () => {
      const next = readLocation()
      locationRef.current = next
      setLocation(next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const updateQuery = useCallback((patch: Partial<DirectoryQuery>) => {
    const previous = locationRef.current
    const filterChanged = Object.keys(patch).some((key) => key !== 'page' && previous.query[key as keyof DirectoryQuery] !== patch[key as keyof DirectoryQuery])
    const next: LocationState = {
      query: { ...previous.query, ...patch, page: patch.page ?? (filterChanged ? 1 : previous.query.page) },
      employeeId: null,
      compensationForm: false,
    }
    locationRef.current = next
    setLocation(next)
    writeLocation(next)
  }, [])

  const openEmployee = useCallback((employeeId: number) => {
    setSavedPackageId(null)
    const next = { ...locationRef.current, employeeId, compensationForm: false }
    locationRef.current = next
    setLocation(next)
    writeLocation(next)
    window.scrollTo(0, 0)
  }, [])

  const openDirectory = useCallback(() => {
    setNavOpen(false)
    setSavedPackageId(null)
    if (locationRef.current.employeeId === null) return
    const next = { ...locationRef.current, employeeId: null, compensationForm: false }
    locationRef.current = next
    setLocation(next)
    writeLocation(next)
  }, [])

  const openCompensationForm = useCallback(() => {
    setSavedPackageId(null)
    const next = { ...locationRef.current, compensationForm: true }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [])

  const closeCompensationForm = useCallback(() => {
    const next = { ...locationRef.current, compensationForm: false }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [])

  const completeCompensationForm = useCallback((packageId: number) => {
    setSavedPackageId(packageId)
    closeCompensationForm()
  }, [closeCompensationForm])

  return (
    <div className="min-h-svh bg-neutral-50 text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r bg-white lg:flex"><NavContents onEmployees={openDirectory} /></aside>
      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button className="lg:hidden" aria-label="Open navigation" size="icon-sm" variant="ghost" onClick={() => setNavOpen(true)}><ListIcon aria-hidden="true" size={20} /></Button>
            <span className="truncate text-sm text-muted-foreground">Workspace <span className="mx-2 text-neutral-300">/</span> <span className="font-medium text-foreground">{location.compensationForm ? 'New compensation package' : location.employeeId ? 'Employee profile' : 'Employees'}</span></span>
          </div>
          <Badge variant="outline" className="shrink-0">Local development</Badge>
        </header>
        <div role="note" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-5 text-amber-900 sm:px-6 lg:px-8">
          <WarningCircleIcon aria-hidden="true" className="mt-0.5 shrink-0" size={15} />Employee and salary data are visible in this local development build. Access controls are required before deployment.
        </div>
        <main>
          {location.employeeId ? location.compensationForm
            ? <CompensationForm key={location.employeeId} employeeId={location.employeeId} onCancel={closeCompensationForm} onSaved={completeCompensationForm} />
            : <EmployeeProfile key={location.employeeId} employeeId={location.employeeId} savedPackageId={savedPackageId} onBack={openDirectory} onRecordCompensation={openCompensationForm} />
            : <EmployeeDirectory query={location.query} updateQuery={updateQuery} onOpenEmployee={openEmployee} />}
        </main>
      </div>
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetPopup side="left" aria-label="Navigation" className="max-w-[280px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex min-h-full flex-col"><NavContents onEmployees={openDirectory} /></div>
        </SheetPopup>
      </Sheet>
    </div>
  )
}

export default App
