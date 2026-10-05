# Compensation analytics verification

Verified on 2026-10-05 against Stitch screen `a55e1594b20b48b9b5c4e54034d546d5`, `design.md`, and `product-ux-spec.md` S07.

## Evidence

- `backend/.venv/bin/python -m unittest discover -s backend/tests -q`: 41 tests passed. Focused cases cover as-of employment, annual and monthly pay, hourly/no-package exclusions, fixed USD conversion with a sourced H.10 rate set, missing reference rates, currency precision, median, group-specific exclusions, breakdown/changes, directory drill-down, CSV/audit, v4→v5 migration, empty cohorts, and a 10,000-record cohort with a bounded response.
- `npm --prefix frontend run build`: passed. Analytics and Recharts are loaded as a separate route chunk. Vite still reports the pre-existing base bundle above 500 kB.
- `npm --prefix frontend run lint`: passed with three existing Fast Refresh warnings in Coss UI files (`button.tsx`, `badge.tsx`, `select.tsx`). `git diff --check`: passed.
- Safari live preview with a disposable 50-employee SQLite database: all five seeded currencies contribute to USD totals without a currency picker. The four KPI cards, Recharts bars/exact bin table, and country breakdown render from API data. The base metric has complete 50-person coverage; variable pay is Partial with 30 unspecified values. A keyboard-focused Partial badge showed the precise reason/count, and the base-spend info icon opened the former inline detail text. The single Methodology & FX Notes button opened a sheet with fixed rate date/source, conversion notes and rates. Safari responsive mode at 320 px showed stacked controls and reachable actions; prior 390 px/320 px chart and horizontally scrollable table checks remain applicable.
- Selected the variable metric with keyboard typing and Return in the Coss Select. The URL and group coverage updated; each country row reported six excluded employees. Earlier browser Back/context check remains applicable.

## Handoff comparison and intentional deviations

- Retained the existing ACME shell, Inter/Neutral design system, Phosphor icons, Coss/Base UI controls, and API contracts. The handoff's sample employee count, totals, names, FX coverage, and alert text are illustrative; all screen values come from the backend.
- Used Recharts directly with a Coss exact-value table. This satisfies the user's charting requirement without introducing a new ShadCN Chart wrapper.
- Exposed a separate compensation-changes section because S07 requires period changes; the handoff primarily emphasizes summary and distribution.
- USD is fixed for analytics, with one approved 2026-09-25 H.10 reference-rate set for seeded EUR, GBP, INR and SGD. An as-of date selects compensation packages; it does not select a different FX date. New currencies without this set still show honest Partial exclusions.

## Limits and follow-up

- This repository has no authentication, role checks, salary scope, or authenticated export. All salary endpoints remain local-development only; production deployment requires enforcement across the existing API, not just this screen.
- `fx_rate` storage and read policy are implemented. Admin entry/import, review, approval and rate governance remain separate work under S10.
- Historical department, role, country, and location membership cannot be reconstructed from the present schema; grouping uses current stored attributes and discloses that fact.
- A large export is generated synchronously by the existing CSV pattern. Background jobs, expiry, and authenticated downloads belong to S09.

## Filter and date-picker refinement (2026-10-05)

- The summary-card info control is in the title row. The complete-coverage banner is absent; only incomplete metric coverage produces the Partial callout. Analytics shows as-of, metric, and a Filters action; cohort controls are in a Coss sheet and active values appear as removable chips.
- Added the Coss Calendar and shared single-date/range compositions. Analytics, Audit log, directory, employee profile, create/edit employee, and compensation effective-date fields use them. Both preserve ISO API values, date limits and direct date entry; the later correction below removed native date inputs from the compositions.
- `npm run build` and `npm run lint` passed. Lint reports only the three existing Fast Refresh warnings in Coss `badge.tsx`, `button.tsx`, and `select.tsx`. All 41 backend unit tests passed; `git diff --check` passed.
- Live browser interaction for this revision remains unverified. The computer-use reviewer rejected inspection of the active Safari window because it displayed an unrelated private page. No other supported browser surface was available. T030 remains open for desktop/mobile and keyboard interaction checks once a safe local preview surface is available. The earlier live-preview evidence above applies to the previous dashboard layout only.
- Spec Kit convergence against FR-001–015, SC-001–005, the plan, tasks and constitution found no further application-code gap in this revision. The existing T030 records the remaining verification work, so no duplicate convergence task was appended.

## Single-picker and header correction (2026-10-05)

- The provided dashboard screenshot showed the native date field beside the Coss calendar. Both shared picker compositions now contain only a Coss trigger/calendar and optional plain-text `YYYY-MM-DD` entry inside the popover. Typed drafts are checked for valid dates, order and bounds before they reach URL state or API requests. Create Employee now explicitly validates its required joining date on submit.
- The analytics introduction sits in a title-adjacent info popover, openable by mouse hover or trigger press. Methodology, Export snapshot and View employees are one right-side action group: one row at wide widths, a 1-over-2 grid at intermediate widths, and a stack at narrow widths.
- `rg` found no `type="date"` in `frontend/src`; `npm run build` and `npm run lint` passed, with only the three existing Fast Refresh warnings. All 41 backend tests and `git diff --check` passed.
- Desktop/mobile and keyboard interaction checks are still pending because the computer-use reviewer previously rejected inspecting the active Safari window, which displayed an unrelated private page. T030 and T033 remain open for this live check.

## Employee directory consistency (2026-10-05)

- The Employees header now uses the shared `ContextInfo` control also used by Analytics. Its longer currency/as-of explanation opens on mouse hover or trigger press, leaving a short title row.
- Search stays visible. Country, department, role, status, package, location and as-of selectors are in a Coss Sheet. Removable chips use readable option names; clear-all, URL-backed query updates, result count, page size, table display controls and export remain available. Clearing as-of also clears the employed-as-of population flag.
- Frontend build and lint passed (three existing Coss Fast Refresh warnings). All 41 backend tests and `git diff --check` passed. Desktop/mobile and keyboard interaction checks remain T036, pending a safe local browser surface for computer-use verification.

## Fixed chart and group metric (2026-10-05)

- The chart/group selector and `analytics_metric` URL/client state were removed. The filter bar displays only “Annualized Base Salary”; the distribution, country/department/role breakdowns, partial coverage and methodology now always use `metrics.base`.
- Backend `snapshot` no longer chooses a metric dynamically. Other metric summaries remain for the target-variable card and CSV. The HTTP boundary accepts deprecated `metric=base` and rejects non-base values with 422; the CSV no longer includes a metric filter row.
- All 41 backend tests passed, including the legacy-query contract check. Frontend build/lint and `git diff --check` passed. A source search found no remaining frontend metric-selection state or dynamic backend lookup. Earlier variable-metric browser evidence above describes the superseded UI; live visual QA of the current UI remains pending with T030/T033/T036.

## Date-range selection correction (2026-10-05)

- The shared Coss range picker now starts a new range on the first calendar click and commits it on the second. Typed ISO dates still use Apply after validation. This affects Analytics compensation changes and the Audit log.
- A focused reproduction against the installed DayPicker range algorithm showed that selecting 2–4 Oct from an existing 1–5 Oct range previously retained 1 Oct as the start. With `resetOnSelect`, the same sequence yields 2–4 Oct. An API probe confirmed the period parameters change compensation-change results (four January starts versus zero October starts in the test fixture).
- Frontend build and lint passed. Live pointer and keyboard interaction remains unverified because no supported local browser surface was available; T030/T033/T036 still cover that check.
