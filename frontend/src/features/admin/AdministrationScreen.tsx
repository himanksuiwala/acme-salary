import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { changeAllowanceStatus, createAllowance, getReferenceData, updateAllowance, type AllowanceType, type ReferenceData } from './api'

export type AdminSection = 'organization' | 'allowances' | 'currencies'
type Editor = { kind: 'create' } | { kind: 'edit'; allowance: AllowanceType } | { kind: 'lifecycle'; allowance: AllowanceType } | null

const sections: { key: AdminSection; label: string; description: string }[] = [
  { key: 'organization', label: 'Organization', description: 'Review countries, locations, and departments supplied by the application dataset.' },
  { key: 'allowances', label: 'Compensation setup', description: 'Add, update, archive, or reactivate allowance types used in compensation packages.' },
  { key: 'currencies', label: 'Currencies & FX', description: 'Review reporting currencies and dated exchange rates supplied by the application dataset.' },
]

function ManagedExternally() {
  return <div className="rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Managed externally</span> · This data is read-only in the current release.</div>
}

function EmptyRow({ columns }: { columns: number }) {
  return <TableRow><TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">No matching records.</TableCell></TableRow>
}

export function AdministrationScreen({ section }: { section: AdminSection }) {
  const [data, setData] = useState<ReferenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<Editor>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const canWrite = true
  const sectionDetails = sections.find((item) => item.key === section)!

  useEffect(() => {
    const controller = new AbortController()
    getReferenceData(controller.signal).then((result) => { setData(result); setError('') })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load administration data.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])

  const query = search.trim().toLocaleLowerCase()
  const matches = (...values: unknown[]) => !query || values.some((value) => String(value ?? '').toLocaleLowerCase().includes(query))
  const filtered = useMemo(() => data ? {
    allowance_types: data.allowance_types.filter((item) => matches(item.code, item.name, item.description, item.status)),
    countries: data.countries.filter((item) => matches(item.code, item.name, item.default_currency)),
    locations: data.locations.filter((item) => matches(item.name, item.city, item.state, item.country_code, item.country_name)),
    departments: data.departments.filter((item) => matches(item.code, item.name, item.manager_name)),
    currencies: data.currencies.filter((item) => matches(item.code, item.name, item.symbol)),
    fx_rates: data.fx_rates.filter((item) => matches(item.source_currency, item.target_currency, item.rate_date, item.rate, item.source)),
  } : null, [data, query]) // eslint-disable-line react-hooks/exhaustive-deps

  function openEditor(next: Exclude<Editor, null>) {
    setEditor(next); setFormError(''); setReason('')
    if (next.kind === 'create') { setCode(''); setName(''); setDescription('') }
    else { setCode(next.allowance.code); setName(next.allowance.name); setDescription(next.allowance.description ?? '') }
  }

  function replaceAllowance(next: AllowanceType) {
    setData((current) => current ? { ...current, allowance_types: current.allowance_types.some((item) => item.id === next.id)
      ? current.allowance_types.map((item) => item.id === next.id ? next : item)
      : [...current.allowance_types, next].sort((a, b) => a.name.localeCompare(b.name)) } : current)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editor || saving) return
    if (editor.kind === 'lifecycle' && !reason.trim()) { setFormError('Enter a reason for this status change.'); return }
    if (editor.kind !== 'lifecycle' && (!name.trim() || (editor.kind === 'create' && !code.trim()))) { setFormError('Code and name are required.'); return }
    setSaving(true); setFormError('')
    try {
      const next = editor.kind === 'create'
        ? await createAllowance({ code: code.trim(), name: name.trim(), description: description.trim() || null })
        : editor.kind === 'edit'
          ? await updateAllowance(editor.allowance.id, { name: name.trim(), description: description.trim() || null })
          : await changeAllowanceStatus(editor.allowance.id, editor.allowance.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', reason.trim())
      replaceAllowance(next); setEditor(null)
    } catch (cause) {
      setFormError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Could not save the allowance type.')
    } finally { setSaving(false) }
  }

  return <div className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{sectionDetails.label}</h1><p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{sectionDetails.description}</p></div>
      {section === 'allowances' && <Button onClick={() => openEditor({ kind: 'create' })}><PlusIcon aria-hidden="true" />Add allowance type</Button>}
    </div>

    <section className="mt-7" aria-label={sectionDetails.label}>
        <div className="mb-5 flex justify-end"><div className="relative w-full sm:w-72"><MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" size={16} /><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this section" aria-label="Search records" className="pl-8" /></div></div>
        {loading ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div> : error || !filtered ? <Card className="border ring-0"><CardContent><p className="text-sm text-destructive-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>Try again</Button></CardContent></Card> : section === 'allowances' ? <Card className="border ring-0"><CardHeader className="border-b"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Allowance types</h3><p className="mt-1 text-sm text-muted-foreground">Archived types remain visible in existing package history.</p></div>{!canWrite && <Badge variant="outline">Read only</Badge>}</div></CardHeader><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead>{canWrite && <TableHead className="text-right">Actions</TableHead>}</TableRow></TableHeader><TableBody>{filtered.allowance_types.length ? filtered.allowance_types.map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.code}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell className="max-w-sm whitespace-normal text-muted-foreground">{item.description || '—'}</TableCell><TableCell><Badge variant={item.status === 'ACTIVE' ? 'success' : 'secondary'}>{item.status === 'ACTIVE' ? 'Active' : 'Archived'}</Badge></TableCell>{canWrite && <TableCell><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => openEditor({ kind: 'edit', allowance: item })}><PencilSimpleIcon aria-hidden="true" />Edit</Button><Button size="sm" variant="ghost" onClick={() => openEditor({ kind: 'lifecycle', allowance: item })}>{item.status === 'ACTIVE' ? 'Archive' : 'Reactivate'}</Button></div></TableCell>}</TableRow>) : <EmptyRow columns={canWrite ? 5 : 4} />}</TableBody></Table></Card> : section === 'organization' ? <div className="space-y-5"><ManagedExternally /><ReadOnlyTable title="Countries" heads={['Code', 'Country', 'Default currency']} rows={filtered.countries.map((item) => [item.code, item.name, item.default_currency])} /><ReadOnlyTable title="Locations" heads={['Location', 'City / state', 'Country']} rows={filtered.locations.map((item) => [item.name, [item.city, item.state].filter(Boolean).join(', ') || '—', `${item.country_name} (${item.country_code})`])} /><ReadOnlyTable title="Departments" heads={['Code', 'Department', 'Manager']} rows={filtered.departments.map((item) => [item.code, item.name, item.manager_name || 'Not assigned'])} /></div> : <div className="space-y-5"><ManagedExternally /><ReadOnlyTable title="Currencies" heads={['Code', 'Currency', 'Symbol', 'Decimals']} rows={filtered.currencies.map((item) => [item.code, item.name, item.symbol || '—', item.decimal_places])} /><ReadOnlyTable title="Dated FX rates" heads={['Pair', 'Rate', 'Date', 'Source', 'Status']} rows={filtered.fx_rates.map((item) => [`${item.source_currency} → ${item.target_currency}`, item.rate, item.rate_date, item.source, item.approved ? 'Active' : 'Inactive'])} /></div>}
    </section>

    <Sheet open={editor !== null} onOpenChange={(open) => { if (!open && !saving) setEditor(null) }}><SheetPopup aria-label="Allowance type editor"><form onSubmit={submit} className="flex min-h-0 flex-1 flex-col"><SheetHeader><SheetTitle>{editor?.kind === 'create' ? 'Add allowance type' : editor?.kind === 'edit' ? 'Edit allowance type' : editor?.allowance.status === 'ACTIVE' ? 'Archive allowance type' : 'Reactivate allowance type'}</SheetTitle><SheetDescription>{editor?.kind === 'lifecycle' ? 'Explain why this allowance availability is changing.' : 'Codes remain stable after an allowance type is created.'}</SheetDescription></SheetHeader><SheetPanel className="space-y-5">{formError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive-foreground">{formError}</p>}{editor?.kind === 'lifecycle' ? <><div className="rounded-lg border bg-muted/50 p-3 text-sm"><span className="font-medium">{editor.allowance.name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{editor.allowance.code}</span></div><Field><FieldLabel htmlFor="allowance-reason">Reason</FieldLabel><textarea id="allowance-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={500} className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" required /><FieldDescription>This reason appears in the audit log.</FieldDescription></Field></> : <><Field><FieldLabel htmlFor="allowance-code">Code</FieldLabel><Input id="allowance-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={40} disabled={editor?.kind === 'edit'} required /><FieldDescription>Letters, numbers, underscores, and hyphens. The code cannot change later.</FieldDescription></Field><Field><FieldLabel htmlFor="allowance-name">Name</FieldLabel><Input id="allowance-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></Field><Field><FieldLabel htmlFor="allowance-description">Description</FieldLabel><textarea id="allowance-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={500} className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></Field></>}</SheetPanel><SheetFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editor?.kind === 'lifecycle' ? editor.allowance.status === 'ACTIVE' ? 'Archive' : 'Reactivate' : 'Save allowance type'}</Button></SheetFooter></form></SheetPopup></Sheet>
  </div>
}

function ReadOnlyTable({ title, heads, rows }: { title: string; heads: string[]; rows: (string | number)[][] }) {
  return <Card className="border ring-0"><CardHeader className="border-b"><h3 className="font-semibold">{title}</h3></CardHeader><Table><TableHeader><TableRow>{heads.map((head) => <TableHead key={head}>{head}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.length ? rows.map((row, index) => <TableRow key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <TableCell key={cellIndex} className={cellIndex === 0 ? 'font-medium' : 'text-muted-foreground'}>{cell}</TableCell>)}</TableRow>) : <EmptyRow columns={heads.length} />}</TableBody></Table></Card>
}
