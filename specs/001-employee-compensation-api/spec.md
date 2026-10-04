# Feature Specification: Employee Compensation API

**Feature Branch**: `main` (feature artifacts: `specs/001-employee-compensation-api`)

**Created**: 2026-10-04

**Status**: Implemented

**Input**: Employee list with search, filters and backend pagination; compensation detail with current, scheduled and historical packages; one atomic request to create a complete new compensation package while preserving history.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find employees (Priority: P1)

An HR user searches employee names or codes, narrows the results by country, department, job title and status, and pages through the matching employees.

**Why this priority**: Finding the right employee is the entry point for salary review.

**Independent Test**: Search and filter a populated employee directory, then verify page boundaries and the total count.

**Acceptance Scenarios**:

1. **Given** employees in multiple countries and departments, **when** the user combines country and department filters, **then** only employees matching both appear.
2. **Given** an employee named Ana Singh with code EMP001, **when** the user searches `ana` or `emp001`, **then** that employee appears regardless of letter case.
3. **Given** more than 20 matching employees, **when** the user requests pages one and two, **then** each page contains at most 20 distinct employees in employee-code order and both responses report the same total count.

---

### User Story 2 - Review compensation (Priority: P2)

An HR user opens an employee's compensation detail and sees the employee summary, the package effective today, scheduled packages, past packages, and each package's allowances.

**Why this priority**: A user needs accurate context before proposing a change.

**Independent Test**: Retrieve an employee with past, current and future packages and verify the current package is the one effective today.

**Acceptance Scenarios**:

1. **Given** a current package and a future raise, **when** the user opens the detail, **then** the current salary is the amount effective today and the raise appears under scheduled compensation.
2. **Given** a prior package with allowances, **when** the user opens the detail, **then** its salary, currency, pay frequency, effective dates and allowances remain visible in history.
3. **Given** an employee without compensation, **when** the user opens the detail, **then** the employee summary appears with no current package and empty history and scheduled lists.

---

### User Story 3 - Record a compensation change (Priority: P3)

An HR user submits a complete new package with salary, currency, pay frequency, desired allowances, effective-from date and reason. The previous package remains available as history, and the change is attributable to the existing normal user.

**Why this priority**: Compensation changes must be coherent and traceable.

**Independent Test**: Create a future package, verify the prior period closes immediately before it begins, inspect both package versions and confirm one audit entry records the reason and actor.

**Acceptance Scenarios**:

1. **Given** an open current package, **when** a valid complete package is submitted with a later effective date, **then** the prior package ends the day before that date and the new package contains exactly the submitted allowances.
2. **Given** an attempted change with an invalid amount, unknown currency or allowance type, duplicate allowance type, or overlapping effective date, **when** it is submitted, **then** no package, allowance or audit change is committed.
3. **Given** an accepted change, **when** the user reviews history, **then** the earlier salary and allowances still appear and the new package shows the change reason.

### Edge Cases

- Search with no matches returns an empty page and zero total; a page beyond the end returns an empty page with the true total.
- Invalid page numbers and page sizes are rejected. The default page size is 20 and the maximum is 100.
- Employee detail and compensation changes for an unknown numeric employee ID return not found.
- A period ending today is current today; a period starting tomorrow is scheduled today.
- A compensation gap has no current package. Existing past and scheduled packages remain visible.
- A second change on the same effective-from date, or a change earlier than the latest package start, is rejected without altering history.
- Concurrent changes to one employee cannot create overlapping periods or partially saved packages.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST list employees with summary fields: numeric ID, employee code, name, job title, status, country, department and location.
- **FR-002**: The list MUST support a case-insensitive partial search across first name, last name, combined name and employee code. Numeric database IDs are used for direct lookup, not list search.
- **FR-003**: The list MUST support exact, case-insensitive country-code, department-code, job-title and status filters; supplied filters combine with AND.
- **FR-004**: The list MUST paginate on the server using one-based page numbers, default size 20, maximum size 100, and return page, page size, total count and results ordered by employee code.
- **FR-005**: The system MUST return an employee summary and all compensation packages with integer minor-unit amounts, currency and pay frequency, effective dates, allowances, and available change reason.
- **FR-006**: The detail MUST designate as current only the package whose inclusive effective period contains the current date; earlier packages are history and later packages are scheduled. No matching package means current is empty.
- **FR-007**: A compensation change MUST submit a complete new package in one operation: base pay, optional variable pay, currency, pay frequency, effective-from date, nonempty reason, and the complete desired allowance list.
- **FR-008**: Accepted changes MUST create a new package and new allowance rows; they MUST NOT overwrite prior pay amounts or prior allowances. The preceding package may have its end date set to the day before the new package starts.
- **FR-009**: A change MUST be atomic, preserve non-overlapping inclusive periods, and reject unknown references, negative or non-integer money, duplicate allowance types, invalid dates and conflicts without partial writes.
- **FR-010**: Each accepted change MUST record one audit event attributed to `Admin@acme.org`, including the reason and before/after package details. Failed changes MUST leave no audit event.
- **FR-011**: The read and write salary operations are intended for HR platform users. The `SYSTEM` actor is reserved for automated configuration work. Since authentication and authorization are absent, these endpoints MUST be documented as local development only and MUST NOT be represented as production-ready.
- **FR-012**: This feature MUST provide REST endpoints only; React integration, login, payroll, tax calculation and retroactive correction of existing compensation records are outside its scope.

### Key Entities

- **Employee**: Person identified by employee code, with department, location/country, job title and status.
- **Compensation package**: A dated version of base pay, optional variable pay, currency and frequency for one employee.
- **Allowance**: A typed amount and frequency belonging to one compensation package; currency is inherited from the package.
- **Audit event**: Attribution and reason for an accepted compensation change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can locate a seeded employee by name or code and narrow a 50-person directory by every requested filter using no more than one list request per search or page action.
- **SC-002**: For 10,000 employees, each list response contains no more than 100 records and a correct total count; the same query yields stable page ordering.
- **SC-003**: For every employee with a package effective today, the detail identifies exactly that package as current and keeps all past and scheduled packages accessible.
- **SC-004**: Every accepted change creates one new version and one audit event; rejected changes leave zero partial records or overlapping periods.
- **SC-005**: The three user journeys are covered by automated backend checks that pass on a clean database and on the existing seeded-data shape.

## Assumptions

- The API runs locally for development. A later authentication feature will enforce HR access before production use; `Admin@acme.org` attribution is temporary and does not identify an authenticated caller.
- Country and department filters use stable codes, while role means the employee's job title. Status and job title values come from existing employee data.
- Effective dates are calendar dates. New changes may start today or later; retrospective changes and in-place corrections are deferred. A first package for an employee without compensation may start on or after the employee's joining date.
- A new package must start after the latest existing package start. The full submitted allowance list replaces the prior package's list for the new version; an omitted allowance is removed from the new version only.
- Supported pay frequencies are ANNUAL, MONTHLY and HOURLY; allowance frequencies use the same set. Currency and allowance type must already exist in reference tables.
