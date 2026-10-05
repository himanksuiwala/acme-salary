import type { ReactNode, RefObject } from 'react'
import {
  ArchiveIcon,
  BuildingsIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChartBarIcon,
  ClockCounterClockwiseIcon,
  CurrencyDollarIcon,
  ListIcon,
  SignOutIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import type { AuthenticatedUser } from '@/features/auth/api'
import type { AdminSection } from '@/features/admin/AdministrationScreen'
import { roleLabel } from '@/features/employees/format'

export type WorkspaceNavState = {
  audit: boolean
  analytics: boolean
  administration: boolean
  adminSection: AdminSection
  employeeId: number | null
  compensationForm: boolean
}

type WorkspaceShellProps = {
  user: AuthenticatedUser
  nav: WorkspaceNavState
  sidebarCollapsed: boolean
  navOpen: boolean
  navTrigger: RefObject<HTMLButtonElement | null>
  onToggleSidebar: () => void
  onNavOpenChange: (open: boolean) => void
  onEmployees: () => void
  onAnalytics: () => void
  onAudit: () => void
  onAdministration: (section: AdminSection) => void
  onLogout: () => void
  onProfileBreadcrumb: () => void
  children: ReactNode
}

function sectionLabel(section: AdminSection) {
  return section === 'allowances' ? 'Compensation setup' : section === 'currencies' ? 'Currencies & FX' : 'Organization'
}

function Brand({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className={`flex items-center py-5 ${collapsed ? 'flex-col justify-center gap-2 px-2' : 'gap-3 px-5'}`}>
      <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white">A</div>
      <div className={collapsed ? 'sr-only' : 'min-w-0 flex-1 leading-tight'}>
        <p className="text-sm font-semibold tracking-tight">ACME</p>
        <p className="text-[11px] text-muted-foreground">Salary management</p>
      </div>
      {onToggle && (
        <Button type="button" size="icon-sm" variant="ghost" className="shrink-0" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>
          {collapsed ? <CaretRightIcon aria-hidden="true" size={17} /> : <CaretLeftIcon aria-hidden="true" size={17} />}
        </Button>
      )}
    </div>
  )
}

function UserCard({ user, onLogout, collapsed = false }: { user: AuthenticatedUser; onLogout: () => void; collapsed?: boolean }) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
  const initials = [user.first_name, user.last_name].filter(Boolean).map((part) => part![0]).join('').toUpperCase() || name.slice(0, 2).toUpperCase()

  if (collapsed) {
    return (
      <div className="mx-2 mb-3 flex flex-col items-center gap-2 border-t pt-3">
        <div aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white" title={name}>{initials}</div>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onLogout} aria-label="Log out" title="Log out"><SignOutIcon aria-hidden="true" size={17} /></Button>
      </div>
    )
  }

  return (
    <div className="mx-3 mb-3 rounded-xl border bg-neutral-50 p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <div aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{initials}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={name}>{name}</p>
          <p className="truncate text-xs text-muted-foreground" title={user.email}>{user.email}</p>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">{roleLabel(user.role)}</p>
        </div>
      </div>
      <button type="button" onClick={onLogout} className="mt-3 flex w-full items-center gap-2 rounded-md border-t pt-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><SignOutIcon aria-hidden="true" size={15} />Log out</button>
    </div>
  )
}

