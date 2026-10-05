import { useId, useState } from 'react'
import type { DateRange } from '@daypicker/react'
import { CalendarBlankIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover'
import { parseIsoDate, shortDate, toIsoDate } from '@/lib/date'

export type IsoDateRange = { from: string; to: string }

type DateRangePickerProps = {
  label: string
  value: IsoDateRange
  onChange: (value: IsoDateRange) => void
  min?: string
  max?: string
  required?: boolean
  invalid?: boolean
}

export function DateRangePicker({ label, value, onChange, min, max, required = false, invalid = false }: DateRangePickerProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<IsoDateRange>(value)
  const [today] = useState(() => new Date())
  const minDate = parseIsoDate(min)
  const maxDate = parseIsoDate(max)
  const fromDate = parseIsoDate(draft.from)
  const toDate = parseIsoDate(draft.to)
  const selected: DateRange | undefined = draft.from || draft.to ? { from: fromDate, to: toDate } : undefined
  const complete = !required || Boolean(draft.from && draft.to)
  const datesValid = (!draft.from || Boolean(fromDate)) && (!draft.to || Boolean(toDate))
  const ordered = !draft.from || !draft.to || draft.from <= draft.to
  const withinBounds = (!min || ((!draft.from || draft.from >= min) && (!draft.to || draft.to >= min))) && (!max || ((!draft.from || draft.from <= max) && (!draft.to || draft.to <= max)))
  const valid = complete && datesValid && ordered && withinBounds
  const summary = value.from && value.to ? `${shortDate(value.from)} – ${shortDate(value.to)}` : value.from ? `From ${shortDate(value.from)}` : value.to ? `Through ${shortDate(value.to)}` : 'Any date'

  function applyDraft() { onChange(draft); setOpen(false) }

  return <Popover open={open} onOpenChange={(next) => { if (next) setDraft(value); setOpen(next) }}>
    <PopoverTrigger render={<Button type="button" variant="outline" aria-label={label} aria-invalid={invalid} className="max-w-full justify-start text-left font-normal" />}><CalendarBlankIcon aria-hidden="true" /><span className="truncate">{summary}</span></PopoverTrigger>
    <PopoverPopup align="start" className="w-[min(340px,calc(100vw-32px))] p-3" aria-label={`${label} picker`}>
      <p className="mb-3 text-sm font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <label htmlFor={`${id}-from`} className="min-w-0 text-xs font-medium">From (YYYY-MM-DD)<Input id={`${id}-from`} type="text" inputMode="numeric" autoComplete="off" maxLength={10} placeholder="YYYY-MM-DD" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (valid) applyDraft() } }} aria-invalid={Boolean(draft.from && !fromDate)} className="mt-1 min-w-0" /></label>
        <label htmlFor={`${id}-to`} className="min-w-0 text-xs font-medium">To (YYYY-MM-DD)<Input id={`${id}-to`} type="text" inputMode="numeric" autoComplete="off" maxLength={10} placeholder="YYYY-MM-DD" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (valid) applyDraft() } }} aria-invalid={Boolean(draft.to && !toDate)} className="mt-1 min-w-0" /></label>
      </div>
      <Calendar className="mx-auto mt-3" mode="range" captionLayout="dropdown" selected={selected} defaultMonth={selected?.from ?? selected?.to ?? minDate ?? maxDate ?? today} startMonth={minDate ?? new Date(1900, 0)} endMonth={maxDate ?? new Date(2100, 11)} disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]} onSelect={(range) => setDraft({ from: range?.from ? toIsoDate(range.from) : '', to: range?.to ? toIsoDate(range.to) : '' })} />
      {!datesValid && <p className="mt-2 text-xs text-destructive-foreground">Enter valid dates in YYYY-MM-DD format.</p>}
      {datesValid && !ordered && <p className="mt-2 text-xs text-destructive-foreground">From must be on or before to.</p>}
      {datesValid && !withinBounds && <p className="mt-2 text-xs text-destructive-foreground">Choose dates{min ? ` on or after ${min}` : ''}{max ? ` on or before ${max}` : ''}.</p>}
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ from: '', to: '' })} disabled={required}>Clear</Button>
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" size="sm" disabled={!valid} onClick={applyDraft}>Apply</Button></div>
      </div>
    </PopoverPopup>
  </Popover>
}
