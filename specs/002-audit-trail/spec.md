# Feature Specification: Audit trail

**Feature**: `002-audit-trail` (remain on `main`)
**Created**: 2026-10-04
**Status**: Ready for implementation
**Input**: Implement Stitch S10 in the existing application and the employee profile, following the agreed audit behavior and design.md.

## User Scenarios & Testing

### US1 — Review actions centrally (P1)
HR opens Audit log, searches employee/name/code, actor or operation ID, filters action, actor, target type, outcome and UTC dates, and pages through newest-first records. Expand a record to see readable changed fields, reason, actor and outcome.

**Independent test**: Perform an employee edit and compensation change; find both with server filters and inspect only fields changed.

**Acceptance**:
1. Real records and filtered counts load; no mock metrics or fabricated attribution appears.
2. Pagination, search, filters and clear controls survive URL navigation/back.
3. Loading, empty, no-match and retryable error states work on desktop and mobile.

### US2 — Review an employee's actions (P1)
HR opens the employee profile and sees a compact Audit & Change Log timeline card beside Employee details. Full audit log opens the Audit tab scoped to that employee, separately from compensation history.

**Independent test**: Change one employee, export their compensation, and see their changes and both export stages without another employee's records.

**Acceptance**:
1. The profile card shows up to four newest real events with actor, action, concise context and UTC timestamp; related compensation and affected-employee export records are included.
2. The card refreshes after edits/exports and supports loading, empty and retryable error states. Full filters, pagination, comparisons and reports appear only on the Audit tab.
3. Full audit log navigates with the exact employee ID, resets other audit filters and pagination, and preserves the scope in the URL and report. Browser Back returns to the profile; removing the scope or opening the main Audit navigation returns to global activity.

### US3 — Capture accountable actions (P1)
Successful employee and compensation changes are recorded atomically with their data writes. Sensitive failures record an explanation without submitted values. Trusted automation can use SYSTEM through the central writer.

**Independent test**: Reject invalid and conflicting compensation operations; verify unchanged business data and safe failure records. Force success-audit failure; verify business rollback.

**Acceptance**:
1. Each event records actor, UTC timestamp, action, target, employee association where applicable, outcome and correlation ID.
2. Old/new values contain only changed business fields; credentials and other secrets are excluded.
3. Existing logs, compensation history and foreign keys survive migration. Logs cannot be updated or deleted through normal SQLite writes.

### US4 — Track and export reports (P2)
HR exports the employee directory, an employee's compensation, or the filtered audit report. The log records request and server response completion, with summaries and affected-employee associations for bulk exports.

**Independent test**: Export filtered employees, inspect both stages and correct employee membership, then simulate interrupted delivery and verify no completed event.

**Acceptance**:
1. Audit CSV respects the same filters, includes readable changes, and escapes spreadsheet formula cells.
2. Audit report snapshot excludes events caused by that same export, preventing recursive inclusion.
3. Completed means server response delivery finished; it does not claim a file was saved or opened.

## Requirements

- **FR-001**: Centralize event writing and operation lifecycle/failure recording; preserve existing transaction boundaries.
- **FR-002**: Capture actor, time, action, target, outcome, correlation, reason and changed-field old/new values; exclude secrets and submitted values on failure.
- **FR-003**: Instrument current employee creation/edit and compensation creation, including allowance changes and closing the preceding effective period.
- **FR-004**: Record export request/completion and affected employees; interrupted delivery must not produce completion.
- **FR-005**: Provide server search, filtering, deterministic pagination, real filter options and filtered summary counts.
- **FR-006**: Provide a compact four-event employee timeline on the profile with Full audit log navigation to the employee-scoped Audit tab; keep it distinct from compensation history.
- **FR-007**: Provide filtered CSV audit export with safe spreadsheet text and no recursive export inclusion.
- **FR-008**: Preserve historical data and support append-only, indefinitely retained audit events without edit/delete UI.
- **FR-009**: Use existing Coss primitives, tokens, fonts, icons and navigation conventions; migrate only the replaced profile Activity composition.
- **FR-010**: Provide responsive layout, accessible expansion/filter controls, validation, loading, error and empty states.
- **FR-011**: Continue without authentication using fixed local Admin for product operations and explicit SYSTEM for trusted technical processes; do not trust client-supplied actor IDs.
- **FR-012**: Establish a reusable writer for future imports, app-user changes and configuration actions without implementing those unrelated workflows.

### Key Entities
Audit event; operation (correlates stages and affected employees); actor (app_user); employee; changed field; filtered summary.

### Edge Cases
Empty legacy/new store; deleted/unresolvable legacy targets; no-op employee edits; 422 validation before services; unknown employee IDs; conflicts and SQLite failures; allowance removal; changed currency/frequency; date bounds; page beyond last; interrupted export; unsupported legacy payloads shown without inventing history.

## Success Criteria
- **SC-001**: Focused tests prove atomic writes, safe failures, legacy migration, append-only guards and export lifecycle.
- **SC-002**: Real API filtering/pagination and employee association tests pass; frontend build/lint pass.
- **SC-003**: Browser checks verify global and profile trails, expansion, filtering, pagination, empty/error behavior and mobile layout against S10 intent.

## Assumptions and scope
- “User profile” means existing employee profile; no account-profile screen exists.
- Authentication, role/country scoping and verified individual identity remain future work, explicitly excluded by the user. This is local development, not a production audit authorization model.
- S10's fake identities, crypto-ledger verification, integrity percentages, approvals and policy metrics have no backing implementation. Replace them with real activity, compensation, completed-export and failure counts.
- Do not create historical activity for seeded data. Preserve legacy logs with honest partial comparisons.
- Import, app-user and configuration mutation APIs are future integration points. The writer supports them; no invented workflows or temporary production mocks.
