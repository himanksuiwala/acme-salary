import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CompensationPackage, EmployeeDetail } from "./api";
import { downloadEmployeeCompensation, getEmployeeDetail } from "./api";
import { formatDate, formatMoney, statusLabel } from "./format";
import { EditEmployeeSheet } from "./EditEmployeeSheet";

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}
function annual(amount: number, frequency: string): number | null {
  return frequency === "ANNUAL" ? amount : frequency === "MONTHLY" ? amount * 12 : null;
}

function PackageDetails({ item }: { item: CompensationPackage }) {
  const base = annual(item.base_pay, item.pay_frequency);
  const variable = item.variable_pay === null ? null : annual(item.variable_pay, item.pay_frequency);
  const allowances = item.allowances.map((value) => annual(value.amount, value.frequency));
  const total =
    base !== null && variable !== null && allowances.every((value) => value !== null)
      ? base + variable + allowances.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[13px] text-muted-foreground">Base pay</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatMoney(item.base_pay, item.currency, item.pay_frequency)}
          </p>
        </div>
        <div>
          <p className="text-[13px] text-muted-foreground">Target variable pay</p>
          <p className="mt-1 text-lg font-medium tabular-nums">
            {item.variable_pay === null
              ? "Not specified"
              : formatMoney(item.variable_pay, item.currency, item.pay_frequency)}
          </p>
        </div>
      </div>
      <div className="border-t pt-4">
        <p className="text-[13px] text-muted-foreground">Indicative annual target, including allowances</p>
        {total === null ? (
          <p className="mt-1 text-sm">Unavailable when target pay is unspecified or a component is hourly.</p>
        ) : (
          <>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(total, item.currency, "ANNUAL")}</p>
            <p className="text-[13px] text-muted-foreground">Commitment estimate, not cash paid.</p>
          </>
        )}
      </div>
      <div className="border-t pt-4">
        <div className="mb-2 flex justify-between">
          <h3 className="text-sm font-semibold">Allowances</h3>
          <span className="text-[13px] text-muted-foreground">{item.allowances.length} recorded</span>
        </div>
        {item.allowances.length ? (
          <>
            <div className="hidden sm:block">
              <Table aria-label="Package allowances">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Allowance</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.allowances.map((allowance) => (
                    <TableRow key={allowance.type_code}>
                      <TableCell>{allowance.type_name}</TableCell>
                      <TableCell className="capitalize">{allowance.frequency.toLowerCase()}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(allowance.amount, item.currency, allowance.frequency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y sm:hidden">
              {item.allowances.map((allowance) => (
                <li className="flex justify-between gap-3 py-3 text-sm" key={allowance.type_code}>
                  <span>{allowance.type_name}</span>
                  <span className="text-right tabular-nums">
                    {formatMoney(allowance.amount, item.currency, allowance.frequency)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No allowances recorded.</p>
        )}
      </div>
      <p className="border-t pt-4 text-sm">
        <span className="text-muted-foreground">Reason: </span>
        {item.change_reason || "Not recorded"}
      </p>
      {(item.change_trigger || item.authorization_reference) && (
        <p className="text-[13px] text-muted-foreground">
          {item.change_trigger && `Category: ${statusLabel(item.change_trigger)}`}
          {item.change_trigger && item.authorization_reference && " · "}
          {item.authorization_reference && `Reference: ${item.authorization_reference}`}
        </p>
      )}
    </div>
  );
}

function PackageList({
  title,
  packages,
  scheduled = false,
  savedPackageId,
}: {
  title: string;
  packages: CompensationPackage[];
  scheduled?: boolean;
  savedPackageId?: number | null;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-[13px] text-muted-foreground">
          {packages.length} {scheduled ? "upcoming" : "past terms"}
        </span>
      </div>
      {packages.length ? (
        packages.map((item) => (
          <Card key={item.id} className={item.id === savedPackageId ? "border border-emerald-500 ring-1 ring-emerald-500" : "border ring-0"}>
            <CardContent>
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-lg py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <CaretDownIcon
                      aria-hidden="true"
                      className="shrink-0 transition-transform group-open:rotate-180"
                      size={16}
                    />
                    <div>
                      <p className="font-medium tabular-nums">
                        {formatDate(item.effective_from)} –{" "}
                        {item.effective_to ? formatDate(item.effective_to) : "ongoing"}
                      </p>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {item.change_reason || "Reason not recorded"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(item.base_pay, item.currency, item.pay_frequency)}
                    </span>
                    {scheduled && <Badge variant="info">Scheduled</Badge>}
                    {item.id === savedPackageId && <Badge variant="success">Just saved</Badge>}
                  </div>
                </summary>
                <div className="mt-4 border-t pt-5">
                  <PackageDetails item={item} />
                </div>
              </details>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card className="border ring-0">
          <CardContent>
            <p className="text-sm text-muted-foreground">No {scheduled ? "scheduled" : "past"} packages.</p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function Activity({ events }: { events: EmployeeDetail["activity"] }) {
  return (
    <Card className="border ring-0">
      <CardHeader>
        <h2 className="text-lg font-semibold">Activity</h2>
      </CardHeader>
      <CardContent>
        {events.length ? (
          <ol className="divide-y">
            {events.map((event) => (
              <li key={event.id} className="py-3 first:pt-0">
                <p className="text-sm font-medium">
                  {event.action === "CREATE_COMPENSATION"
                    ? "Package recorded"
                    : event.action === "EMPLOYEE_CREATED"
                      ? "Employee created"
                      : event.action === "DATA_EXPORTED"
                        ? "Compensation exported"
                        : statusLabel(event.action)}
                </p>
                {event.reason && <p className="mt-1 text-sm text-muted-foreground">{event.reason}</p>}
                {event.authorization_reference && <p className="mt-1 text-[13px] text-muted-foreground">Reference: {event.authorization_reference}</p>}
                <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
                  {event.actor || "Unknown actor"} · {event.created_at} UTC
                  {event.effective_from ? ` · Effective ${formatDate(event.effective_from)}` : ""}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No activity is recorded for this employee.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function EmployeeProfile({
  employeeId,
  savedPackageId,
  onBack,
  onRecordCompensation,
}: {
  employeeId: number;
  savedPackageId?: number | null;
  onBack: () => void;
  onRecordCompensation: () => void;
}) {
  const [asOf, setAsOf] = useState(utcToday);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getEmployeeDetail(employeeId, asOf, controller.signal)
      .then((result) => {
        setDetail(result);
        setError(null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Employee could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [employeeId, asOf, retry]);
  async function exportProfile() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadEmployeeCompensation(employeeId, asOf);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }
  const employee = detail?.employee;
  const savedPackage = detail && savedPackageId ? [detail.current, ...detail.scheduled, ...detail.history].find((item) => item?.id === savedPackageId) : null;
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <Button variant="ghost" className="-ml-2 mb-5" onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" />
        Back to directory
      </Button>
      {loading ? (
        <div className="space-y-5" aria-label="Loading employee profile">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Skeleton className="h-80" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : error ? (
        <Card className="border ring-0" role="alert">
          <CardContent>
            <h1 className="text-xl font-semibold">Couldn’t load employee</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : employee ? (
        <>
          {savedPackage && <p className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">Package saved for {employee.employee_code}, effective {formatDate(savedPackage.effective_from)}. It is highlighted below.</p>}
          <header className="mb-6 border-b pb-6">
            <p className="text-[13px] text-muted-foreground">Employees / {employee.employee_code}</p>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-[28px] leading-9 font-semibold tracking-tight">
                    {employee.first_name} {employee.last_name}
                  </h1>
                  <Badge variant={employee.status === "ACTIVE" ? "success" : "secondary"}>
                    {statusLabel(employee.status)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {employee.employee_code} · {employee.job_title || "Job title not specified"} ·{" "}
                  {employee.department.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {employee.location.name}, {employee.country.name} · Joined {formatDate(employee.joining_date)}
                  {employee.termination_date ? ` · Left ${formatDate(employee.termination_date)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <PencilSimpleIcon aria-hidden="true" />
                  Edit details
                </Button>
                <Button variant="outline" onClick={exportProfile} loading={exporting}>
                  <DownloadSimpleIcon aria-hidden="true" />
                  Export compensation
                </Button>
                <Button onClick={onRecordCompensation}>
                  <PlusIcon aria-hidden="true" />
                  {detail.current || detail.history.length || detail.scheduled.length
                    ? "Record compensation change"
                    : "Add first package"}
                </Button>
              </div>
            </div>
            {exportError && (
              <p className="mt-3 text-sm text-destructive-foreground" role="alert">
                Export failed: {exportError}
              </p>
            )}
          </header>
          <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border bg-muted px-4 py-3">
            <div>
              <label className="mb-1 flex items-center gap-1 text-[13px] font-medium" htmlFor="profile-as-of">
                <CalendarBlankIcon aria-hidden="true" size={16} />
                Compensation as of (UTC)
              </label>
              <Input
                id="profile-as-of"
                nativeInput
                type="date"
                value={asOf}
                onChange={(event) => {
                  if (event.target.value) {
                    setLoading(true);
                    setAsOf(event.target.value);
                  }
                }}
                className="w-48"
              />
            </div>
            <p className="pb-1 text-[13px] text-muted-foreground">
              The selected date changes Current, Scheduled, and History.
            </p>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-7">
              {detail.current ? (
                <section aria-labelledby="current-heading">
                  <Card className={detail.current.id === savedPackageId ? "border border-emerald-500 ring-1 ring-emerald-500" : "border border-emerald-200 ring-0"}>
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                      <h2 id="current-heading" className="text-lg font-semibold">
                        Current package
                      </h2>
                      <Badge variant="success">Current</Badge>
                      {detail.current.id === savedPackageId && <Badge variant="success">Just saved</Badge>}
                    </CardHeader>
                    <CardContent>
                      <p className="mb-5 text-[13px] text-muted-foreground tabular-nums">
                        Effective {formatDate(detail.current.effective_from)} –{" "}
                        {detail.current.effective_to ? formatDate(detail.current.effective_to) : "ongoing"}
                      </p>
                      <PackageDetails item={detail.current} />
                    </CardContent>
                  </Card>
                </section>
              ) : (
                <section aria-label="Current package">
                  <Empty className="rounded-lg border bg-card">
                    <EmptyHeader>
                      <EmptyTitle>No package effective on {formatDate(detail.as_of)}</EmptyTitle>
                      <EmptyDescription>
                        {detail.scheduled.length
                          ? "A future package is listed below."
                          : "Record a package to establish current compensation."}
                      </EmptyDescription>
                    </EmptyHeader>
                    {!detail.scheduled.length && !detail.history.length && (
                      <Button onClick={onRecordCompensation}>Add first package</Button>
                    )}
                  </Empty>
                </section>
              )}
              <PackageList title="Scheduled compensation" packages={detail.scheduled} scheduled savedPackageId={savedPackageId} />
              <PackageList title="Compensation history" packages={detail.history} savedPackageId={savedPackageId} />
            </div>
            <aside className="space-y-6">
              <Card className="border ring-0">
                <CardHeader>
                  <h2 className="text-lg font-semibold">Employee details</h2>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-4 text-sm">
                    <div>
                      <dt className="text-[13px] text-muted-foreground">Corporate email</dt>
                      <dd className="mt-1 break-all">{employee.email}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted-foreground">Employment type</dt>
                      <dd className="mt-1">
                        {employee.employment_type ? statusLabel(employee.employment_type) : "Not recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted-foreground">Reporting line</dt>
                      <dd className="mt-1">
                        {employee.manager
                          ? `${employee.manager.first_name} ${employee.manager.last_name} (${employee.manager.employee_code})`
                          : "Not recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted-foreground">Department</dt>
                      <dd className="mt-1">{employee.department.name}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted-foreground">Location</dt>
                      <dd className="mt-1">
                        {employee.location.name}, {employee.country.name}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              <Activity events={detail.activity} />
              <p className="text-[13px] leading-5 text-muted-foreground">
                Package dates use UTC. Values retain their stored currency and frequency.
              </p>
            </aside>
          </div>
          <EditEmployeeSheet
            open={editOpen}
            onOpenChange={setEditOpen}
            employee={employee}
            onSaved={() => {
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
