import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CalendarBlankIcon, InfoIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { DatePicker } from '@/components/product/DatePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChangeTrigger, CompensationPackage, Currency, DirectoryOptions, EmployeeDetail, NewCompensation } from './api'
import { ApiError, createCompensation, getDirectoryOptions, getEmployeeDetail } from './api'
import { comparable, inputAmount, minorUnits, packageTotals, percentageChange, priorCutoff, annualized } from './compensationMath'
import { formatDate, formatMoney } from './format'

type Frequency = NewCompensation['pay_frequency']
type AllowanceDraft = { key: number; type_code: string; amount: string; frequency: Frequency }
type Draft = {
  effective_from: string
  currency_code: string
  pay_frequency: Frequency
  base_pay: string
  variable_pay: string
  allowances: AllowanceDraft[]
  change_trigger: ChangeTrigger | ''
  reason: string
  authorization_reference: string
}
type Errors = Record<string, string>
const frequencies: Frequency[] = ['ANNUAL', 'MONTHLY', 'HOURLY']
const triggers: { value: ChangeTrigger; label: string }[] = [
  { value: 'ANNUAL_MERIT', label: 'Annual merit review' },
  { value: 'PROMOTION', label: 'Promotion or level change' },
  { value: 'MARKET', label: 'Market adjustment' },
  { value: 'RETENTION', label: 'Retention adjustment' },
  { value: 'RELOCATION', label: 'Relocation or entity transfer' },
  { value: 'OTHER', label: 'Other' },
]
function todayUtc() { return new Date().toISOString().slice(0, 10) }
function latestPackage(detail: EmployeeDetail): CompensationPackage | null {
  return [...detail.scheduled, ...(detail.current ? [detail.current] : []), ...detail.history]
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
}
function SectionHeading({ number, title, description, action }: { number: number; title: string; description: string; action?: ReactNode }) {
  return <CardHeader className="flex flex-row items-start gap-3 border-b pb-4">
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[13px] font-semibold">{number}</span>
    <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p></div>{action}
  </CardHeader>
}
function FieldMessage({ message, id }: { message?: string; id: string }) {
  return message ? <p id={id} className="text-[13px] text-destructive-foreground" role="alert">{message}</p> : null
}
function FrequencySelect({ value, onChange, label, invalid }: { value: Frequency; onChange: (value: Frequency) => void; label: string; invalid?: boolean }) {
  return <Select value={value} onValueChange={(next) => onChange(next as Frequency)}>
    <SelectTrigger aria-label={label} aria-invalid={invalid}><SelectValue>{(selected: string | null) => selected ? selected.toLowerCase() : 'Select frequency'}</SelectValue></SelectTrigger>
    <SelectPopup>{frequencies.map((option) => <SelectItem key={option} value={option}>{option.toLowerCase()}</SelectItem>)}</SelectPopup>
  </Select>
}
function moneyOrUnavailable(value: number | null, currency: Currency | undefined, frequency = 'ANNUAL') {
  return value !== null && currency ? formatMoney(value, currency, frequency) : 'Unavailable'
}
function AmountDelta({ previous, next, currency, frequency }: { previous: number; next: number; currency: Currency; frequency: string }) {
  const delta = next - previous
  const percentage = percentageChange(previous, next)
  return <span className="text-[13px] text-muted-foreground tabular-nums">
    {delta === 0 ? 'No change' : `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta), currency, frequency)}`}
    {percentage !== null && ` (${percentage > 0 ? '+' : ''}${percentage.toFixed(1)}%)`}
  </span>
}