function NavContents({
  onEmployees,
  onAnalytics,
  onAudit,
  onAdministration,
  nav,
  user,
  onLogout,
  collapsed = false,
  onToggle,
}: {
  onEmployees: () => void
  onAnalytics: () => void
  onAudit: () => void
  onAdministration: (section: AdminSection) => void
  nav: WorkspaceNavState
  user: AuthenticatedUser
  onLogout: () => void
  collapsed?: boolean
  onToggle?: () => void
}) {
  const navClass = (selected: boolean) => `flex w-full items-center rounded-lg py-2.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${collapsed ? 'justify-center px-2' : 'gap-3 px-3 text-left'} ${selected ? 'bg-neutral-100 text-foreground' : 'text-muted-foreground'}`
  const employeesActive = !nav.audit && !nav.analytics && !nav.administration

  return (
    <>
      <Brand collapsed={collapsed} onToggle={onToggle} />
      <nav aria-label="Main navigation" className={`flex-1 pt-5 ${collapsed ? 'px-2' : 'px-3'}`}>
        <p className={collapsed ? 'sr-only' : 'px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'}>Workspace</p>
        <button type="button" title={collapsed ? 'Employees' : undefined} aria-current={employeesActive ? 'page' : undefined} onClick={onEmployees} className={navClass(employeesActive)}>
          <UsersThreeIcon size={19} weight="fill" aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Employees</span>
        </button>
        <button type="button" title={collapsed ? 'Analytics' : undefined} aria-current={nav.analytics ? 'page' : undefined} onClick={onAnalytics} className={navClass(nav.analytics)}>
          <ChartBarIcon size={19} weight={nav.analytics ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Analytics</span>
        </button>
        <p className={collapsed ? 'sr-only' : 'px-3 pb-2 pt-7 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'}>Administration</p>
        <button type="button" title={collapsed ? 'Audit log' : undefined} aria-current={nav.audit ? 'page' : undefined} onClick={onAudit} className={`${navClass(nav.audit)} ${collapsed ? 'mt-7' : ''}`}>
          <ClockCounterClockwiseIcon size={19} weight={nav.audit ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Audit log</span>
        </button>
        <button type="button" title={collapsed ? 'Organization' : undefined} aria-current={nav.administration && nav.adminSection === 'organization' ? 'page' : undefined} onClick={() => onAdministration('organization')} className={navClass(nav.administration && nav.adminSection === 'organization')}>
          <BuildingsIcon size={19} weight={nav.administration && nav.adminSection === 'organization' ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Organization</span>
        </button>
        <button type="button" title={collapsed ? 'Compensation setup' : undefined} aria-current={nav.administration && nav.adminSection === 'allowances' ? 'page' : undefined} onClick={() => onAdministration('allowances')} className={navClass(nav.administration && nav.adminSection === 'allowances')}>
          <ArchiveIcon size={19} weight={nav.administration && nav.adminSection === 'allowances' ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Compensation setup</span>
        </button>
        <button type="button" title={collapsed ? 'Currencies & FX' : undefined} aria-current={nav.administration && nav.adminSection === 'currencies' ? 'page' : undefined} onClick={() => onAdministration('currencies')} className={navClass(nav.administration && nav.adminSection === 'currencies')}>
          <CurrencyDollarIcon size={19} weight={nav.administration && nav.adminSection === 'currencies' ? 'fill' : 'regular'} aria-hidden="true" /><span className={collapsed ? 'sr-only' : undefined}>Currencies & FX</span>
        </button>
      </nav>
      <UserCard user={user} onLogout={onLogout} collapsed={collapsed} />
    </>
  )
}

function Breadcrumbs({ nav, onEmployees, onProfileBreadcrumb }: { nav: WorkspaceNavState; onEmployees: () => void; onProfileBreadcrumb: () => void }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
      <ol className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <li><button type="button" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={onEmployees}>Workspace</button></li>
        <li aria-hidden="true"><CaretRightIcon size={14} className="text-muted-foreground" /></li>
        {nav.audit || nav.analytics || nav.administration ? (
          <li className="truncate font-medium" aria-current="page">{nav.audit ? 'Audit log' : nav.analytics ? 'Analytics' : sectionLabel(nav.adminSection)}</li>
        ) : (
          <>
            <li>{nav.employeeId ? <button type="button" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={onEmployees}>Employees</button> : <span aria-current="page" className="font-medium">Employees</span>}</li>
            {nav.employeeId && (
              <>
                <li aria-hidden="true"><CaretRightIcon size={14} className="text-muted-foreground" /></li>
                <li>{nav.compensationForm ? <button type="button" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={onProfileBreadcrumb}>Employee profile</button> : <span aria-current="page" className="font-medium">Employee profile</span>}</li>
              </>
            )}
            {nav.compensationForm && (
              <>
                <li aria-hidden="true"><CaretRightIcon size={14} className="text-muted-foreground" /></li>
                <li className="truncate font-medium" aria-current="page">New package</li>
              </>
            )}
          </>
        )}
      </ol>
    </nav>
  )
}

export function WorkspaceShell({
  user,
  nav,
  sidebarCollapsed,
  navOpen,
  navTrigger,
  onToggleSidebar,
  onNavOpenChange,
  onEmployees,
  onAnalytics,
  onAudit,
  onAdministration,
  onLogout,
  onProfileBreadcrumb,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="min-h-svh bg-neutral-50 text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-white transition-[width] duration-200 lg:flex ${sidebarCollapsed ? 'w-[76px]' : 'w-[232px]'}`}>
        <NavContents onEmployees={onEmployees} onAnalytics={onAnalytics} onAudit={onAudit} onAdministration={onAdministration} nav={nav} user={user} onLogout={onLogout} collapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
      </aside>
      <div className={`transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[232px]'}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button ref={navTrigger} className="lg:hidden" aria-label="Open navigation" size="icon-sm" variant="ghost" onClick={() => onNavOpenChange(true)}><ListIcon aria-hidden="true" size={20} /></Button>
            <Breadcrumbs nav={nav} onEmployees={onEmployees} onProfileBreadcrumb={onProfileBreadcrumb} />
          </div>
        </header>
        <main>{children}</main>
      </div>
      <Sheet open={navOpen} onOpenChange={onNavOpenChange}>
        <SheetPopup finalFocus={navTrigger} side="left" aria-label="Navigation" className="max-w-[280px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex min-h-full flex-col">
            <NavContents onEmployees={onEmployees} onAnalytics={onAnalytics} onAudit={onAudit} onAdministration={onAdministration} nav={nav} user={user} onLogout={onLogout} />
          </div>
        </SheetPopup>
      </Sheet>
    </div>
  )
}
