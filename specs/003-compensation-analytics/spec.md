# Feature Specification: Compensation analytics

**Feature**: 003-compensation-analytics, current branch  
**Created**: 2026-10-05  
**Status**: Ready for planning  
**Input**: Implement Stitch S07, project 8193819572232154049, screen a55e1594b20b48b9b5c4e54034d546d5, in the existing app. Use Recharts.

## User Scenarios & Testing

### User Story 1 — Understand annual base compensation (P1)

An HR user selects an as-of date and cohort, then sees headcount, estimated annual base spend, average, median, exclusions, and salary distribution. Every figure states currency, date, population and calculation status.

**Independent test**: Compare a one-currency cohort containing annual, monthly, hourly and missing packages against stored values.

**Acceptance Scenarios**:

1. Given annual and monthly base pay, when analytics loads, then annual and monthly × 12 are included; hourly and missing packages are counted but excluded from annualized money.
2. Given date and cohort filters, when a control changes, then USD metrics, chart, breakdown and directory drill-down use the same context and survive URL refresh.
3. Given no employees or computable packages, then a specific empty/unavailable state appears instead of a misleading zero.

### User Story 2 — Compare groups and inspect methods (P2)

An HR user compares country, department and role groups, exact distribution bins, FX provenance and exclusion reasons; each group links to a filtered directory.

**Independent test**: In a mixed-currency cohort with a missing rate, verify Partial totals, affected currencies/counts, and agreement between chart and table.

**Acceptance Scenarios**:

1. Every cohort reports in USD using the same dated reference-rate set, and no control can switch the dashboard to native or another reporting currency.
2. Eligible conversion uses the documented reference rate even when the compensation as-of date differs; the interface displays the FX date, source and method.
3. A missing rate excludes affected records and labels converted money Partial.
4. Each chart has an exact-value data table for keyboard and screen-reader use.

### User Story 3 — Review changes and export the answer (P3)

An HR user sees recorded package starts in a chosen period and exports the filtered snapshot with definitions and caveats.

**Independent test**: Add two versions, then inspect period changes, exported CSV metadata and audit entry.

**Acceptance Scenarios**:

1. A package start shows employee, effective date, before/after base and percentage only when currency and frequency match.
2. Export includes generation time, date, filters, currency basis, FX provenance, exclusions, definitions, breakdown and distribution; it is audited.

### Edge Cases

- Default cohort uses joining/termination dates, not current status; status is an optional further filter.
- A package gap stays a gap; past pay is never treated as current.
- Missing variable differs from zero. Hourly components cannot be annualized without annual hours.
- Grouping uses attributes stored now; historical membership cannot be reconstructed.
- Conversion and annualization must avoid silent binary floating-point rounding or overflow.

## Requirements

### Functional Requirements

- **FR-001**: Add Analytics navigation and a responsive screen with context/filters, status, metrics, distribution, breakdown, changes and methodology.
- **FR-002**: Support UTC as-of date, country, department, role, status, location and metric controls; fix the analytics reporting currency to USD, keep context in the URL and allow clear filters.
- **FR-003**: Default population is employed as of selected date; show distinct employee and exclusion counts.
- **FR-004**: Annualize annual and monthly effective base only; compute sum, mean and median on the same included values and count hourly/missing-package exclusions.
- **FR-005**: Show target variable and allowances separately, normalize only valid components, and label all compensation amounts as commitments/targets, never cash paid.
- **FR-006**: Convert all analytics amounts to USD with one dated, source-backed reference-rate set for supported currencies. Apply the same rate set across compensation as-of dates. Missing coverage causes Partial status with affected currencies/counts; never silently add unlike currencies.
- **FR-007**: Show a Recharts salary distribution and exact bin table, including boundaries, count, currency, date and exclusions.
- **FR-008**: Show country, department and role breakdowns using current attributes, with count, sum, average, median, exclusions and directory drill-down preserving as-of cohort and applicable filters.
- **FR-009**: Show package starts in a selected period, with percentage only for comparable currency/frequency.
- **FR-010**: One Methodology & FX notes button opens formulas, cohort, current-attribute caveat, conversion policy, rate provenance and exclusions. Partial badges show metric-specific exclusion reasons on hover/focus; card info icons reveal card context on click.
- **FR-011**: Export a formula-safe CSV snapshot with metadata and audit trail.
- **FR-012**: Provide loading, empty, partial, validation and service-error states with retry; controls remain keyboard operable and responsive.
- **FR-013**: Keep the local-development and missing-authorization limitation explicit in technical documentation and API descriptions until real authentication, role and scope enforcement exists; avoid repetitive development notices in product UI.
- **FR-014**: Put summary-card info controls beside their titles and omit a standalone complete-coverage callout. Show only as-of, metric and an advanced-filters action by default; retain applied cohort filters as removable chips and in the URL.
- **FR-015**: Use Coss Calendar and Popover date-picker composition for existing single-date and date-range controls across Analytics, Audit log and employee flows. Preserve ISO date API values, UTC labels, keyboard access, date bounds, clearing and form validation.
- **FR-016**: A date control opens only the Coss calendar, with no browser-native date picker. Preserve typed date entry through plain text fields in the Coss popup, validate before applying, and keep the committed date unchanged while a draft is incomplete. Move the analytics header description into a title-adjacent info popover that can open by hover or tap; group the header actions together on the right, with responsive wrapping.

### Key Entities

- **Analytics cohort**: Employees employed on a selected date with optional filters using attributes stored now.
- **Effective package**: Base, optional target variable, currency/frequency, allowances and inclusive period.
- **FX rate**: Approved source/target conversion with date and provenance.
- **Analytics snapshot**: Metrics, groups, bins, changes, exclusions, filters, currency and generation time.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Displayed/exported sums, mean, median, bin counts and exclusions match focused source records.
- **SC-002**: Every analytics money metric is expressed in USD, Partial with exact exclusion reasons or complete with rate provenance; changing compensation as-of date does not change the fixed FX reference date.
- **SC-003**: A refreshed URL reproduces the context; chart values have a table; group drill-down keeps the cohort.
- **SC-004**: The screen works at 320 px and desktop width with keyboard-accessible controls, chart alternative and recovery.
- **SC-005**: Approximately 10,000 records are aggregated server-side without fetching them all into the browser.

## Assumptions

- Existing app lacks authentication/scope. Intended production roles: HR Admin, scoped HR Manager and scoped Read-only; only the first two can export once authorization exists.
- The fixed, sourced FX reference set is read-only here. Publishing/admin workflows are separate; no production rate is invented.
- USD is fixed for analytics; compensation as-of date and FX reference date are distinct and both are disclosed.
- Stitch totals, FX percentages, dates, named people, notification and trend badges are illustrative; actual data comes from the repository.
- No payroll, statutory calculation or historical organization-attribute storage is added.