export function CompensationForm({ employeeId, onCancel, onSaved, onDirtyChange }: { employeeId: number; onCancel: () => void; onSaved: (packageId: number) => void; onDirtyChange: (dirty: boolean) => void }) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null)
  const [options, setOptions] = useState<DirectoryOptions | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [review, setReview] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [retry, setRetry] = useState(0)
  const summaryRef = useRef<HTMLDivElement>(null)
  const savingRef = useRef(false)
  const nextKey = useRef(1)

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!dirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getEmployeeDetail(employeeId, undefined, controller.signal), getDirectoryOptions(controller.signal)])
      .then(([profile, references]) => {
        if (controller.signal.aborted) return
        const latest = latestPackage(profile)
        const currency = references.currencies.find((item) => item.code === latest?.currency.code)
        setDetail(profile)
        setOptions(references)
        setDraft({
          effective_from: '',
          currency_code: latest?.currency.code || references.countries.find((country) => country.code === profile.employee.country.code)?.default_currency_code || '',
          pay_frequency: (latest?.pay_frequency as Frequency) || 'ANNUAL',
          base_pay: latest && currency ? inputAmount(latest.base_pay, currency) : '',
          variable_pay: latest?.variable_pay !== null && latest?.variable_pay !== undefined && currency ? inputAmount(latest.variable_pay, currency) : '',
          allowances: latest && currency ? latest.allowances.map((item) => ({ key: nextKey.current++, type_code: item.type_code, amount: inputAmount(item.amount, currency), frequency: item.frequency as Frequency })) : [],
          change_trigger: '', reason: '', authorization_reference: '',
        })
        setLoadError(null)
      })
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Could not load compensation form.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [employeeId, retry])

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDirty(true)
    setDraft((current) => current ? { ...current, [key]: value } : current)
    setErrors({}); setReview(false); setConflict(false)
  }
  function changeAllowance(key: number, patch: Partial<AllowanceDraft>) {
    setDirty(true)
    setDraft((current) => current ? { ...current, allowances: current.allowances.map((row) => row.key === key ? { ...row, ...patch } : row) } : current)
    setErrors({}); setReview(false)
  }
  function changeCurrency(value: string) {
    if (!draft || value === draft.currency_code) return
    setDirty(true)
    setDraft({ ...draft, currency_code: value, base_pay: '', variable_pay: '', allowances: draft.allowances.map((row) => ({ ...row, amount: '' })) })
    setErrors({ currency_change: 'Currency changed. Re-enter each monetary amount; no conversion was applied.' })
    setReview(false)
  }
  function validate(): NewCompensation | null {
    if (!draft || !detail || !options) return null
    const nextErrors: Errors = {}
    const currency = options.currencies.find((item) => item.code === draft.currency_code)
    const latest = latestPackage(detail)
    const date = new Date(`${draft.effective_from}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effective_from) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.effective_from) nextErrors.effective_from = 'Enter a valid effective date.'
    else if (draft.effective_from < detail.employee.joining_date) nextErrors.effective_from = 'The package cannot start before the employee joined.'
    else if (latest && (draft.effective_from < todayUtc() || draft.effective_from <= latest.effective_from)) nextErrors.effective_from = 'Choose today or later, after the latest package start.'
    if (!currency) nextErrors.currency_code = 'Select a supported currency.'
    const base = currency ? minorUnits(draft.base_pay, currency) : null
    const variable = draft.variable_pay.trim() ? currency ? minorUnits(draft.variable_pay, currency) : null : null
    if (base === null) nextErrors.base_pay = 'Enter a nonnegative amount with valid currency precision.'
    if (draft.variable_pay.trim() && variable === null) nextErrors.variable_pay = 'Enter a valid amount, or leave this blank.'
    if (!draft.change_trigger) nextErrors.change_trigger = 'Select a change category.'
    if (!draft.reason.trim()) nextErrors.reason = 'Explain the business reason for this package.'
    if (draft.authorization_reference.length > 120) nextErrors.authorization_reference = 'Use 120 characters or fewer.'
    const seen = new Set<string>()
    const allowances = draft.allowances.map((row) => {
      const amount = currency ? minorUnits(row.amount, currency) : null
      if (!options.allowance_types.some((type) => type.code === row.type_code)) nextErrors[`type-${row.key}`] = 'Select an allowance type.'
      if (amount === null) nextErrors[`amount-${row.key}`] = 'Enter a valid amount.'
      if (seen.has(row.type_code) && row.type_code) nextErrors[`type-${row.key}`] = 'Each allowance type can appear once.'
      seen.add(row.type_code)
      return { type_code: row.type_code, amount, frequency: row.frequency }
    })
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      requestAnimationFrame(() => summaryRef.current?.focus())
      return null
    }
    setErrors({})
    return {
      effective_from: draft.effective_from, currency_code: draft.currency_code, pay_frequency: draft.pay_frequency,
      base_pay: base!, variable_pay: variable, allowances: allowances.map((row) => ({ ...row, amount: row.amount! })),
      change_trigger: draft.change_trigger as ChangeTrigger, reason: draft.reason.trim(),
      authorization_reference: draft.authorization_reference.trim() || null,
    }
  }
  function beginReview(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (validate()) setReview(true) }
  async function save() {
    if (savingRef.current) return
    const payload = validate()
    if (!payload) { setReview(false); return }
    savingRef.current = true; setSaving(true)
    try { const saved = await createCompensation(employeeId, payload); onSaved(saved.id) }
    catch (cause) {
      const isConflict = cause instanceof ApiError && cause.status === 409
      setConflict(isConflict)
      setErrors({ server: isConflict ? 'The compensation timeline changed or this date conflicts with a saved package. Review the latest package below and choose a later effective date.' : cause instanceof Error ? cause.message : 'Could not save package.' })
      setReview(false)
      requestAnimationFrame(() => summaryRef.current?.focus())
      if (isConflict) getEmployeeDetail(employeeId).then(setDetail).catch(() => {})
    } finally { savingRef.current = false; setSaving(false) }
  }

  function cancel() {
    if (saving || (dirty && !window.confirm('Discard your unsaved compensation changes?'))) return
    onCancel()
  }

  const currency = options?.currencies.find((item) => item.code === draft?.currency_code)
  const latest = detail ? latestPackage(detail) : null
  const base = currency && draft ? minorUnits(draft.base_pay, currency) : null
  const variable = currency && draft?.variable_pay.trim() ? minorUnits(draft.variable_pay, currency) : null
  const allowanceValues = draft?.allowances.map((row) => ({ ...row, amountMinor: currency ? minorUnits(row.amount, currency) : null })) ?? []
  const completeAmounts = base !== null && (!draft?.variable_pay.trim() || variable !== null) && allowanceValues.every((row) => row.amountMinor !== null)
  const proposed = completeAmounts && draft ? { base_pay: base!, variable_pay: variable, pay_frequency: draft.pay_frequency, allowances: allowanceValues.map((row) => ({ amount: row.amountMinor!, frequency: row.frequency })) } : null
  const proposedTotals = proposed ? packageTotals(proposed) : null
  const previousTotals = latest ? packageTotals(latest) : null
  const canCompare = Boolean(latest && currency && draft && comparable(latest, currency, draft.pay_frequency))
  const cutoff = draft?.effective_from ? priorCutoff(draft.effective_from) : null
  const timelineValid = Boolean(draft?.effective_from && cutoff && detail && draft.effective_from >= detail.employee.joining_date && (!latest || (draft.effective_from >= todayUtc() && draft.effective_from > latest.effective_from)))
  const name = detail ? `${detail.employee.first_name} ${detail.employee.last_name}` : ''
  const allowanceChanges: string[] = []
  if (draft && latest && options) {
    const priorAllowances = new Map(latest.allowances.map((item) => [item.type_code, item]))
    for (const row of draft.allowances) {
      if (!row.type_code) continue
      const label = options.allowance_types.find((item) => item.code === row.type_code)?.name || row.type_code
      const previous = priorAllowances.get(row.type_code)
      const nextAmount = currency ? minorUnits(row.amount, currency) : null
      if (!previous) allowanceChanges.push(`Added ${label}`)
      else if (nextAmount !== previous.amount || row.frequency !== previous.frequency || currency?.code !== latest.currency.code) allowanceChanges.push(`Changed ${label}`)
      priorAllowances.delete(row.type_code)
    }
    for (const old of priorAllowances.values()) allowanceChanges.push(`Removed ${old.type_name}`)
  }

  return <div className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
    {loading ? <div className="space-y-5" aria-label="Loading compensation form"><Skeleton className="h-24 w-full" /><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><Skeleton className="h-96" /><Skeleton className="h-80" /></div></div> : !detail || !options || !draft ? <Card className="border ring-0"><CardContent><h1 className="text-xl font-semibold">Couldn’t load compensation form</h1><p className="mt-2 text-sm text-destructive-foreground">{loadError}</p><Button className="mt-4" onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>Try again</Button></CardContent></Card> : <>
      <header className="mb-6"><h1 className="text-[28px] leading-9 font-semibold tracking-tight">{latest ? 'Record compensation change' : 'Add first package'}</h1><p className="mt-1.5 max-w-[65ch] text-[15px] leading-[22px] text-muted-foreground">Create a complete package for {name}. Review the effective date and amounts before saving.</p></header>
      {Object.keys(errors).some((key) => key !== 'currency_change') && <div ref={summaryRef} tabIndex={-1} role="alert" className="mb-5 rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive-foreground"><p className="font-semibold">Review these details before continuing</p><ul className="mt-2 list-disc space-y-1 pl-5">{Object.entries(errors).filter(([key]) => key !== 'currency_change').map(([key, message]) => <li key={key}>{message}</li>)}</ul>{conflict && latest && <p className="mt-3 text-foreground">Latest saved package: {formatMoney(latest.base_pay, latest.currency, latest.pay_frequency)} · Starts {formatDate(latest.effective_from)}.</p>}</div>}
      {errors.currency_change && <p className="mb-5 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm text-warning-foreground" role="status">{errors.currency_change}</p>}
      {!options.currencies.length && <p role="alert" className="mb-5 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm text-warning-foreground">No currencies are configured. Add a currency reference before recording compensation.</p>}
      <Form onSubmit={beginReview} noValidate><div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="min-w-0 space-y-6">
        <Card className="border ring-0"><SectionHeading number={1} title="Effective horizon and boundary" description="Choose the UTC date when this version begins." /><CardContent className="space-y-4"><Field><FieldLabel htmlFor="effective-from">Effective-from date <span aria-hidden="true">*</span></FieldLabel><DatePicker id="effective-from" label="Effective-from date" value={draft.effective_from} min={latest ? (todayUtc() > latest.effective_from ? todayUtc() : latest.effective_from) : detail.employee.joining_date} invalid={Boolean(errors.effective_from)} describedBy={errors.effective_from ? 'effective-error' : 'effective-help'} onChange={(value) => update('effective_from', value)} /><FieldDescription id="effective-help">Effective at 00:00 UTC. Dates are stored as inclusive calendar days.</FieldDescription><FieldMessage id="effective-error" message={errors.effective_from} /></Field><div className="rounded-lg border bg-muted p-3 text-sm"><div className="flex items-start gap-2"><CalendarBlankIcon aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><div><p className="font-medium">Previous package boundary</p>{latest && cutoff && timelineValid ? <p className="mt-1 text-muted-foreground">The latest package, starting {formatDate(latest.effective_from)}, will end on {formatDate(cutoff)} if it currently extends beyond that date.</p> : latest ? <p className="mt-1 text-muted-foreground">Select a date after {formatDate(latest.effective_from)} to preview the cutoff. The server checks again when you save.</p> : <p className="mt-1 text-muted-foreground">This is the first package. It cannot start before {formatDate(detail.employee.joining_date)}.</p>}</div></div></div></CardContent></Card>
        <Card className="border ring-0"><SectionHeading number={2} title="Core cash compensation" description="Enter contractual base pay and optional target variable pay in the selected frequency." /><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>Currency <span aria-hidden="true">*</span></FieldLabel><Select value={draft.currency_code || 'none'} onValueChange={(value) => changeCurrency(value === 'none' ? '' : String(value))}><SelectTrigger aria-label="Currency" aria-invalid={Boolean(errors.currency_code)}><SelectValue>{(selected: string | null) => selected === 'none' ? 'Select currency' : `${selected} · ${options.currencies.find((item) => item.code === selected)?.name || ''}`}</SelectValue></SelectTrigger><SelectPopup><SelectItem value="none">Select currency</SelectItem>{options.currencies.map((item) => <SelectItem key={item.code} value={item.code}>{item.code} · {item.name}</SelectItem>)}</SelectPopup></Select><FieldMessage id="currency-error" message={errors.currency_code} /></Field><Field><FieldLabel>Pay frequency <span aria-hidden="true">*</span></FieldLabel><FrequencySelect label="Pay frequency" value={draft.pay_frequency} onChange={(value) => update('pay_frequency', value)} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="base-pay">Base pay <span aria-hidden="true">*</span></FieldLabel><Input id="base-pay" inputMode="decimal" value={draft.base_pay} placeholder={currency?.decimal_places ? '0.00' : '0'} aria-invalid={Boolean(errors.base_pay)} aria-describedby={errors.base_pay ? 'base-error' : 'base-help'} onChange={(event) => update('base_pay', event.target.value)} /><FieldDescription id="base-help">{currency?.code || 'Selected currency'} per {draft.pay_frequency.toLowerCase().replace('annual', 'year').replace('monthly', 'month').replace('hourly', 'hour')}. Enter major currency units.</FieldDescription><FieldMessage id="base-error" message={errors.base_pay} />{canCompare && latest && base !== null && <AmountDelta previous={latest.base_pay} next={base} currency={currency!} frequency={draft.pay_frequency} />}</Field><Field><FieldLabel htmlFor="variable-pay">Target variable pay (optional)</FieldLabel><Input id="variable-pay" inputMode="decimal" value={draft.variable_pay} placeholder="Not specified" aria-invalid={Boolean(errors.variable_pay)} aria-describedby={errors.variable_pay ? 'variable-error' : 'variable-help'} onChange={(event) => update('variable_pay', event.target.value)} /><FieldDescription id="variable-help">Blank means unspecified; 0 means zero. Uses the package frequency.</FieldDescription><FieldMessage id="variable-error" message={errors.variable_pay} /></Field></div>{!canCompare && latest && <div className="flex gap-2 rounded-lg border bg-muted p-3 text-[13px] text-muted-foreground"><InfoIcon aria-hidden="true" className="mt-0.5 shrink-0" size={16} />The previous package uses {latest.currency.code} / {latest.pay_frequency.toLowerCase()}. Direct deltas are unavailable across different currencies or frequencies.</div>}</CardContent></Card>
        <Card className="border ring-0"><SectionHeading number={3} title="Recurring allowances" description="The new package stores a complete allowance set. Each amount uses the package currency." action={<Button type="button" variant="outline" size="sm" onClick={() => update('allowances', [...draft.allowances, { key: nextKey.current++, type_code: '', amount: '', frequency: 'MONTHLY' }])}><PlusIcon aria-hidden="true" />Add</Button>} /><CardContent>{draft.allowances.length ? <div className="space-y-3">{draft.allowances.map((row) => { const amount = currency ? minorUnits(row.amount, currency) : null; const yearly = amount !== null ? annualized(amount, row.frequency) : null; return <div key={row.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_110px_125px_auto]"><Field><FieldLabel>Allowance type</FieldLabel><Select value={row.type_code || 'none'} onValueChange={(value) => changeAllowance(row.key, { type_code: value === 'none' ? '' : String(value) })}><SelectTrigger aria-label="Allowance type" aria-invalid={Boolean(errors[`type-${row.key}`])}><SelectValue>{(selected: string | null) => selected === 'none' ? 'Select type' : options.allowance_types.find((type) => type.code === selected)?.name || selected}</SelectValue></SelectTrigger><SelectPopup><SelectItem value="none">Select type</SelectItem>{options.allowance_types.map((type) => <SelectItem key={type.code} value={type.code}>{type.name}</SelectItem>)}</SelectPopup></Select><FieldMessage id={`type-${row.key}-error`} message={errors[`type-${row.key}`]} /></Field><Field><FieldLabel>Amount</FieldLabel><Input inputMode="decimal" aria-label="Allowance amount" value={row.amount} aria-invalid={Boolean(errors[`amount-${row.key}`])} onChange={(event) => changeAllowance(row.key, { amount: event.target.value })} /><FieldMessage id={`amount-${row.key}-error`} message={errors[`amount-${row.key}`]} /></Field><Field><FieldLabel>Frequency</FieldLabel><FrequencySelect label="Allowance frequency" value={row.frequency} onChange={(value) => changeAllowance(row.key, { frequency: value })} /></Field><Button type="button" className="self-end" size="icon" variant="ghost" aria-label="Remove allowance" title="Remove allowance" onClick={() => update('allowances', draft.allowances.filter((item) => item.key !== row.key))}><TrashIcon aria-hidden="true" /></Button><p className="sm:col-span-4 text-[13px] text-muted-foreground tabular-nums">Annualized impact: {moneyOrUnavailable(yearly, currency)}{amount !== null && yearly === null ? ' · Hourly amount cannot be annualized without contracted hours.' : ''}</p></div> })}</div> : <p className="text-sm text-muted-foreground">No allowances. Add one if this package includes a recurring allowance.</p>}{proposedTotals?.allowances !== null && proposedTotals?.allowances !== undefined && <p className="mt-4 border-t pt-3 text-right text-sm font-medium tabular-nums">Annualized allowances: {moneyOrUnavailable(proposedTotals.allowances, currency)}</p>}</CardContent></Card>
        <Card className="border ring-0"><SectionHeading number={4} title="Business reason and audit details" description="Record why the package is changing. This explanation appears in compensation history." /><CardContent className="space-y-5"><Field><FieldLabel>Change category <span aria-hidden="true">*</span></FieldLabel><Select value={draft.change_trigger || 'none'} onValueChange={(value) => update('change_trigger', value === 'none' ? '' : value as ChangeTrigger)}><SelectTrigger aria-label="Change category" aria-invalid={Boolean(errors.change_trigger)}><SelectValue>{(selected: string | null) => selected === 'none' ? 'Select category' : triggers.find((item) => item.value === selected)?.label}</SelectValue></SelectTrigger><SelectPopup><SelectItem value="none">Select category</SelectItem>{triggers.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectPopup></Select><FieldMessage id="trigger-error" message={errors.change_trigger} /></Field><Field><FieldLabel htmlFor="change-reason">Detailed justification <span aria-hidden="true">*</span></FieldLabel><textarea id="change-reason" rows={4} value={draft.reason} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? 'reason-error' : 'reason-help'} onChange={(event) => update('reason', event.target.value)} className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive" placeholder="Explain the change and its business context" /><FieldDescription id="reason-help">Saved with the package’s audit event.</FieldDescription><FieldMessage id="reason-error" message={errors.reason} /></Field><Field><FieldLabel htmlFor="authorization-reference">Documentation reference (optional)</FieldLabel><Input id="authorization-reference" maxLength={120} value={draft.authorization_reference} aria-invalid={Boolean(errors.authorization_reference)} onChange={(event) => update('authorization_reference', event.target.value)} placeholder="e.g. HR-2026-14" /><FieldDescription>A reference only. This application does not verify approval or attach documents.</FieldDescription><FieldMessage id="reference-error" message={errors.authorization_reference} /></Field></CardContent></Card>
      </div><aside className="space-y-4 lg:sticky lg:top-24"><Card className="border ring-0"><CardHeader><h2 className="text-lg font-semibold">Proposed package summary</h2><p className="text-[13px] text-muted-foreground">Live preview · {currency?.code || 'Select currency'}</p></CardHeader><CardContent className="space-y-4"><div><p className="text-[13px] text-muted-foreground">Base pay</p><p className="mt-1 text-xl font-semibold tabular-nums">{base !== null && currency ? formatMoney(base, currency, draft.pay_frequency) : 'Enter base pay'}</p></div><div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm"><div><p className="text-[13px] text-muted-foreground">Target variable</p><p className="mt-1 font-medium tabular-nums">{draft.variable_pay.trim() ? moneyOrUnavailable(variable, currency, draft.pay_frequency) : 'Not specified'}</p></div><div><p className="text-[13px] text-muted-foreground">Annual allowances</p><p className="mt-1 font-medium tabular-nums">{moneyOrUnavailable(proposedTotals?.allowances ?? null, currency)}</p></div></div><div className="border-t pt-3"><p className="text-[13px] text-muted-foreground">Indicative annual target, including allowances</p><p className="mt-1 text-lg font-semibold tabular-nums">{moneyOrUnavailable(proposedTotals?.total ?? null, currency)}</p><p className="mt-1 text-[13px] text-muted-foreground">Commitment estimate, not cash paid. Hourly components cannot be annualized without contracted hours.</p></div>{latest && <div className="border-t pt-3"><h3 className="text-sm font-semibold">Previous version comparison</h3>{canCompare && currency ? <dl className="mt-2 space-y-2 text-[13px]"><div className="flex justify-between gap-2"><dt>Base pay</dt><dd className="text-right tabular-nums">{formatMoney(latest.base_pay, currency, latest.pay_frequency)} → {base !== null ? formatMoney(base, currency, draft.pay_frequency) : '—'}</dd></div><div className="flex justify-between gap-2"><dt>Target variable</dt><dd className="text-right tabular-nums">{latest.variable_pay === null ? 'Unspecified' : formatMoney(latest.variable_pay, currency, latest.pay_frequency)} → {draft.variable_pay.trim() ? moneyOrUnavailable(variable, currency, draft.pay_frequency) : 'Unspecified'}</dd></div><div className="flex justify-between gap-2"><dt>Annual allowances</dt><dd className="text-right tabular-nums">{moneyOrUnavailable(previousTotals?.allowances ?? null, currency)} → {moneyOrUnavailable(proposedTotals?.allowances ?? null, currency)}</dd></div>{previousTotals?.cash !== null && proposedTotals?.cash !== null && previousTotals?.cash !== undefined && proposedTotals?.cash !== undefined && <div className="border-t pt-2"><dt>Annual target cash change</dt><dd className="mt-1 text-right"><AmountDelta previous={previousTotals.cash} next={proposedTotals.cash} currency={currency} frequency="ANNUAL" /></dd></div>}</dl> : <p className="mt-2 text-[13px] text-muted-foreground">{formatMoney(latest.base_pay, latest.currency, latest.pay_frequency)} previously. Currency or frequency differs, so no direct delta is shown.</p>}</div>}</CardContent></Card>{!review ? <Button className="w-full" type="submit" disabled={!options.currencies.length}>Review package</Button> : <Card className="border ring-0"><CardHeader><h2 className="text-lg font-semibold">Review before saving</h2></CardHeader><CardContent className="space-y-3 text-sm"><p><strong>Employee:</strong> {name} ({detail.employee.employee_code})</p><p><strong>Effective:</strong> {formatDate(draft.effective_from)} UTC</p><p><strong>Base:</strong> {base !== null && currency ? formatMoney(base, currency, draft.pay_frequency) : '—'}</p><p><strong>Target variable:</strong> {draft.variable_pay.trim() ? moneyOrUnavailable(variable, currency, draft.pay_frequency) : 'Not specified'}</p><p><strong>Allowances:</strong> {draft.allowances.length} in the new package</p>{allowanceChanges.length > 0 && <ul className="list-disc pl-5">{allowanceChanges.map((change) => <li key={change}>{change}</li>)}</ul>}{latest && !allowanceChanges.length && <p className="text-muted-foreground">No allowance changes.</p>}<p><strong>Indicative annual target:</strong> {moneyOrUnavailable(proposedTotals?.total ?? null, currency)}</p>{latest && cutoff && <p><strong>Previous cutoff:</strong> {formatDate(cutoff)} if its period extends beyond that date</p>}<p><strong>Category:</strong> {triggers.find((item) => item.value === draft.change_trigger)?.label}</p><p><strong>Reason:</strong> {draft.reason}</p>{draft.authorization_reference && <p><strong>Reference:</strong> {draft.authorization_reference}</p>}<div className="flex gap-2 border-t pt-3"><Button type="button" variant="outline" className="flex-1" onClick={() => setReview(false)}>Edit</Button><Button type="button" className="flex-1" loading={saving} onClick={save}>Save package</Button></div></CardContent></Card>}<Button type="button" variant="ghost" className="w-full" onClick={cancel} disabled={saving}>Cancel and return</Button><p className="text-[13px] leading-5 text-muted-foreground">The server rechecks dates and references on save.</p></aside></div></Form>
    </>}
  </div>
}
