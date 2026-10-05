# Implementation Plan: Compensation analytics

**Feature**: 003-compensation-analytics, existing branch | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

## Summary

Build the S07 analytics screen from real employee/package data. Compute one as-of cohort on the server and return exact summary, histogram, group and change data. Fix reporting to USD using one documented reference-rate set; keep missing coverage explicit. Render with Coss controls, Tooltip and Popover, and Recharts paired with an exact bin table.

## Technical Context

- **Language/Version**: Python 3.12, React 19, TypeScript 6
- **Primary Dependencies**: FastAPI/Pydantic, sqlite3, existing Coss/Base UI, Recharts (new)
- **Storage**: Existing SQLite compensation schema and version 5 fx_rate table; fixed Federal Reserve H.10 rates dated 2026-09-25 for the four supported non-USD currencies
- **Testing**: Python unittest contract/calculation/migration tests; frontend build/lint; browser desktop/mobile/keyboard checks
- **Target Platform**: Local Vite app and FastAPI service
- **Performance Goals**: Aggregate approximately 10,000 employees on server, return bounded chart/groups/change rows; no bulk employee payload
- **Constraints**: No authentication today; document that limitation outside the product UI. Never fabricate FX, sum unlike currencies, or imply actual cash paid. Compensation as-of selection does not select an FX date.

## Constitution Check

- I: Compensation commitment analysis only; no payroll or statutory calculation.
- II: Keep salary as integer minor units and pair metrics with currency; preserve package history.
- III: FX migration additive, FK/unique/positive constraints; export audited through existing writer.
- IV: Intended HR Admin/Manager/Read-only view, Admin/Manager export with future scope; current endpoints explicitly local-only until server authorization exists.
- V: Focused unittest for metrics, FX, dates, export and migration; frontend build/lint and browser comparison.
- VI: One analytics store/API pair and one feature screen/client. Recharts is user-requested and solves the histogram; no broader UI migration.

No constitutional exception. Production authorization and FX publishing remain prerequisites beyond this local screen. Recheck after implementation.

## Project Structure

- `backend/schema.sql`, `backend/database.py`, `backend/fx_reference.py`, `backend/seed_data.py`: additive FX storage, migration and sourced reference-rate insertion.
- `backend/analytics_store.py`, `backend/analytics_api.py`, `backend/main.py`: cohort calculation, validated query and export.
- `backend/employee_api.py`, `backend/employee_store.py`: optional as-of and location filtering for directory drill-down, preserving today's behavior by default.
- `backend/tests/test_analytics.py`: focused backend checks.
- `frontend/src/features/analytics/api.ts`, `AnalyticsScreen.tsx`: typed client, fixed USD controls, metrics, Recharts chart/table, groups, changes, methodology.
- `frontend/src/components/ui/{tooltip,popover}.tsx`: Coss overlay primitives for Partial reasons and card context.
- `frontend/src/components/ui/calendar.tsx` and `frontend/src/components/product/{DatePicker,DateRangePicker}.tsx`: Coss calendar/popover compositions shared by analytics, audit, directory, profile and employee forms.
- `frontend/src/App.tsx`: navigation, view state and drill-down.
- `frontend/src/features/employees/{api,EmployeeDirectory}.tsx`: display and pass the selected analytics as-of cohort when opened from a breakdown.
- `frontend/package.json`: Recharts dependency.
- `frontend/src/components/product/AuditTrail.tsx`, employee directory/profile/create/edit/package screens: replace native-only date controls while preserving string contracts and validation.
- Existing `frontend/src/components/ui` Coss Button, Card, Badge, Select, Input, Table, Skeleton, Empty and Sheet; no ShadCN component migration is needed.

## API inventory and contract

Reuse GET /api/employees/directory-options for country/department/role/status/location choices. GET /api/analytics/compensation and `/export` use the revised [contract](contracts/analytics-api.md): USD is fixed; the response includes the rate-set date and per-group exclusion reasons. No changes to employee write/detail APIs. Export reruns the same query and audits it. No admin FX mutation or production authorization endpoint is added.

## Delivery and verification

Implement additive schema and test migration. Add server cohort/FX/metric tests, then store and routes. Add typed frontend client, URL-backed Analytics view, filters, metrics, Recharts bar chart with table, group drill-down, changes and methodology. Verify calculations and responsive/keyboard/error states; run full unittest, build and lint; converge against spec/tasks. Follow [quickstart](quickstart.md).

Revision: move metric-card info actions into title rows, remove complete-coverage callout, and make cohort filters progressive in a Coss sheet. Install only the Coss Calendar dependency and compose reusable single/range date controls with the existing Popover and Button. Keep existing endpoint contracts and server validation; verify date selection, clearing, bounds, URL state and responsive overlays in browser.

Follow-up: remove native `type="date"` from both shared picker compositions. Use a single Coss Popover trigger per picker and optional plain-text ISO entry inside the popup; validate drafts before committing to forms or analytics queries. Put the long analytics introduction in a small title info popover with hover/tap access, and align methodology, export and directory actions as one right-side responsive group. No API or backend change.

Directory consistency pass: share one product-level title info popover between Analytics and Employees. Keep the Employees search visible, move existing directory selectors into the Coss Sheet, retain chips/result count/table display controls, and reuse existing directory-options, list and export API contracts. No backend work or broad component migration.

Fixed chart metric pass: remove the metric selector and `analytics_metric` URL state from Analytics, and make the chart/group label static. Drop the dynamic metric argument from the snapshot calculation; retain non-base metric summaries for the target-variable card and CSV. The HTTP boundary accepts only a legacy `metric=base` parameter and returns validation error for non-base requests. Update the contract and focused API test. No schema migration.
