# Implementation Plan: Audit trail

**Feature**: 002-audit-trail, existing main branch | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

## Summary
Implement real global and employee audit views following S10 layout intent and design.md. Centralize audit writes, use service decorators for lifecycle/failures, keep successful audit writes in the business transaction, and record export completion after ASGI delivery. Reuse local Coss primitives and fetch/history conventions.

## Technical Context
- Python/FastAPI/sqlite3; existing venv and unittest, no new dependencies.
- React 19/TypeScript/Vite/Tailwind 4, local Coss/Base UI, Inter and Phosphor.
- SQLite schema version 4 migration preserves legacy audit IDs/payloads, employee records, FK relationships and compensation periods.
- Paginated audit query maximum 100 rows; indexed employee/timestamp, action and actor filters. Dates are UTC inclusive calendar days. Stable newest-first ordering by timestamp then ID.
- Local development with 50 seeded employees; authentication explicitly deferred by user.

## Constitution Check
I Scope: employee/compensation governance only; no payroll, policy engine or unrelated admin features.
II Money/history: integer minor units retained; diff metadata carries historical currency decimals/frequency; preceding period closure captured.
III Integrity: atomic success writes; failure writes after rollback; migration preserves existing data; append-only guards.
IV Access: user explicitly deferred authentication; fixed local Admin is labeled as such. Future HR/Admin read/report permissions and employee country scope require auth implementation before deployment.
V Evidence: focused unittest tests, build/lint, browser checks, then converge.
VI Simplicity: no ORM/router/query framework added. Central writer removes duplicated SQL; shared audit contracts serve the global view and compact profile preview.

All gates pass with the documented existing local-development access limitation; no architecture exception needed. Rechecked after model/contracts.

## Project Structure and touch points
- backend/audit.py: event writer, context, diffs, decorator, export stages.
- backend/audit_http.py: request identity/context, validation failures and response delivery.
- backend/audit_store.py, backend/audit_api.py: query/read model, options, scoped routes and CSV export.
- backend/database.py, schema.sql: version 4 migration and indexes/guards.
- backend/employee_store.py, employee_api.py, main.py: instrumentation and integration.
- backend/tests/test_audit.py plus existing tests: migration, atomicity, safe failures, queries and export lifecycle.
- frontend/src/lib/api.ts: shared existing error/parser/download behavior.
- frontend/src/features/audit/{api,format}.ts: service contracts, query serialization and display helpers.
- frontend/src/components/product/{AuditTrail,AuditEventDetail,EmployeeAuditCard}.tsx: shared Coss product composition for filters, table/mobile rows, comparisons, metrics and report.
- frontend/src/App.tsx: Audit log navigation and URL-backed state.
- frontend/src/features/employees/EmployeeProfile.tsx: show a compact four-event EmployeeAuditCard beside Employee details, refreshing after writes/exports. Full audit log navigates through App.tsx to URL-backed exact employee_id scope; the main Audit navigation clears that scope.

## Reuse and migration
Table, Select, Sheet, Button, Badge, Input, Empty, Skeleton and Pagination are already Coss. No component installation or new ShadCN primitive. Existing legacy Card outside the replaced Activity composition remains unchanged. Reuse the existing history router and fetch/download implementation.

## API inventory
Reuse existing employee list/options/detail, writes and exports. Extend writes/exports with central audit recording; preserve payload contracts. Existing detail activity stays compatible but is no longer the profile UI source. Add audit list/options/export and employee audit endpoint per contracts/audit-api.md. No import/account/config mutation APIs exist; central writer is their integration point.

## Delivery and verification
First establish schema/writer and focused failing tests. Instrument writes, failures and exports. Add read/export APIs. Build shared UI and navigation/profile integration. Run full existing tests, build/lint, browser interaction/responsive checks. Compare against handoff, run convergence and record results in verification.md.
