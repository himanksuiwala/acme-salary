# Implementation Plan: Employee Compensation API

**Branch**: `main` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

## Summary

Add local-development REST reads for employee directory and compensation detail, plus an atomic append-only compensation update. Reuse FastAPI, Pydantic, built-in `sqlite3`, schema v3 and existing reference tables. No schema migration or frontend change is required.

## Technical Context

**Language/Version**: Python 3.12  
**Primary Dependencies**: FastAPI 0.142.2, Pydantic 2.13.5; no new package  
**Storage**: SQLite schema v3, integer minor-unit money, inclusive date text  
**Testing**: `unittest` with temporary SQLite databases  
**Target Platform**: Local development server bound to `127.0.0.1`  
**Project Type**: REST web service in the existing backend  
**Performance Goals**: Deterministic pagination for 10,000 employees; maximum 100 rows per list response  
**Constraints**: No authentication yet; endpoints are not production-ready. Writes must preserve salary history and audit events.  
**Scale/Scope**: Employee list, compensation detail, compensation create endpoints

## Constitution Check

| Principle | Design response |
|---|---|
| I. Compensation Management Scope | Only directory, compensation read and versioned update; no payroll, tax or HRMS expansion. |
| II. Accurate Money and History | Strict integer minor-unit inputs, currency lookup, inclusive non-overlapping periods, new rows for new package/allowances. |
| III. Data Integrity and Traceability | `BEGIN IMMEDIATE` serializes writers; database FKs and overlap triggers remain; audit event is in the same transaction. Existing rows are preserved; no migration. |
| IV. Least-Privilege Salary Access | Intended role is HR platform `NORMAL_USER`; `SYSTEM` is for automation. No caller authentication exists, so API remains explicitly local-development only and uses temporary fixed actor `Admin@acme.org`. README and OpenAPI descriptions disclose this boundary. |
| V. Evidence for Behavior Changes | Focused `unittest` cases cover filters, pagination, temporal read, successful/failed atomic writes, audit and seeded data shape. |
| VI. Simplicity with Clear Boundaries | One API module and one query/write module using built-in sqlite3; no ORM, repository framework or migration. |

**Gate result before and after design**: Pass for local-development scope. Production access remains a separate feature.

## Project Structure

### Documentation (this feature)

```text
specs/001-employee-compensation-api/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/employee-compensation-api.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── main.py                         # include employee API router
├── employee_api.py                 # request validation and HTTP mapping
├── employee_store.py               # parameterized SQLite reads and atomic write
├── database.py                     # existing SQLite connection
├── schema.sql                      # unchanged schema v3
└── tests/test_employee_api.py      # focused API behavior checks
README.md                           # local API usage and access caveat
```

**Structure Decision**: Keep the established flat backend package; separate HTTP models from SQL and reuse the existing database connection. No frontend files change.

## Design Details

- List queries accept optional `search`, `country`, `department`, `role`, `status`, `page`, `page_size`; use bound parameters and case-insensitive matching. Escape LIKE metacharacters. Stable sort by employee code and ID. Count and page use the same WHERE clause.
- Detail classifies packages using current UTC date. Inclusive `effective_to` means a package ending today is current today. Include allowance and currency details for every version; obtain change reason from matching audit event when present.
- POST validates strict nonnegative integer amounts, date, reason, frequencies and distinct allowance types. Resolve existing currency and allowance codes. Return 422 for invalid/reference input, 404 for unknown employee, 409 for temporal conflicts.
- For prior packages, POST starts after the latest `effective_from` and no earlier than today's UTC date. Close the latest package at the preceding day if it intersects the new period. A first package may begin on or after joining date. Insert new package, exactly submitted allowances and one audit row in one immediate transaction; roll back on any failure.
- Existing app users have no credentials. No role authorization is claimed or enforced; this API is local-development only.

## Complexity Tracking

No constitution exception. The local-only access limitation is explicit in the spec and contract.
