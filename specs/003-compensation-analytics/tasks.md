# Tasks: Compensation analytics

Inputs: spec.md, plan.md, research.md, data-model.md, contracts/analytics-api.md. Remain on current branch.

## Phase 1: Setup and design

- [x] T001 Inspect Stitch screenshot/HTML, design.md, current React/Coss components, employee and audit APIs, schema and constitution; record deviations in research.md (FR-001/013).
- [x] T002 Create spec, checklist, plan, data model, API contract and quickstart under specs/003-compensation-analytics/ (all FRs).
- [x] T003 Analyze artifact consistency and correct material gaps, including directory as-of drill-down and metric-selected breakdowns, before further coding (all FRs).
- [x] T004 Add Recharts to frontend/package.json and lockfile; retain Coss/Base UI controls (FR-001/007).

## Phase 2: Foundation and US1 — annual base (P1)

- [x] T005 [US1] Write backend/tests/test_analytics.py cases for as-of employment, package gaps, annual/monthly/hourly, mean/median, date validation, empty and 10k-bounded response (FR-003/004/012).
- [x] T006 [US1] Implement cohort, effective-package, annualization, summary and distribution in backend/analytics_store.py (FR-003/004/007).
- [x] T007 [US1] Add validated GET /api/analytics/compensation in backend/analytics_api.py and register in backend/main.py (FR-002/003/004).
- [x] T008 [US1] Add typed frontend/src/features/analytics/api.ts client and URL-backed Analytics navigation/context in frontend/src/App.tsx (FR-001/002).
- [x] T009 [US1] Build frontend/src/features/analytics/AnalyticsScreen.tsx filters, metric cards, Recharts distribution and exact-value Coss table with loading/error/empty states (FR-001/002/004/007/012).

## Phase 3: US2 — FX, groups and methodology (P2)

- [x] T010 [US2] Write migration and conversion tests for approved dated rates, missing coverage, different decimal places, mixed-currency no-selection and group totals (FR-006/008/010).
- [x] T011 [US2] Add additive fx_rate schema version 5 in backend/schema.sql and migration in backend/database.py, preserving existing records (FR-006).
- [x] T012 [US2] Extend backend/analytics_store.py with Decimal conversions, per-component coverage, country/department/role breakdowns and provenance (FR-005/006/008/010).
- [x] T013 [US2] Extend backend/employee_api.py, employee_store.py and frontend employee query/URL state with optional as-of employed cohort/location, then finish responsive group table/drill-down and Coss methodology sheet in AnalyticsScreen.tsx (FR-008/010/012).

## Phase 4: US3 — changes and export (P3)

- [x] T014 [US3] Write package-change and CSV/audit tests in backend/tests/test_analytics.py (FR-009/011).
- [x] T015 [US3] Add bounded change projection and formula-safe, metadata-bearing analytics CSV export in backend/analytics_store.py and backend/analytics_api.py (FR-009/011).
- [x] T016 [US3] Add period controls, change section and export action/status in AnalyticsScreen.tsx (FR-009/011/012).

## Phase 5: Verification

- [x] T017 Run full backend unittest, frontend build/lint; resolve regressions and update schema-version assertions (SC-001/002/005).
- [x] T018 Compare rendered desktop/mobile screen and interactions to handoff, check keyboard/table/methodology and document evidence/deviations in specs/003-compensation-analytics/verification.md (SC-003/004).
- [x] T019 Run convergence against spec/plan/tasks and complete actionable gaps (all FRs).

## Dependencies

T001–003 before implementation. T005 before T006–007. T010 before T011–012. T014 before T015. API contract precedes frontend integration. Verification follows implementation. No separate branch, production authorization or FX admin mutation is included.

## Phase 6: Fixed USD and analytics copy revision

- [x] T020 Update S07 spec, plan, API contract and research for fixed USD, one dated H.10 rate set, contextual overlays and streamlined product copy.
- [x] T021 Add sourced reference-rate insertion for EUR/GBP/INR/SGD in backend/fx_reference.py and seed/migration paths; use the fixed set in analytics and reject non-USD reporting requests.
- [x] T022 Return per-group exclusion reasons and a fixed FX reference date; update backend calculation, conversion, export and regression tests.
- [x] T023 Add Coss Tooltip/Popover primitives, show Partial reasons on hover/focus and card context on info-icon click; leave one Methodology & FX notes button.
- [x] T024 Remove visible local-build/access-control copy from app shell and feature screens without changing backend authorization limitations.
- [x] T025 Verify build, lint, backend tests, desktop/mobile interactions and contract; update verification notes and run convergence.

## Phase 7: Filter and date-picker refinement

- [x] T026 Update S07 requirements/plan for compact filters, title-adjacent info controls, complete-status removal and shared Coss date-picker migration.
- [x] T027 Install Coss Calendar and compose reusable single-date/range pickers with Popover, ISO value conversion, bounds, clear behavior and accessible labels.
- [x] T028 Migrate Analytics as-of and changes range, Audit log range, and employee directory/profile/create/edit/compensation date controls to the shared Coss compositions.
- [x] T029 Replace flattened Analytics cohort controls with a Coss sheet, active-filter chips and preserved URL/API state; place metric-card info beside title and remove complete-coverage card.
- [ ] T030 Verify desktop/mobile and keyboard date/filter interactions, build/lint/backend checks; update verification and converge against revised spec.

## Phase 8: Single date-picker and header layout correction

- [x] T031 Remove native date controls from shared single/range pickers; keep Coss Calendar with validated plain-text ISO entry, bounds and required/clear behavior (FR-016).
- [x] T032 Move analytics introduction to a title info overlay, and group methodology/export/directory actions at the header right across viewport sizes (FR-016).
- [ ] T033 Verify build/lint, date control source inventory and interaction behavior; update verification and remaining tasks (FR-015/016, SC-004).

## Phase 9: Employee directory consistency

- [x] T034 Share a title info popover and move the Employees long header description into it (FR-017).
- [x] T035 Keep directory search visible; move detailed filters into a Coss sheet and retain readable active chips, clear-all, result count, URL state, paging and export (FR-017).
- [ ] T036 Verify build/lint/backend checks and inspect directory interactions at desktop/mobile widths; update verification (FR-017, SC-004).

## Phase 10: Fixed annualized-base chart and groups

- [x] T037 Update the spec/plan/API contract for a fixed annualized-base chart and breakdown, retaining independent summary metrics (FR-018).
- [x] T038 Remove selectable metric UI and URL/client query state; show only Annualized base salary as chart/group context (FR-018).
- [x] T039 Fix backend distribution and breakdown to base, reject non-base legacy query values and add focused contract coverage (FR-018).
- [x] T040 Run backend/frontend checks, verify no selectable metric path remains and update verification (FR-018).
