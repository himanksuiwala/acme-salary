import { useId, useState } from 'react'
import { CalendarBlankIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover'
import { parseIsoDate, shortDate, toIsoDate } from '@/lib/date'

type DatePickerProps = {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  className?: string
}

export function DatePicker({ id, label, value, onChange, min, max, required, disabled, invalid, describedBy, className }: DatePickerProps) {
  const generatedId = useId()
  const inputId = `${generatedId}-entry`
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [today] = useState(() => new Date())
  const draftDate = parseIsoDate(draft)
  const minDate = parseIsoDate(min)
  const maxDate = parseIsoDate(max)
  const outOfBounds = Boolean(draftDate && ((min && draft < min) || (max && draft > max)))
  const canApply = (!required && !draft) || Boolean(draftDate && !outOfBounds)

  function commit(next: string) {
    onChange(next)
    setOpen(false)
  }

  return <Popover open={open} onOpenChange={(next) => { if (next) setDraft(value); setOpen(next) }}>
    <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} aria-label={`${label}: ${value ? shortDate(value) : 'Choose date'}`} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={`w-full min-w-0 justify-between font-normal ${className ?? ''}`} />}>
      <span className={`truncate tabular-nums ${value ? '' : 'text-muted-foreground'}`}>{value ? shortDate(value) : 'Choose date'}</span><CalendarBlankIcon aria-hidden="true" className="shrink-0" />
    </PopoverTrigger>
    <PopoverPopup align="start" className="w-[min(340px,calc(100vw-32px))]" aria-label={`${label} calendar`}>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <Calendar className="mx-auto" mode="single" captionLayout="dropdown" selected={draftDate} defaultMonth={draftDate ?? minDate ?? maxDate ?? today} startMonth={minDate ?? new Date(1900, 0)} endMonth={maxDate ?? new Date(2100, 11)} disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]} onSelect={(date) => { if (date) commit(toIsoDate(date)) }} />
      <label htmlFor={inputId} className="mt-3 block text-xs font-medium">Enter date (YYYY-MM-DD)</label>
      <Input id={inputId} type="text" inputMode="numeric" autoComplete="off" maxLength={10} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (canApply) commit(draft) } }} aria-invalid={Boolean(draft && !canApply)} className="mt-1" placeholder="YYYY-MM-DD" />
      {draft && !draftDate && <p className="mt-2 text-xs text-destructive-foreground">Enter a valid date in YYYY-MM-DD format.</p>}
      {outOfBounds && <p className="mt-2 text-xs text-destructive-foreground">Choose a date{min ? ` on or after ${min}` : ''}{max ? ` on or before ${max}` : ''}.</p>}
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        {!required ? <Button type="button" size="sm" variant="ghost" onClick={() => commit('')}>Clear</Button> : <span />}
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" size="sm" disabled={!canApply} onClick={() => commit(draft)}>Apply</Button></div>
      </div>
    </PopoverPopup>
  </Popover>
}
