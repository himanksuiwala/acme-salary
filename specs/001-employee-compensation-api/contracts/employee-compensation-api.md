# REST Contract: Employee Compensation API

Salary routes are for local development only. There is no authentication or authorization. JSON money values are integer minor units; dates are `YYYY-MM-DD`.

## GET `/api/employees`

Query parameters: `search`, `country`, `department`, `role`, `status` (optional strings); `page` (integer >=1, default 1); `page_size` (integer 1..100, default 20). Country and department use codes; role means job title. Text matching is case-insensitive; search is partial across first name, last name, full name and employee code; filters are exact and combined with AND.

200 response:

```json
{
  "page": 1,
  "page_size": 20,
  "total": 1,
  "items": [{
    "employee_id": 1,
    "employee_code": "EMP001",
    "first_name": "Ana",
    "last_name": "Singh",
    "email": "ana@example.org",
    "job_title": "Analyst",
    "status": "ACTIVE",
    "department": {"code": "HR", "name": "Human Resources"},
    "location": {"id": 1, "name": "London", "city": "London"},
    "country": {"code": "GB", "name": "United Kingdom"}
  }]
}
```

Unknown filter values yield 200 with no items. Invalid pagination yields 422. Out-of-range pages retain the true total.

## GET `/api/employees/{employee_id}/compensation`

`employee_id` is a positive numeric database ID. Optional `as_of=YYYY-MM-DD` classifies packages on that UTC calendar date; the default is today UTC. Response 404 if unknown.

200 response:

```json
{
  "employee": {"employee_id": 1, "employee_code": "EMP001", "first_name": "Ana", "last_name": "Singh", "email": "ana@example.org", "job_title": "Analyst", "status": "ACTIVE", "department": {"code": "HR", "name": "Human Resources"}, "location": {"id": 1, "name": "London", "city": "London"}, "country": {"code": "GB", "name": "United Kingdom"}},
  "as_of": "2026-10-04",
  "current": {"id": 12, "base_pay": 8000000, "variable_pay": null, "currency": {"code": "USD", "name": "US Dollar", "symbol": "$", "decimal_places": 2}, "pay_frequency": "ANNUAL", "effective_from": "2026-04-01", "effective_to": null, "change_reason": null, "change_trigger": null, "authorization_reference": null, "allowances": [{"type_code": "MEAL", "type_name": "Meal", "amount": 10000, "frequency": "MONTHLY"}]},
  "history": [],
  "scheduled": [],
  "activity": []
}
```

`current` is null when no package covers `as_of`. `history` is newest first; `scheduled` is earliest first. Every package uses the same shape; arrays may be empty. `activity` contains recent employee and compensation audit summaries.

## POST `/api/employees/{employee_id}/compensation`

The request is a complete new package. An omitted allowance does not appear on the new package; the old package is preserved. `variable_pay` may be null. An employee with no prior package may use a date on/after joining date; otherwise date must be today or later and later than the latest package start.

```json
{
  "base_pay": 9000000,
  "variable_pay": null,
  "currency_code": "USD",
  "pay_frequency": "ANNUAL",
  "effective_from": "2026-11-01",
  "reason": "Annual review",
  "change_trigger": "ANNUAL_MERIT",
  "authorization_reference": "HR-2026-14",
  "allowances": [{"type_code": "MEAL", "amount": 10000, "frequency": "MONTHLY"}]
}
```

201 response: `{"compensation": <package object>}`. `change_reason` equals the submitted reason. Empty `allowances` is allowed. Codes are case-insensitive and normalized to stored codes. `change_trigger` and `authorization_reference` are optional for existing clients; the form requires a trigger. Allowed triggers are `ANNUAL_MERIT`, `PROMOTION`, `MARKET`, `RETENTION`, `RELOCATION`, and `OTHER`. The reference is at most 120 characters. Both values are stored in the audit event and returned in package reads. A reference does not prove approval or attach a document.

- 404: employee not found.
- 422: malformed or invalid field, negative/non-integer money, unknown currency or allowance type, duplicate allowance type, blank reason, invalid date or frequency.
- 409: effective-date conflict, overlapping period or concurrent change conflict.
- Failed requests have no partial package, allowance or audit writes.
