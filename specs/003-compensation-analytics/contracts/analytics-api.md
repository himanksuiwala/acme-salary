# Compensation analytics API contract

## GET /api/analytics/compensation

Query: `as_of=YYYY-MM-DD` (default today UTC), optional `country`, `department`, `role`, `status`, `location_id`, `period_from`, `period_to`. Chart distribution and group breakdowns always use annualized base salary. A legacy `metric=base` request is accepted; any other metric returns 422. Reporting currency is always USD; an explicit non-USD `reporting_currency` request returns 422 for callers of the earlier contract. Invalid date or reversed period returns 422.

Response 200 JSON:
- `context`: `as_of`, `generated_at`, `filters`, `reporting_currency` USD currency object, `fx_reference_date`, `fx_reference_source`, `population: "employed_as_of"`.
- `coverage`: `employee_count`, `base_included`, `no_package`, `hourly_base`, `missing_fx`, `missing_fx_currencies`, `rates` (source, target, rate, rate_date, source_name).
- `metrics`: `base`, `variable`, `allowances`, `target` each `{sum, average, median, included, excluded, exclusion_reasons, partial}` in USD integer minor units. Amounts are null when no record qualifies.
- `distribution`: annualized-base array of `{lower, upper, count}` USD integer minor units, upper inclusive; empty when no value qualifies.
- `breakdowns`: `{country, department, role}` arrays, each row `{key,label,employee_count,included,excluded,exclusion_reasons,sum,average,median,partial}` for annualized base salary.
- `changes`: `{count,items}` with bounded most recent package starts: employee id/code/name, effective_from, prior/new base/currency/frequency, comparable percentage or null.

No salary row list or user identity is returned. Local development only; no scope enforcement yet. The fixed approved Federal Reserve H.10 reference set dated 2026-09-25 applies regardless of compensation as-of date. Same-currency USD is identity. No-rate records are excluded and impacted money metrics are Partial. A Partial tooltip can use `exclusion_reasons` without fetching salary rows.

## Directory drill-down extension

GET /api/employees accepts optional `as_of=YYYY-MM-DD`, `employed_as_of=true`, and `location_id` alongside existing filters. When `as_of` is given, current package/pay state use that date; `employed_as_of=true` applies joining/termination dates. Without these parameters, existing today-based behavior is unchanged. Analytics group links pass this context and all compatible filters.

## GET /api/analytics/compensation/export

Same query. Returns formula-safe text/csv, with metadata header rows for generated_at UTC, as_of, filters, population, currency basis, coverage, rate provenance and definitions, followed by summary, distribution, breakdown and change sections. `Cache-Control: no-store`. Uses existing export request/completion audit pipeline. Local development only until authentication/scope is implemented.
