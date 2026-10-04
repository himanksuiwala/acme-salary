# Tasks: Employee Compensation API

**Input**: `specs/001-employee-compensation-api/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/employee-compensation-api.md`

**Tests**: Required by Constitution V; use `unittest` and temporary databases.

## Phase 1: Setup

- [x] T001 Verify existing SQLite schema v3, connection, reference codes and seeded actor assumptions in `backend/schema.sql`, `backend/database.py`, and `backend/seed_data.py`; preserve existing records and make no schema migration.

## Phase 2: Foundational

- [x] T002 Create shared response shaping and local-development API router scaffold in `backend/employee_api.py` and SQL connection/query helpers in `backend/employee_store.py`; integrate router into `backend/main.py` without changing `/api/health`.

## Phase 3: User Story 1 - Find employees (P1)

**Independent test**: Search, combine filters, paginate and verify total/order on a temporary database.

- [x] T003 [US1] Write failing `unittest` coverage in `backend/tests/test_employee_api.py` for FR-001 through FR-004: code/name partial case-insensitive search, exact country/department/job-title/status filters combined by AND, default 20/max 100, invalid pagination, empty and out-of-range pages, stable code order.
- [x] T004 [US1] Implement parameterized count/page queries and employee summary projection in `backend/employee_store.py` for FR-001 through FR-004, including LIKE escaping and deterministic code/ID order.
- [x] T005 [US1] Implement `GET /api/employees` validation and response in `backend/employee_api.py` for FR-001 through FR-004; make T003 pass.

## Phase 4: User Story 2 - Review compensation (P2)

**Independent test**: Read a past/current/future package and an employee with none.

- [x] T006 [US2] Write failing `unittest` coverage in `backend/tests/test_employee_api.py` for FR-005 and FR-006: employee summary, package amounts/currency/frequency/dates/allowances, UTC current/history/scheduled classification, gaps, absent employee and absent compensation.
- [x] T007 [US2] Implement package and allowance reads plus audit reason lookup in `backend/employee_store.py` for FR-005 and FR-006.
- [x] T008 [US2] Implement `GET /api/employees/{employee_id}/compensation` and 404 mapping in `backend/employee_api.py`; make T006 pass.

## Phase 5: User Story 3 - Record compensation change (P3)

**Independent test**: Add a new package, inspect old and new versions/audit, then verify rejected changes leave all counts unchanged.

- [x] T009 [US3] Write failing `unittest` coverage in `backend/tests/test_employee_api.py` for FR-007 through FR-010: strict nonnegative integer minor units, required reason, valid frequency/date/reference codes, distinct allowance types, first and later packages, current/future updates, preserved old values/allowances, audit attribution, conflict and rollback.
- [x] T010 [US3] Implement atomic compensation versioning and audit in `backend/employee_store.py` for FR-007 through FR-010 using `BEGIN IMMEDIATE`, close-only prior period, reference checks, overlap handling and rollback.
- [x] T011 [US3] Implement strict request validation and `POST /api/employees/{employee_id}/compensation` with 201/404/409/422 mapping in `backend/employee_api.py`; make T009 pass.

## Phase 6: Polish and validation

- [x] T012 Document endpoint usage, the fixed audit actor and the local-only no-auth boundary for FR-011 and FR-012 in `README.md` and endpoint descriptions in `backend/employee_api.py`.
- [x] T013 Run the full backend test command and validate seeded-list/detail shape per SC-001 through SC-005 using `backend/tests/test_employee_api.py` and `specs/001-employee-compensation-api/quickstart.md`.

## Dependencies and execution order

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013. Tests are written before the corresponding implementation and confirmed to fail. No parallel tasks are marked because stories share the same API, store and test files.

MVP scope: Phase 3 alone gives searchable employee discovery. Phases 4 and 5 complete the requested API.
