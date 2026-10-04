import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompensationPackage, Currency, DirectoryOptions, EmployeeDetail, NewCompensation } from "./api";
import { createCompensation, getDirectoryOptions, getEmployeeDetail } from "./api";
import { formatDate, formatMoney } from "./format";

type Frequency = NewCompensation["pay_frequency"];
type Allowance = {
  key: number;
  type_code: string;
  amount: string;
  frequency: Frequency;
};
type Draft = {
  effective_from: string;
  base_pay: string;
  variable_pay: string;
  currency_code: string;
  pay_frequency: Frequency;
  reason: string;
  allowances: Allowance[];
};
const frequencyOptions: Frequency[] = ["ANNUAL", "MONTHLY", "HOURLY"];
function today() {
  return new Date().toISOString().slice(0, 10);
}
function inputAmount(amount: number, currency: Currency) {
  return (amount / 10 ** currency.decimal_places).toFixed(currency.decimal_places);
}
function minorUnits(value: string, currency: Currency): number | null {
  const decimals = currency.decimal_places;
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
function latestPackage(detail: EmployeeDetail): CompensationPackage | null {
  return (
    [...detail.scheduled, ...(detail.current ? [detail.current] : []), ...detail.history].sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from),
    )[0] ?? null
  );
}
function FrequencySelect({
  value,
  onChange,
  label,
}: {
  value: Frequency;
  onChange: (value: Frequency) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Frequency)}>
      <SelectTrigger aria-label={label}>
        <SelectValue>
          {(selected: string | null) => (selected ? selected.toLowerCase() : "Select frequency")}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {frequencyOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {option.toLowerCase()}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

export function CompensationForm({
  employeeId,
  onCancel,
  onSaved,
}: {
  employeeId: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [options, setOptions] = useState<DirectoryOptions | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const nextKey = useRef(1);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getEmployeeDetail(employeeId, undefined, controller.signal), getDirectoryOptions(controller.signal)])
      .then(([profile, references]) => {
        if (controller.signal.aborted) return;
        setDetail(profile);
        setOptions(references);
        const latest = latestPackage(profile);
        const currency = references.currencies.find((item) => item.code === latest?.currency.code);
        setDraft({
          effective_from: "",
          base_pay: latest && currency ? inputAmount(latest.base_pay, currency) : "",
          variable_pay:
            latest?.variable_pay !== null && latest?.variable_pay !== undefined && currency
              ? inputAmount(latest.variable_pay, currency)
              : "",
          currency_code:
            latest?.currency.code ||
            references.countries.find((country) => country.code === profile.employee.country.code)
              ?.default_currency_code ||
            "",
          pay_frequency: (latest?.pay_frequency as Frequency) || "ANNUAL",
          reason: "",
          allowances:
            latest && currency
              ? latest.allowances.map((item) => ({
                  key: nextKey.current++,
                  type_code: item.type_code,
                  amount: inputAmount(item.amount, currency),
                  frequency: item.frequency as Frequency,
                }))
              : [],
        });
        setError(null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not load compensation form.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [employeeId, retry]);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setReview(false);
  }
  function changeAllowance(key: number, patch: Partial<Allowance>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            allowances: current.allowances.map((item) => (item.key === key ? { ...item, ...patch } : item)),
          }
        : current,
    );
    setReview(false);
  }
  function validate(): NewCompensation | null {
    if (!draft || !detail || !options) return null;
    const currency = options.currencies.find((item) => item.code === draft.currency_code);
    const latest = latestPackage(detail);
    const base = currency ? minorUnits(draft.base_pay, currency) : null;
    const variable = !draft.variable_pay.trim() ? null : currency ? minorUnits(draft.variable_pay, currency) : null;
    const allowances = draft.allowances.map((item) => ({
      type_code: item.type_code,
      amount: currency ? minorUnits(item.amount, currency) : null,
      frequency: item.frequency,
    }));
    let message = "";
    if (!draft.effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(draft.effective_from))
      message = "Enter an effective date.";
    else if (draft.effective_from < detail.employee.joining_date)
      message = "Effective date cannot precede the employee’s joining date.";
    else if (latest && (draft.effective_from < today() || draft.effective_from <= latest.effective_from))
      message = "A new package must start today or later and after the latest package.";
    else if (!currency) message = "Select a supported currency.";
    else if (base === null) message = "Enter a nonnegative base pay with valid currency precision.";
    else if (draft.variable_pay.trim() && variable === null)
      message = "Enter valid target variable pay or leave it blank.";
    else if (!draft.reason.trim()) message = "Enter a reason for the change.";
    else if (allowances.some((item) => !item.type_code || item.amount === null))
      message = "Complete or remove each allowance row.";
    else if (new Set(allowances.map((item) => item.type_code)).size !== allowances.length)
      message = "Each allowance type can appear only once.";
    if (message) {
      setError(message);
      requestAnimationFrame(() => errorRef.current?.focus());
      return null;
    }
    setError(null);
    return {
      effective_from: draft.effective_from,
      base_pay: base!,
      variable_pay: variable,
      currency_code: draft.currency_code,
      pay_frequency: draft.pay_frequency,
      reason: draft.reason.trim(),
      allowances: allowances.map((item) => ({ ...item, amount: item.amount! })),
    };
  }
  async function save() {
    const payload = validate();
    if (!payload) return;
    setSaving(true);
    try {
      await createCompensation(employeeId, payload);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save package.");
      setReview(false);
      requestAnimationFrame(() => errorRef.current?.focus());
      getEmployeeDetail(employeeId)
        .then(setDetail)
        .catch(() => {});
    } finally {
      setSaving(false);
    }
  }
  const currency = options?.currencies.find((item) => item.code === draft?.currency_code);
  const latest = detail ? latestPackage(detail) : null;
  const basePreview = currency && draft && minorUnits(draft.base_pay, currency);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Button variant="ghost" className="-ml-2 mb-5" onClick={onCancel}>
        <ArrowLeftIcon aria-hidden="true" />
        Back to profile
      </Button>
      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : !detail || !options || !draft ? (
        <Card className="border ring-0">
          <CardContent>
            <h1 className="text-xl font-semibold">Couldn’t load form</h1>
            <p className="mt-2 text-sm text-destructive-foreground">{error}</p>
            <Button
              className="mt-4"
              onClick={() => {
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <header className="mb-6">
            <p className="text-[13px] text-muted-foreground">
              {detail.employee.first_name} {detail.employee.last_name} · {detail.employee.employee_code}
            </p>
            <h1 className="mt-1 text-[28px] font-semibold">
              {latest ? "Record compensation change" : "Add first package"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a complete package version. The previous package remains in history.
            </p>
          </header>
          {error && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="mb-5 rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive-foreground"
            >
              {error}
            </div>
          )}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Card className="border ring-0">
              <CardHeader>
                <h2 className="text-lg font-semibold">Package details</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="effective-from">Effective from</FieldLabel>
                      <Input
                        nativeInput
                        id="effective-from"
                        type="date"
                        value={draft.effective_from}
                        min={
                          latest
                            ? today() > latest.effective_from
                              ? today()
                              : latest.effective_from
                            : detail.employee.joining_date
                        }
                        onChange={(event) => update("effective_from", event.target.value)}
                      />
                      <FieldDescription>Dates use UTC.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>Currency</FieldLabel>
                      <Select
                        value={draft.currency_code || "none"}
                        onValueChange={(value) => {
                          const code = value === "none" ? "" : String(value);
                          if (code !== draft.currency_code) {
                            setDraft({
                              ...draft,
                              currency_code: code,
                              base_pay: "",
                              variable_pay: "",
                              allowances: draft.allowances.map((item) => ({
                                ...item,
                                amount: "",
                              })),
                            });
                            setReview(false);
                            setError("Currency changed. Re-enter monetary amounts; no conversion was applied.");
                          }
                        }}
                      >
                        <SelectTrigger aria-label="Currency">
                          <SelectValue>
                            {(selected: string | null) => (selected === "none" ? "Select currency" : selected)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value="none">Select currency</SelectItem>
                          {options.currencies.map((item) => (
                            <SelectItem key={item.code} value={item.code}>
                              {item.code} · {item.name}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="base-pay">Base pay</FieldLabel>
                      <Input
                        id="base-pay"
                        inputMode="decimal"
                        value={draft.base_pay}
                        onChange={(event) => update("base_pay", event.target.value)}
                        placeholder="0.00"
                      />
                      <FieldDescription>Amount in {draft.currency_code || "selected currency"} units.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>Pay frequency</FieldLabel>
                      <FrequencySelect
                        label="Pay frequency"
                        value={draft.pay_frequency}
                        onChange={(value) => update("pay_frequency", value)}
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="variable-pay">Target variable pay (optional)</FieldLabel>
                    <Input
                      id="variable-pay"
                      inputMode="decimal"
                      value={draft.variable_pay}
                      onChange={(event) => update("variable_pay", event.target.value)}
                      placeholder="Not specified"
                    />
                    <FieldDescription>
                      Uses the package pay frequency. Blank means unspecified; 0 means zero.
                    </FieldDescription>
                  </Field>
                  <div className="border-t pt-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-semibold">Allowances</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update("allowances", [
                            ...draft.allowances,
                            {
                              key: nextKey.current++,
                              type_code: "",
                              amount: "",
                              frequency: "MONTHLY",
                            },
                          ])
                        }
                      >
                        <PlusIcon aria-hidden="true" />
                        Add allowance
                      </Button>
                    </div>
                    {draft.allowances.length ? (
                      <div className="space-y-3">
                        {draft.allowances.map((item) => (
                          <div
                            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_130px_130px_auto]"
                            key={item.key}
                          >
                            <Field>
                              <FieldLabel>Type</FieldLabel>
                              <Select
                                value={item.type_code || "none"}
                                onValueChange={(value) =>
                                  changeAllowance(item.key, {
                                    type_code: value === "none" ? "" : String(value),
                                  })
                                }
                              >
                                <SelectTrigger aria-label="Allowance type">
                                  <SelectValue>
                                    {(selected: string | null) =>
                                      selected === "none"
                                        ? "Select type"
                                        : options.allowance_types.find((type) => type.code === selected)?.name
                                    }
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectPopup>
                                  <SelectItem value="none">Select type</SelectItem>
                                  {options.allowance_types.map((type) => (
                                    <SelectItem key={type.code} value={type.code}>
                                      {type.name}
                                    </SelectItem>
                                  ))}
                                </SelectPopup>
                              </Select>
                            </Field>
                            <Field>
                              <FieldLabel>Amount</FieldLabel>
                              <Input
                                inputMode="decimal"
                                aria-label="Allowance amount"
                                value={item.amount}
                                onChange={(event) =>
                                  changeAllowance(item.key, {
                                    amount: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field>
                              <FieldLabel>Frequency</FieldLabel>
                              <FrequencySelect
                                label="Allowance frequency"
                                value={item.frequency}
                                onChange={(value) =>
                                  changeAllowance(item.key, {
                                    frequency: value,
                                  })
                                }
                              />
                            </Field>
                            <Button
                              className="self-end"
                              size="icon"
                              variant="ghost"
                              aria-label="Remove allowance"
                              title="Remove allowance"
                              onClick={() =>
                                update(
                                  "allowances",
                                  draft.allowances.filter((allowance) => allowance.key !== item.key),
                                )
                              }
                            >
                              <TrashIcon aria-hidden="true" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No allowances in this package.</p>
                    )}
                  </div>
                  <Field>
                    <FieldLabel htmlFor="change-reason">Reason for change</FieldLabel>
                    <Input
                      id="change-reason"
                      value={draft.reason}
                      onChange={(event) => update("reason", event.target.value)}
                      placeholder="e.g. Annual review"
                    />
                  </Field>
                  {!review ? (
                    <div className="flex justify-end gap-2 border-t pt-5">
                      <Button variant="outline" onClick={onCancel}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          if (validate()) setReview(true);
                        }}
                      >
                        Review change
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="space-y-3 rounded-lg border bg-muted p-4"
                      role="region"
                      aria-label="Review compensation change"
                    >
                      <h3 className="font-semibold">Review before saving</h3>
                      <p className="text-sm">
                        {detail.employee.first_name} {detail.employee.last_name} · Effective{" "}
                        {formatDate(draft.effective_from)}
                      </p>
                      <p className="text-sm">
                        Base:{" "}
                        {currency && basePreview !== null && basePreview !== undefined
                          ? formatMoney(basePreview, currency, draft.pay_frequency)
                          : "Invalid amount"}
                      </p>
                      <p className="text-sm">Reason: {draft.reason}</p>
                      {latest && (
                        <p className="text-sm">
                          Previous package starts {formatDate(latest.effective_from)}. Its end date may become the day
                          before this package starts.
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setReview(false)}>
                          Edit
                        </Button>
                        <Button loading={saving} onClick={save}>
                          Save package
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <aside className="lg:sticky lg:top-24">
              <Card className="border ring-0">
                <CardHeader>
                  <h2 className="text-lg font-semibold">Current context</h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    {detail.employee.country.name} · {detail.employee.department.name}
                  </p>
                  {latest ? (
                    <div className="mt-4 border-t pt-4">
                      <p className="text-[13px] text-muted-foreground">
                        Latest package · {formatDate(latest.effective_from)}
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {formatMoney(latest.base_pay, latest.currency, latest.pay_frequency)}
                      </p>
                      <p className="mt-2 text-[13px] text-muted-foreground">
                        {detail.scheduled.length} scheduled packages already recorded.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      No existing package. The first package cannot start before{" "}
                      {formatDate(detail.employee.joining_date)}.
                    </p>
                  )}
                  {currency && basePreview !== null && basePreview !== undefined && (
                    <div className="mt-4 border-t pt-4">
                      <p className="text-[13px] text-muted-foreground">Proposed base</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {formatMoney(basePreview, currency, draft.pay_frequency)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
