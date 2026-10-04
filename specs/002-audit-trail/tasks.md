# Tasks: Audit trail

Inputs: spec.md, plan.md, research.md, data-model.md, contracts/audit-api.md.
Tests required by constitution and SC-001/002. Remain on main.

## Phase 1: Setup
- [x] T001 Inspect repository, Stitch handoff, design.md, contracts and constitution; document research and discrepancies in specs/002-audit-trail/research.md (FR-009/011/012).
- [x] T002 Define and analyze spec/plan/model/contracts and tasks in specs/002-audit-trail/ (all FRs).

## Phase 2: Foundation and US3 — Accountable writes
- [x] T003 [US3] Write failing migration/atomicity/redaction/failure tests in backend/tests/test_audit.py (FR-001/002/008/011).
- [x] T004 [US3] Migrate backend/database.py and backend/schema.sql to audit schema4 preserving legacy data and enforcing append-only writes (FR-008).
- [x] T005 [US3] Add centralized writer/context/decorator in backend/audit.py and request failure handling in backend/audit_http.py (FR-001/002/011/012).
- [x] T006 [US3] Instrument backend/employee_store.py mutations; retain compensation reason metadata and capture allowance/previous-period diffs (FR-003).

## Phase 3: US4 — Export lifecycle
- [x] T007 [US4] Add export lifecycle and interrupted-delivery tests in backend/tests/test_audit.py (FR-004/007).
- [x] T008 [US4] Instrument backend/employee_store.py exports and backend/employee_api.py responses with correlated summary/employee request and completion events (FR-004).

## Phase 4: US1 — Global audit
- [x] T009 [US1] Add audit query/options/filter/pagination/date validation tests in backend/tests/test_audit.py (FR-005).
- [x] T010 [US1] Implement backend/audit_store.py, audit_api.py and main.py integration including filtered summary and CSV report (FR-005/007).
- [x] T011 [US1] Extract shared fetch/download helpers to frontend/src/lib/api.ts and add features/audit/api.ts contracts (FR-005/007).
- [x] T012 [US1] Build frontend/src/components/product/AuditTrail.tsx and AuditEventDetail.tsx with Coss filters/table, expansion, real metrics, states, export and responsive pagination (FR-005/007/009/010).
- [x] T013 [US1] Extend frontend/src/App.tsx navigation and URL-backed audit filters without new router (FR-005/009).

## Phase 5: US2 — Employee audit
- [x] T014 [US2] Add scoped employee query/association tests and endpoint in backend/audit_api.py (FR-006).
- [x] T015 [US2] Replace Activity in frontend/src/features/employees/EmployeeProfile.tsx with shared AuditTrail; refresh after writes/exports (FR-006/009/010).

## Phase 6: Verification
- [x] T016 Run backend unittest suite, frontend build/lint and resolve concrete regressions, updating existing tests for new intentional audit semantics (SC-001/002).
- [x] T017 Validate global/profile interactions, error/empty states and mobile layout against handoff in browser; record evidence in specs/002-audit-trail/verification.md (SC-003/FR-010).
- [x] T018 Document local identity limitation, implemented APIs, deferred integration points and run convergence against spec/plan/tasks (FR-011/012).

## Dependencies and delivery
T001–002 precede coding. T003 precedes T004–006. T007 precedes T008. T009 precedes T010. Backend contracts precede T011–013. T014 precedes T015. T016–018 follow implementation. Independent read/UI work could run in parallel, but this execution is sequential. No new packages or auth/administration workflows.

## Phase 7: Profile presentation correction (supersedes T015 presentation)
- [x] T019 [US2] Revise spec/plan for compact four-event profile timeline and employee-scoped Audit tab navigation (FR-006).
- [x] T020 [US2] Add EmployeeAuditCard with real data, semantic timeline and loading/error/empty states; replace embedded full profile trail (FR-006/009/010).
- [x] T021 [US2] Add exact URL-backed employee_id filter and Full audit log navigation; allow scope removal and global navigation (FR-005/006).
- [x] T022 Verify build/lint and browser profile/navigation/responsive behavior; update quickstart, README and verification evidence (SC-002/003).
