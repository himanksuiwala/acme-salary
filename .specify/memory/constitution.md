# Employee Salary Management Constitution

## Core Principles

### I. Compensation Management Scope

Features MUST serve employee and compensation management as described in the
project README. Payroll execution, tax calculations, an allowance policy
engine, and broader HRMS functions remain outside the initial scope. A proposal to
add any of these MUST update the requirements and receive an explicit scope decision
before implementation. This keeps the system focused on the stated problem.

### II. Accurate Money and History

Money MUST be stored as integer amounts in the currency's smallest unit and paired
with its currency. Compensation changes MUST preserve prior effective periods rather
than overwrite history. Plans and tests for compensation changes MUST address
currency, pay frequency, effective dates, and period overlap. These rules protect
reporting accuracy and the meaning of historical pay records.

### III. Data Integrity and Traceability

Database changes MUST preserve existing records and enforce relevant foreign keys,
uniqueness, and non-overlapping compensation periods. Mutations of compensation
and other sensitive records MUST have an accountable actor and an audit trail when
those workflows are implemented. Migration plans MUST explain how existing data
remains valid. This keeps changes reviewable and prevents conflicting records.

### IV. Least-Privilege Salary Access

Features that expose or change salary data MUST define the authorized roles and
their permitted actions before implementation. Authentication and role-based access
are planned capabilities; the current starter does not provide them. Until they
exist, new salary endpoints MUST NOT be treated as production-ready merely because
the database has user rows. This reflects the sensitivity of compensation data.

### V. Evidence for Behavior Changes

Each implementation plan MUST name observable acceptance criteria and verification
for the behavior it changes. Backend schema or API changes MUST include focused
automated checks using the repository's `unittest` conventions. Frontend changes
MUST pass the existing build and lint commands. Reviews MUST compare the resulting
behavior with the feature spec and record any unresolved gaps.

## Project Constraints

The current stack is FastAPI, SQLite, and Vite with React and TypeScript. Plans
MUST start from the code and schema in this repository and explain any dependency
or architectural change. The README gives the shared product context; local
requirements and database design in `artifacts/` provide more detail when
available. The implementation and tests establish current behavior. A feature
spec MUST state where planned and current behavior differ.

## Development Workflow

All feature work MUST remain on the currently checked-out branch. The workflow
MUST NOT create or switch to a separate branch for each feature; the feature's
`specs/` directory identifies its artifacts. For a bounded feature, create
`spec.md`, resolve material ambiguity, then produce `plan.md` and `tasks.md`
before implementation. Use Spec Kit analysis when artifacts need a consistency
check, and convergence after implementation to record remaining
gaps. Review generated artifacts as decisions, not as authority over observed code.
Run relevant checks before marking tasks complete: backend
`backend/.venv/bin/python -m unittest discover -s backend/tests -v`, frontend
`npm --prefix frontend run build`, and frontend `npm --prefix frontend run lint`.

## Governance

Feature specs and plans MUST comply with these principles. A proposed exception
MUST be documented in the relevant plan with its reason and review outcome.
Amendments MUST explain the affected principles and be reviewed with the change
that needs them. Use semantic versioning for this document: major for removed or
redefined principles, minor for added or materially expanded rules, and patch for
clarifications. Review compliance and any exceptions when accepting a feature.

**Version**: 1.0.1 | **Ratified**: 2026-10-04 | **Last Amended**: 2026-10-04
