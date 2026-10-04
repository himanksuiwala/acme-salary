# Data Model: Employee Compensation API

Schema source: `backend/schema.sql` version 3. This feature adds no tables or columns.

## Employee

- `employee_id` is numeric lookup ID; `employee_code` is the visible searchable ID.
- Name, email, job title, status, department and location/country form list and detail summary.
- Country and department are filtered by code; job title and status by exact case-insensitive text.
- `joining_date` bounds the start of a first compensation package.

## Compensation package

- One employee has zero or more packages ordered by `effective_from`.
- `base_pay` is a required nonnegative integer in the currency's minor unit; `variable_pay` is nullable and nonnegative when present.
- `currency_id` refers to an existing currency with code, symbol and decimal places.
- `pay_frequency` is `ANNUAL`, `MONTHLY` or `HOURLY`.
- `effective_from` and nullable `effective_to` are ISO dates, inclusive. Database triggers forbid overlap for one employee.
- On the UTC date: **history** when end is before today; **current** when start <= today <= end (or end null); **scheduled** when start is after today.
- New changes create a package; only the preceding package's `effective_to` may change. New start is today or later and strictly after the latest existing start.

## Allowance

- Each allowance belongs to one package and one existing allowance type.
- Its `amount` is a nonnegative integer in the package currency's minor unit; `frequency` is `ANNUAL`, `MONTHLY` or `HOURLY`.
- At most one allowance per type per package. The new package gets exactly the submitted set; old allowances remain intact.

## Audit event

- Successful POST creates one `audit_log` row: action `CREATE_COMPENSATION`, entity `employee_compensation`, new package ID and the `Admin@acme.org` user ID.
- `old_values` and `new_values` contain JSON snapshots; `new_values` includes the reason. Seeded packages have no reason, so detail returns null.
- Audit insertion and package insertion share a transaction; rejected requests create no event.

## Validation and state transition

1. Validate input shape, strict money types, frequencies, nonblank reason, distinct allowance codes and ISO date.
2. Begin an immediate transaction and confirm employee, actor, currency and allowance types.
3. Reject a start before today for prior compensation; reject a start at/before the latest package start. For a first package, reject dates before joining date.
4. If the latest package covers the proposed date, set its end to the preceding day; keep prior pay and allowance values.
5. Insert package, submitted allowances and audit event; commit.
6. Any validation, FK, uniqueness or overlap failure rolls back the entire change.
