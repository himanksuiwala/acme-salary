import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArchiveIcon, BuildingsIcon, CaretLeftIcon, CaretRightIcon, ChartBarIcon, ClockCounterClockwiseIcon, CurrencyDollarIcon, ListIcon, SignOutIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { EmployeeDirectory } from '@/features/employees/EmployeeDirectory'
import { EmployeeProfile } from '@/features/employees/EmployeeProfile'
import { CompensationForm } from '@/features/employees/CompensationForm'
import { AuditTrail } from '@/components/product/AuditTrail'
import type { AnalyticsQuery, Group } from '@/features/analytics/api'
import { auditFilterKeys, defaultAuditQuery } from '@/features/audit/api'
import type { AuditQuery } from '@/features/audit/api'
import type { DirectoryQuery } from '@/features/employees/api'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { getCurrentUser, type AuthenticatedUser } from '@/features/auth/api'
import { accessToken, rememberAccessToken } from '@/lib/api'
import { roleLabel } from '@/features/employees/format'
import { AdministrationScreen, type AdminSection } from '@/features/admin/AdministrationScreen'

const AnalyticsScreen = lazy(() => import('@/features/analytics/AnalyticsScreen').then((module) => ({ default: module.AnalyticsScreen })))

type LocationState = { query: DirectoryQuery; employeeId: number | null; compensationForm: boolean; audit: boolean; auditQuery: AuditQuery; analytics: boolean; analyticsQuery: AnalyticsQuery; administration: boolean; adminSection: AdminSection }

const analyticsKeys = ['as_of', 'country', 'department', 'role', 'status', 'location_id', 'period_from', 'period_to'] as const
function todayUtc() { return new Date().toISOString().slice(0, 10) }
function sectionsLabel(section: AdminSection) {
  return section === 'allowances' ? 'Compensation setup' : section === 'currencies' ? 'Currencies & FX' : 'Organization'
}

function readLocation(): LocationState {
  const params = new URLSearchParams(window.location.search)
  const page = Number(params.get('page'))
  const pageSize = Number(params.get('page_size'))
  const employeeId = Number(params.get('employee'))
  const auditQuery = { ...defaultAuditQuery }
  for (const key of auditFilterKeys) auditQuery[key] = params.get(`audit_${key}`) ?? ''
  const auditPage = Number(params.get('audit_page'))
  const auditPageSize = Number(params.get('audit_page_size'))
  auditQuery.page = Number.isInteger(auditPage) && auditPage > 0 ? auditPage : 1
  auditQuery.page_size = [20,50,100].includes(auditPageSize) ? auditPageSize : 20
  const analyticsDate = params.get('analytics_as_of') || todayUtc()
  const analyticsQuery: AnalyticsQuery = {
    as_of: analyticsDate, country: params.get('analytics_country') ?? '',
    department: params.get('analytics_department') ?? '', role: params.get('analytics_role') ?? '',
    status: params.get('analytics_status') ?? '', location_id: params.get('analytics_location_id') ?? '',
    period_from: params.get('analytics_period_from') || `${analyticsDate.slice(0, 7)}-01`,
    period_to: params.get('analytics_period_to') || analyticsDate,
  }
  const requestedAdminSection = params.get('admin_section')
  const adminSection: AdminSection = requestedAdminSection === 'allowances' || requestedAdminSection === 'currencies' ? requestedAdminSection : 'organization'
  return {
    audit: params.get('view') === 'audit',
    analytics: params.get('view') === 'analytics', analyticsQuery,
    administration: params.get('view') === 'administration', adminSection,
    auditQuery,
    query: {
      search: params.get('search') ?? '',
      country: params.get('country') ?? '',
      department: params.get('department') ?? '',
      role: params.get('role') ?? '',
      status: params.get('status') === 'all' ? '' : (params.get('status') ?? 'ACTIVE'),
      package_state: params.get('package_state') ?? '',
      as_of: params.get('as_of') ?? '',
      location_id: params.get('location_id') ?? '',
      employed_as_of: params.get('employed_as_of') ?? '',
      page: Number.isInteger(page) && page > 0 ? page : 1,
      page_size: [20, 50, 100].includes(pageSize) ? pageSize : 20,
    },
    employeeId: Number.isInteger(employeeId) && employeeId > 0 ? employeeId : null,
    compensationForm: Number.isInteger(employeeId) && employeeId > 0 && params.get('view') === 'new-package',
  }
}

