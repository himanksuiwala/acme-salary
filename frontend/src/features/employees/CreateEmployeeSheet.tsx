import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle,
} from '@/components/ui/sheet'
import type { DirectoryOptions, EmployeeSummary, NewEmployee } from './api'
import { createEmployee } from './api'

type Draft = Omit<NewEmployee, 'location_id'> & { location_id: string }

const initialDraft: Draft = {
  employee_code: '', first_name: '', last_name: '', email: '', department_code: '',
  location_id: '', job_title: '', employment_type: 'FULL_TIME', joining_date: '', status: 'ACTIVE',
}

export function CreateEmployeeSheet({
  open, onOpenChange, options, onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: DirectoryOptions | null
  onCreated: (employee: EmployeeSummary) => void
}) {
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function update(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    if (error) setError(null)
  }

  function changeOpen(next: boolean) {
    if (saving && !next) return
    if (!next) {
      setDraft(initialDraft)
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.department_code || !draft.location_id) {
      setError('Select a department and location.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const employee = await createEmployee({
        ...draft,
        location_id: Number(draft.location_id),
        job_title: draft.job_title || null,
        employment_type: draft.employment_type || null,
      })
      setDraft(initialDraft)
      onOpenChange(false)
      onCreated(employee)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Employee could not be created. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const hasReferences = Boolean(options?.departments.length && options?.locations.length)

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetPopup className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Add employee</SheetTitle>
          <SheetDescription>Create the employee record. Their compensation history appears in the profile once packages are recorded.</SheetDescription>
        </SheetHeader>
        <Form className="contents" onSubmit={handleSubmit}>
          <SheetPanel className="space-y-5">
            <p className="text-xs text-muted-foreground">Local development only · Changes use the temporary audit actor.</p>
            {!hasReferences && (
              <div className="rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm text-warning-foreground" role="alert">
                Department and location reference data are required before an employee can be added.
              </div>
            )}
            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive-foreground" role="alert">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="employee-code">Employee code</FieldLabel>
                <Input id="employee-code" required value={draft.employee_code} onChange={(event) => update('employee_code', event.target.value)} placeholder="EMP00124" />
              </Field>
              <Field>
                <FieldLabel htmlFor="joining-date">Joining date</FieldLabel>
                <Input id="joining-date" type="date" required value={draft.joining_date} onChange={(event) => update('joining_date', event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="first-name">First name</FieldLabel>
                <Input id="first-name" required value={draft.first_name} onChange={(event) => update('first_name', event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="last-name">Last name</FieldLabel>
                <Input id="last-name" required value={draft.last_name} onChange={(event) => update('last_name', event.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="employee-email">Work email</FieldLabel>
              <Input id="employee-email" type="email" required value={draft.email} onChange={(event) => update('email', event.target.value)} placeholder="name@acme.org" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Department</FieldLabel>
                <Select value={draft.department_code || 'none'} onValueChange={(value) => update('department_code', value === 'none' ? '' : String(value))}>
                  <SelectTrigger aria-label="Department"><SelectValue>{(selected: string | null) => selected === 'none' ? 'Select department' : options?.departments.find((item) => item.code === selected)?.name ?? selected}</SelectValue></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="none">Select department</SelectItem>
                    {options?.departments.map((item) => <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>)}
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Location</FieldLabel>
                <Select value={draft.location_id || 'none'} onValueChange={(value) => update('location_id', value === 'none' ? '' : String(value))}>
                  <SelectTrigger aria-label="Location"><SelectValue>{(selected: string | null) => {
                    if (selected === 'none') return 'Select location'
                    const location = options?.locations.find((item) => String(item.id) === selected)
                    return location ? `${location.name}, ${location.country_name}` : selected
                  }}</SelectValue></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="none">Select location</SelectItem>
                    {options?.locations.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}, {item.country_name}</SelectItem>)}
                  </SelectPopup>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="job-title">Job title</FieldLabel>
              <Input id="job-title" value={draft.job_title ?? ''} onChange={(event) => update('job_title', event.target.value)} placeholder="e.g. HR Manager" />
              <FieldDescription>Shown in the directory and employee profile.</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Employment type</FieldLabel>
                <Select value={draft.employment_type || 'FULL_TIME'} onValueChange={(value) => update('employment_type', String(value))}>
                  <SelectTrigger aria-label="Employment type"><SelectValue>{(selected: string | null) => selected?.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</SelectValue></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="FULL_TIME">Full time</SelectItem>
                    <SelectItem value="PART_TIME">Part time</SelectItem>
                    <SelectItem value="CONTRACT">Contract</SelectItem>
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select value={draft.status} onValueChange={(value) => update('status', String(value))}>
                  <SelectTrigger aria-label="Status"><SelectValue>{(selected: string | null) => selected?.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</SelectValue></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ON_LEAVE">On leave</SelectItem>
                    <SelectItem value="NOTICE_PERIOD">Notice period</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectPopup>
                </Select>
              </Field>
            </div>
          </SheetPanel>
          <SheetFooter>
            <Button variant="outline" type="button" disabled={saving} onClick={() => changeOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving} disabled={!hasReferences}>Create employee</Button>
          </SheetFooter>
        </Form>
      </SheetPopup>
    </Sheet>
  )
}
