import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/product/DatePicker";
import { Field, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DirectoryOptions, EmployeeEdit, ProfileEmployee } from "./api";
import { getDirectoryOptions, updateEmployee } from "./api";

export function EditEmployeeSheet({
  open,
  onOpenChange,
  employee,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: ProfileEmployee;
  onSaved: () => void;
}) {
  const [options, setOptions] = useState<DirectoryOptions | null>(null);
  const [draft, setDraft] = useState<EmployeeEdit>({
    first_name: employee.first_name,
    last_name: employee.last_name,
    email: employee.email,
    job_title: employee.job_title,
    employment_type: employee.employment_type,
    status: employee.status,
    termination_date: employee.termination_date,
    department_code: employee.department.code,
    location_id: employee.location.id,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    getDirectoryOptions(controller.signal)
      .then(setOptions)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load references.");
      });
    return () => controller.abort();
  }, [open]);
  function change<K extends keyof EmployeeEdit>(key: K, value: EmployeeEdit[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.termination_date && draft.termination_date < employee.joining_date) {
      setError("Termination date cannot be before joining date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateEmployee(employee.employee_id, draft);
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save employee details.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <SheetPopup className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit employee details</SheetTitle>
          <SheetDescription>
            Update the supported identity and organization fields. Changes are audited.
          </SheetDescription>
        </SheetHeader>
        <Form className="contents" onSubmit={submit}>
          <SheetPanel className="space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive-foreground"
              >
                {error}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-first">First name</FieldLabel>
                <Input
                  id="edit-first"
                  required
                  value={draft.first_name}
                  onChange={(event) => change("first_name", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-last">Last name</FieldLabel>
                <Input
                  id="edit-last"
                  required
                  value={draft.last_name}
                  onChange={(event) => change("last_name", event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="edit-email">Work email</FieldLabel>
              <Input
                id="edit-email"
                required
                type="email"
                value={draft.email}
                onChange={(event) => change("email", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-title">Job title</FieldLabel>
              <Input
                id="edit-title"
                value={draft.job_title || ""}
                onChange={(event) => change("job_title", event.target.value || null)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Department</FieldLabel>
                <Select
                  value={draft.department_code}
                  onValueChange={(value) => change("department_code", String(value))}
                >
                  <SelectTrigger aria-label="Department">
                    <SelectValue>
                      {(selected: string | null) =>
                        options?.departments.find((item) => item.code === selected)?.name || selected
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {options?.departments.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Location</FieldLabel>
                <Select
                  value={String(draft.location_id)}
                  onValueChange={(value) => change("location_id", Number(value))}
                >
                  <SelectTrigger aria-label="Location">
                    <SelectValue>
                      {(selected: string | null) =>
                        options?.locations.find((item) => String(item.id) === selected)?.name || selected
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {options?.locations.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}, {item.country_name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Employment type</FieldLabel>
                <Select
                  value={draft.employment_type || "none"}
                  onValueChange={(value) => change("employment_type", value === "none" ? null : String(value))}
                >
                  <SelectTrigger aria-label="Employment type">
                    <SelectValue>
                      {(selected: string | null) =>
                        selected === "none" ? "Not recorded" : selected?.replaceAll("_", " ").toLowerCase()
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="none">Not recorded</SelectItem>
                    <SelectItem value="FULL_TIME">Full time</SelectItem>
                    <SelectItem value="PART_TIME">Part time</SelectItem>
                    <SelectItem value="CONTRACT">Contract</SelectItem>
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select value={draft.status} onValueChange={(value) => change("status", String(value))}>
                  <SelectTrigger aria-label="Status">
                    <SelectValue>
                      {(selected: string | null) => selected?.replaceAll("_", " ").toLowerCase()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {["ACTIVE", "ON_LEAVE", "NOTICE_PERIOD", "TERMINATED", "INACTIVE"].map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replaceAll("_", " ").toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="edit-end">Termination date (optional)</FieldLabel>
              <DatePicker id="edit-end" label="Termination date" min={employee.joining_date}
                value={draft.termination_date || ""} onChange={(value) => change("termination_date", value || null)} />
            </Field>
          </SheetPanel>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!options}>
              Save details
            </Button>
          </SheetFooter>
        </Form>
      </SheetPopup>
    </Sheet>
  );
}