function writeLocation(state: LocationState, replace = false) {
  const params = new URLSearchParams()
  const { query, employeeId, compensationForm, audit, auditQuery, analytics, analyticsQuery, administration, adminSection } = state
  for (const key of ['search', 'country', 'department', 'role', 'package_state', 'as_of', 'location_id', 'employed_as_of'] as const) {
    if (query[key]) params.set(key, query[key])
  }
  if (query.status !== 'ACTIVE') params.set('status', query.status || 'all')
  if (query.page > 1) params.set('page', String(query.page))
  if (query.page_size !== 20) params.set('page_size', String(query.page_size))
  if (employeeId) params.set('employee', String(employeeId))
  if (employeeId && compensationForm) params.set('view', 'new-package')
  if (audit) params.set('view', 'audit')
  if (analytics) params.set('view', 'analytics')
  if (administration) { params.set('view', 'administration'); params.set('admin_section', adminSection) }
  for (const key of auditFilterKeys) if (auditQuery[key]) params.set(`audit_${key}`, auditQuery[key])
  if (auditQuery.page > 1) params.set('audit_page', String(auditQuery.page))
  if (auditQuery.page_size !== 20) params.set('audit_page_size', String(auditQuery.page_size))
  if (analytics) for (const key of analyticsKeys) if (analyticsQuery[key]) params.set(`analytics_${key}`, analyticsQuery[key])
  const url = `${window.location.pathname}${params.size ? `?${params}` : ''}`
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
}

function Brand({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className={`flex items-center py-5 ${collapsed ? 'flex-col justify-center gap-2 px-2' : 'gap-3 px-5'}`}>
      <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white">A</div>
      <div className={collapsed ? 'sr-only' : 'min-w-0 flex-1 leading-tight'}>
        <p className="text-sm font-semibold tracking-tight">ACME</p>
        <p className="text-[11px] text-muted-foreground">Salary management</p>
      </div>
      {onToggle && <Button type="button" size="icon-sm" variant="ghost" className="shrink-0" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>
        {collapsed ? <CaretRightIcon aria-hidden="true" size={17} /> : <CaretLeftIcon aria-hidden="true" size={17} />}
      </Button>}
    </div>
  )
}

function UserCard({ user, onLogout, collapsed = false }: { user: AuthenticatedUser; onLogout: () => void; collapsed?: boolean }) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
  const initials = [user.first_name, user.last_name].filter(Boolean).map((part) => part![0]).join('').toUpperCase() || name.slice(0, 2).toUpperCase()
  if (collapsed) return <div className="mx-2 mb-3 flex flex-col items-center gap-2 border-t pt-3">
    <div aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white" title={name}>{initials}</div>
    <Button type="button" size="icon-sm" variant="ghost" onClick={onLogout} aria-label="Log out" title="Log out"><SignOutIcon aria-hidden="true" size={17} /></Button>
  </div>
  return <div className="mx-3 mb-3 rounded-xl border bg-neutral-50 p-3">
    <div className="flex min-w-0 items-start gap-2.5">
      <div aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{initials}</div>
      <div className="min-w-0"><p className="truncate text-sm font-semibold" title={name}>{name}</p><p className="truncate text-xs text-muted-foreground" title={user.email}>{user.email}</p><p className="mt-1 text-[11px] font-medium text-muted-foreground">{roleLabel(user.role)}</p></div>
    </div>
    <button type="button" onClick={onLogout} className="mt-3 flex w-full items-center gap-2 rounded-md border-t pt-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><SignOutIcon aria-hidden="true" size={15} />Log out</button>
  </div>
}

