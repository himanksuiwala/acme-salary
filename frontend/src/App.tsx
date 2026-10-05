import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { WorkspaceShell } from '@/components/product/WorkspaceShell'
import { EmployeeDirectory } from '@/features/employees/EmployeeDirectory'
import { EmployeeProfile } from '@/features/employees/EmployeeProfile'
import { CompensationForm } from '@/features/employees/CompensationForm'
import { AuditTrail } from '@/components/product/AuditTrail'
import type { AnalyticsQuery, Group } from '@/features/analytics/api'
import { defaultAuditQuery } from '@/features/audit/api'
import type { AuditQuery } from '@/features/audit/api'
import type { DirectoryQuery } from '@/features/employees/api'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { getCurrentUser, type AuthenticatedUser } from '@/features/auth/api'
import { accessToken, rememberAccessToken } from '@/lib/api'
import { AdministrationScreen, type AdminSection } from '@/features/admin/AdministrationScreen'

const AnalyticsScreen = lazy(() => import('@/features/analytics/AnalyticsScreen').then((module) => ({ default: module.AnalyticsScreen })))

type LocationState = { query: DirectoryQuery; employeeId: number | null; compensationForm: boolean; audit: boolean; auditQuery: AuditQuery; analytics: boolean; analyticsQuery: AnalyticsQuery; administration: boolean; adminSection: AdminSection }

function todayUtc() { return new Date().toISOString().slice(0, 10) }

function defaultDirectoryQuery(): DirectoryQuery {
  return {
    search: '',
    country: '',
    department: '',
    role: '',
    status: 'ACTIVE',
    package_state: '',
    as_of: '',
    location_id: '',
    employed_as_of: '',
    page: 1,
    page_size: 20,
  }
}

function defaultAnalyticsQuery(): AnalyticsQuery {
  const analyticsDate = todayUtc()
  return {
    as_of: analyticsDate,
    country: '',
    department: '',
    role: '',
    status: '',
    location_id: '',
    period_from: `${analyticsDate.slice(0, 7)}-01`,
    period_to: analyticsDate,
  }
}

function cleanAdminSection(value: string | undefined): AdminSection {
  return value === 'allowances' || value === 'currencies' ? value : 'organization'
}

function readLocation(pathname = window.location.pathname): LocationState {
  const segments = pathname.split('/').filter(Boolean)
  const employeeId = segments[0] === 'employees' && segments[1] === 'detail' ? Number(segments[2]) : NaN
  const validEmployeeId = Number.isInteger(employeeId) && employeeId > 0
  const compensationForm = validEmployeeId && segments[3] === 'compensation' && segments[4] === 'new'
  const analyticsQuery: AnalyticsQuery = {
    ...defaultAnalyticsQuery(),
  }
  return {
    audit: segments[0] === 'audit',
    analytics: segments[0] === 'analytics',
    analyticsQuery,
    administration: segments[0] === 'administration',
    adminSection: cleanAdminSection(segments[1]),
    auditQuery: { ...defaultAuditQuery },
    query: defaultDirectoryQuery(),
    employeeId: validEmployeeId ? employeeId : null,
    compensationForm,
  }
}

function routePath(state: LocationState): string {
  if (state.audit) return '/audit'
  if (state.analytics) return '/analytics'
  if (state.administration) return `/administration/${state.adminSection}`
  if (state.employeeId) return `/employees/detail/${state.employeeId}${state.compensationForm ? '/compensation/new' : ''}`
  return '/employees'
}

function writeLocation(state: LocationState, replace = false) {
  const url = routePath(state)
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
}

function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [restoringUser, setRestoringUser] = useState(() => accessToken() !== null)
  const [location, setLocation] = useState<LocationState>(readLocation)
  const locationRef = useRef(location)
  const intendedPathRef = useRef(window.location.pathname === '/' || window.location.pathname === '/login' ? '/employees' : window.location.pathname)
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('sidebar-collapsed') === 'true')
  const navTrigger = useRef<HTMLButtonElement>(null)
  const [savedPackageId, setSavedPackageId] = useState<number | null>(null)
  const [formDirty, setFormDirty] = useState(false)

  useEffect(() => {
    if (accessToken() === null) return
    getCurrentUser().then((selected) => {
      setUser(selected)
      if (window.location.pathname === '/' || window.location.pathname === '/login') {
        const next = readLocation(intendedPathRef.current)
        locationRef.current = next
        setLocation(next)
        writeLocation(next, true)
      }
    }).catch(() => rememberAccessToken(null)).finally(() => setRestoringUser(false))
  }, [])

  useEffect(() => {
    const expired = () => {
      intendedPathRef.current = window.location.pathname === '/login' ? '/employees' : window.location.pathname
      window.history.replaceState(null, '', '/login')
      setUser(null)
      setNavOpen(false)
      setRestoringUser(false)
    }
    window.addEventListener('auth:expired', expired)
    return () => window.removeEventListener('auth:expired', expired)
  }, [])

  useEffect(() => {
    if (restoringUser || user || window.location.pathname === '/login') return
    intendedPathRef.current = window.location.pathname === '/' ? '/employees' : window.location.pathname
    window.history.replaceState(null, '', '/login')
  }, [restoringUser, user])

  function onLogin(selected: AuthenticatedUser) {
    const next = readLocation(intendedPathRef.current)
    locationRef.current = next
    setLocation(next)
    writeLocation(next, true)
    setUser(selected)
  }

  function onLogout() {
    intendedPathRef.current = '/employees'
    rememberAccessToken(null)
    window.history.replaceState(null, '', '/login')
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
    locationRef.current = next; setLocation(next)
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
    locationRef.current = next; setLocation(next)
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
    <WorkspaceShell
      user={user}
      nav={location}
      sidebarCollapsed={sidebarCollapsed}
      navOpen={navOpen}
      navTrigger={navTrigger}
      onToggleSidebar={toggleSidebar}
      onNavOpenChange={setNavOpen}
      onEmployees={openDirectory}
      onAnalytics={openAnalytics}
      onAudit={openAudit}
      onAdministration={openAdministration}
      onLogout={onLogout}
      onProfileBreadcrumb={openProfileFromBreadcrumb}
    >
      {location.audit ? <AuditTrail query={location.auditQuery} onQueryChange={updateAuditQuery} onOpenEmployee={openEmployee} /> : location.analytics ? <Suspense fallback={<p className="px-4 py-8 text-sm text-muted-foreground" role="status">Loading analytics…</p>}><AnalyticsScreen query={location.analyticsQuery} onQueryChange={updateAnalyticsQuery} onViewEmployees={analyticsDrilldown} /></Suspense> : location.administration ? <AdministrationScreen section={location.adminSection} /> : location.employeeId ? location.compensationForm
        ? <CompensationForm key={location.employeeId} employeeId={location.employeeId} onCancel={closeCompensationForm} onSaved={completeCompensationForm} onDirtyChange={setFormDirty} />
        : <EmployeeProfile key={location.employeeId} employeeId={location.employeeId} savedPackageId={savedPackageId} onRecordCompensation={openCompensationForm} onFullAuditLog={openEmployeeAudit} onBack={openDirectory} onOpenEmployee={openEmployee} />
        : <EmployeeDirectory query={location.query} updateQuery={updateQuery} onOpenEmployee={openEmployee} />}
    </WorkspaceShell>
  )
}

export default App