function NavContents({ onEmployees, onAnalytics, onAudit, onAdministration, audit, analytics, administration, adminSection, user, onLogout, collapsed = false, onToggle }: { onEmployees: () => void; onAnalytics: () => void; onAudit: () => void; onAdministration: (section: AdminSection) => void; audit: boolean; analytics: boolean; administration: boolean; adminSection: AdminSection; user: AuthenticatedUser; onLogout: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const navClass = (selected: boolean) => `flex w-full items-center rounded-lg py-2.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${collapsed ? 'justify-center px-2' : 'gap-3 px-3 text-left'} ${selected ? 'bg-neutral-100 text-foreground' : 'text-muted-foreground'}`
  return (
    <>
      <Brand collapsed={collapsed} onToggle={onToggle} />
      <nav aria-label="Main navigation" className={`flex-1 pt-5 ${collapsed ? 'px-2' : 'px-3'}`}>
        <p className={collapsed ? 'sr-only' : 'px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'}>Workspace</p>
        <button type="button" title={collapsed ? 'Employees' : undefined} aria-current={!audit && !analytics && !administration ? 'page' : undefined} onClick={onEmployees} className={navClass(!audit && !analytics && !administration)}>
          <UsersThreeIcon size={19} weight="fill" aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Employees</span>
        </button>
        <button type="button" title={collapsed ? 'Analytics' : undefined} aria-current={analytics ? 'page' : undefined} onClick={onAnalytics} className={navClass(analytics)}>
          <ChartBarIcon size={19} weight={analytics ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Analytics</span>
        </button>
        <p className={collapsed ? 'sr-only' : 'px-3 pb-2 pt-7 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'}>Administration</p>
        <button type="button" title={collapsed ? 'Audit log' : undefined} aria-current={audit ? 'page' : undefined} onClick={onAudit} className={`${navClass(audit)} ${collapsed ? 'mt-7' : ''}`}>
          <ClockCounterClockwiseIcon size={19} weight={audit ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Audit log</span>
        </button>
        <button type="button" title={collapsed ? 'Organization' : undefined} aria-current={administration && adminSection === 'organization' ? 'page' : undefined} onClick={() => onAdministration('organization')} className={navClass(administration && adminSection === 'organization')}>
          <BuildingsIcon size={19} weight={administration && adminSection === 'organization' ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Organization</span>
        </button>
        <button type="button" title={collapsed ? 'Compensation setup' : undefined} aria-current={administration && adminSection === 'allowances' ? 'page' : undefined} onClick={() => onAdministration('allowances')} className={navClass(administration && adminSection === 'allowances')}>
          <ArchiveIcon size={19} weight={administration && adminSection === 'allowances' ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Compensation setup</span>
        </button>
        <button type="button" title={collapsed ? 'Currencies & FX' : undefined} aria-current={administration && adminSection === 'currencies' ? 'page' : undefined} onClick={() => onAdministration('currencies')} className={navClass(administration && adminSection === 'currencies')}>
          <CurrencyDollarIcon size={19} weight={administration && adminSection === 'currencies' ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Currencies & FX</span>
        </button>
      </nav>
      <UserCard user={user} onLogout={onLogout} collapsed={collapsed} />
    </>
  )
}

function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [restoringUser, setRestoringUser] = useState(true)
  const [location, setLocation] = useState<LocationState>(readLocation)
  const locationRef = useRef(location)
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('sidebar-collapsed') === 'true')
  const navTrigger = useRef<HTMLButtonElement>(null)
  const [savedPackageId, setSavedPackageId] = useState<number | null>(null)
  const [formDirty, setFormDirty] = useState(false)

  useEffect(() => {
    if (accessToken() === null) { setRestoringUser(false); return }
    getCurrentUser().then(setUser).catch(() => rememberAccessToken(null)).finally(() => setRestoringUser(false))
  }, [])

  useEffect(() => {
    const expired = () => { setUser(null); setNavOpen(false); setRestoringUser(false) }
    window.addEventListener('auth:expired', expired)
    return () => window.removeEventListener('auth:expired', expired)
  }, [])

  function onLogin(selected: AuthenticatedUser) {
    setUser(selected)
  }

  function onLogout() {
    rememberAccessToken(null)
    setUser(null)
    setNavOpen(false)
  }

  function toggleSidebar() {
    setSidebarCollapsed((previous) => {
      window.localStorage.setItem('sidebar-collapsed', String(!previous))
      return !previous
    })
  }

  useEffect(() => { locationRef.current = location }, [location])
  const canLeaveForm = useCallback(() => !locationRef.current.compensationForm || !formDirty || window.confirm('Discard your unsaved compensation changes?'), [formDirty])
  useEffect(() => {
    const onPopState = () => {
      if (!canLeaveForm()) { writeLocation(locationRef.current); return }
      const next = readLocation()
      locationRef.current = next
      setLocation(next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [canLeaveForm])

  const updateQuery = useCallback((patch: Partial<DirectoryQuery>) => {
    const previous = locationRef.current
    const filterChanged = Object.keys(patch).some((key) => key !== 'page' && previous.query[key as keyof DirectoryQuery] !== patch[key as keyof DirectoryQuery])
    const next: LocationState = {
      ...previous, audit: false, analytics: false, administration: false,
      query: { ...previous.query, ...patch, page: patch.page ?? (filterChanged ? 1 : previous.query.page) },
      employeeId: null,
      compensationForm: false,
    }
    locationRef.current = next
    setLocation(next)
    writeLocation(next)
  }, [])

  const openEmployee = useCallback((employeeId: number) => {
    if (!canLeaveForm()) return
    setSavedPackageId(null)
    const next = { ...locationRef.current, employeeId, compensationForm: false, audit: false, analytics: false, administration: false }
    locationRef.current = next
    setLocation(next)
    writeLocation(next)
    window.scrollTo(0, 0)
  }, [canLeaveForm])

  const openDirectory = useCallback(() => {
    if (!canLeaveForm()) return
    setNavOpen(false)
    setSavedPackageId(null)
    if (locationRef.current.employeeId === null && !locationRef.current.audit && !locationRef.current.analytics && !locationRef.current.administration) return
    const next = { ...locationRef.current, employeeId: null, compensationForm: false, audit: false, analytics: false, administration: false }
    locationRef.current = next
    setLocation(next)
    writeLocation(next)
    window.scrollTo(0, 0)
  }, [canLeaveForm])

  const openAudit = useCallback(() => {
    if (!canLeaveForm()) return
    setNavOpen(false)
    const previous = locationRef.current
    const next = { ...previous, employeeId: null, compensationForm: false, audit: true, analytics: false, administration: false,
      auditQuery: { ...previous.auditQuery, employee_id: '', page: 1 } }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [canLeaveForm])

  const openEmployeeAudit = useCallback((employeeId: number) => {
    setNavOpen(false)
    const next = { ...locationRef.current, employeeId: null, compensationForm: false, audit: true, analytics: false, administration: false,
      auditQuery: { ...defaultAuditQuery, employee_id: String(employeeId) } }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [])

  const updateAuditQuery = useCallback((patch: Partial<AuditQuery>) => {
    const previous = locationRef.current
    const next = { ...previous, auditQuery: { ...previous.auditQuery, ...patch, page: patch.page ?? 1 } }
    locationRef.current = next; setLocation(next); writeLocation(next)
  }, [])

  const openAnalytics = useCallback(() => {
    if (!canLeaveForm()) return
    setNavOpen(false)
    const next = { ...locationRef.current, employeeId: null, compensationForm: false, audit: false, analytics: true, administration: false }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [canLeaveForm])

  const updateAnalyticsQuery = useCallback((patch: Partial<AnalyticsQuery>) => {
    const previous = locationRef.current
    const next = { ...previous, analyticsQuery: { ...previous.analyticsQuery, ...patch } }
    locationRef.current = next; setLocation(next); writeLocation(next)
  }, [])

  const analyticsDrilldown = useCallback((kind?: 'country' | 'department' | 'role', group?: Group) => {
    const previous = locationRef.current
    const selection = previous.analyticsQuery
    const query: DirectoryQuery = {
      search: '', country: selection.country, department: selection.department,
      role: selection.role, status: selection.status, package_state: '',
      location_id: selection.location_id, as_of: selection.as_of, employed_as_of: 'true',
      page: 1, page_size: 20,
    }
    if (kind && group) query[kind] = group.key
    const next = { ...previous, query, analytics: false, audit: false, administration: false, employeeId: null, compensationForm: false }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [])

  const openAdministration = useCallback((section: AdminSection = 'organization') => {
    if (!canLeaveForm()) return
    setNavOpen(false)
    const next = { ...locationRef.current, employeeId: null, compensationForm: false, audit: false, analytics: false, administration: true, adminSection: section }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [canLeaveForm])

  const openCompensationForm = useCallback(() => {
    setSavedPackageId(null)
    const next = { ...locationRef.current, compensationForm: true }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [])

  const closeCompensationForm = useCallback(() => {
    setFormDirty(false)
    const next = { ...locationRef.current, compensationForm: false }
    locationRef.current = next; setLocation(next); writeLocation(next); window.scrollTo(0, 0)
  }, [])

  const completeCompensationForm = useCallback((packageId: number) => {
    setSavedPackageId(packageId)
    closeCompensationForm()
  }, [closeCompensationForm])

  const openProfileFromBreadcrumb = () => {
    if (canLeaveForm()) closeCompensationForm()
  }

  if (restoringUser) return <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground" role="status">Loading workspace…</div>
  if (!user) return <LoginScreen onLogin={onLogin} />

  return (
    <div className="min-h-svh bg-neutral-50 text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-white transition-[width] duration-200 lg:flex ${sidebarCollapsed ? 'w-[76px]' : 'w-[232px]'}`}><NavContents onEmployees={openDirectory} onAnalytics={openAnalytics} onAudit={openAudit} onAdministration={openAdministration} audit={location.audit} analytics={location.analytics} administration={location.administration} adminSection={location.adminSection} user={user} onLogout={onLogout} collapsed={sidebarCollapsed} onToggle={toggleSidebar} /></aside>
      <div className={`transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[232px]'}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button ref={navTrigger} className="lg:hidden" aria-label="Open navigation" size="icon-sm" variant="ghost" onClick={() => setNavOpen(true)}><ListIcon aria-hidden="true" size={20} /></Button>
            <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
              <ol className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                <li><button type="button" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={openDirectory}>Workspace</button></li>
                <li aria-hidden="true"><CaretRightIcon size={14} className="text-muted-foreground" /></li>
                {location.audit || location.analytics || location.administration ? <li className="truncate font-medium" aria-current="page">{location.audit ? 'Audit log' : location.analytics ? 'Analytics' : sectionsLabel(location.adminSection)}</li> : <>
                  <li>{location.employeeId ? <button type="button" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={openDirectory}>Employees</button> : <span aria-current="page" className="font-medium">Employees</span>}</li>
                  {location.employeeId && <><li aria-hidden="true"><CaretRightIcon size={14} className="text-muted-foreground" /></li><li>{location.compensationForm ? <button type="button" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={openProfileFromBreadcrumb}>Employee profile</button> : <span aria-current="page" className="font-medium">Employee profile</span>}</li></>}
                  {location.compensationForm && <><li aria-hidden="true"><CaretRightIcon size={14} className="text-muted-foreground" /></li><li className="truncate font-medium" aria-current="page">New package</li></>}
                </>}
              </ol>
            </nav>
          </div>
        </header>
        <main>
          {location.audit ? <AuditTrail query={location.auditQuery} onQueryChange={updateAuditQuery} onOpenEmployee={openEmployee} /> : location.analytics ? <Suspense fallback={<p className="px-4 py-8 text-sm text-muted-foreground" role="status">Loading analytics…</p>}><AnalyticsScreen query={location.analyticsQuery} onQueryChange={updateAnalyticsQuery} onViewEmployees={analyticsDrilldown} /></Suspense> : location.administration ? <AdministrationScreen section={location.adminSection} /> : location.employeeId ? location.compensationForm
            ? <CompensationForm key={location.employeeId} employeeId={location.employeeId} onCancel={closeCompensationForm} onSaved={completeCompensationForm} onDirtyChange={setFormDirty} />
            : <EmployeeProfile key={location.employeeId} employeeId={location.employeeId} savedPackageId={savedPackageId} onRecordCompensation={openCompensationForm} onFullAuditLog={openEmployeeAudit} onBack={openDirectory} onOpenEmployee={openEmployee} />
            : <EmployeeDirectory query={location.query} updateQuery={updateQuery} onOpenEmployee={openEmployee} />}
        </main>
      </div>
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetPopup finalFocus={navTrigger} side="left" aria-label="Navigation" className="max-w-[280px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex min-h-full flex-col"><NavContents onEmployees={openDirectory} onAnalytics={openAnalytics} onAudit={openAudit} onAdministration={openAdministration} audit={location.audit} analytics={location.analytics} administration={location.administration} adminSection={location.adminSection} user={user} onLogout={onLogout} /></div>
        </SheetPopup>
      </Sheet>
    </div>
  )
}

export default App
