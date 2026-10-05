# Employee Salary Management

This starter connects a FastAPI backend, a SQLite database, and a Vite React/TypeScript frontend. The [requirements](artifacts/requirements.md) and [database design](artifacts/db-schema-design.md) describe the planned salary-management features. The app includes a live employee directory, employee creation and editing, CSV exports, an as-of compensation profile, and a reviewed versioned-compensation form.

The [product UX specification](specs/product-ux-spec.md) describes the target screens, access model, salary and analytics rules, and end-to-end HR workflows. It also identifies which experiences are not yet implemented.

The [interface design system](design.md) defines the visual and component direction for those screens: Inter, Phosphor icons, shadcn/ui and Coss UI components, and a Tailwind Neutral palette.

## Requirements

- Python 3.12
- Node.js 22 and npm

## Install

From the repository root:

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

The backend uses `backend/data/app.db` by default. Copy `backend/.env.example` to `backend/.env` and set a random `JWT_SECRET_KEY` of at least 32 bytes plus `JWT_ACCESS_MINUTES` (30 is the suggested value). For a new database, also set `AUTH_BOOTSTRAP_EMAIL` and `AUTH_BOOTSTRAP_PASSWORD` to create the first admin. Relative database paths are resolved from `backend/`. The virtual environment, `.env`, and SQLite database are ignored by Git.

The API initializes a fresh database on startup. To initialize it without starting the API, run:

```bash
backend/.venv/bin/python -m backend.init_db
```

Initialization is safe to repeat and migrates existing databases through schema version 7 without removing users or audit records. Existing plaintext passwords are converted to Argon2 hashes and the plaintext column is removed. Existing HR roles become `HR`; the system administrator becomes `ADMIN`. Existing accounts keep their email addresses and passwords. A new database starts with only the environment-configured bootstrap admin; other business tables start empty.

`POST /auth/login` accepts JSON `{"email":"…","password":"…"}` and returns a short-lived JWT access token. `GET /auth/me` resolves the active account from that token. The frontend keeps the token in tab session storage, sends it as `Authorization: Bearer <token>`, and returns to sign-in on a 401 response or logout. All employee, analytics, export, and audit endpoints require an active `ADMIN` or `HR` account. The `/api/health` endpoint remains public. JWTs contain only a user ID and expiration time; account roles are read from the database on each request.

Every table has `created_at` and `updated_at` UTC timestamps. SQLite fills them on insert and refreshes `updated_at` when a row changes.

Monetary fields store integer amounts in the currency's smallest unit. For example, `125050` represents ₹1,250.50 when that currency's `decimal_places` is `2`. Dates use `YYYY-MM-DD`. SQLite enforces foreign keys, unique fields, and non-overlapping compensation periods; referenced records cannot be deleted while dependent records remain.

## Run

Start the API in one terminal:

```bash
backend/.venv/bin/uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start the web app in another terminal:

```bash
npm --prefix frontend run dev
```

Open the local URL printed by Vite. The employee directory calls the API through Vite's development proxy. Its filters, pagination, employee details, creation form, and CSV export use live database records. The screen shows an error and retry control when a request fails. FastAPI's interactive API documentation is at <http://127.0.0.1:8000/docs>.

Run the database checks with `backend/.venv/bin/python -m unittest discover -s backend/tests -v`.

## Employee and compensation API

The API exposes:

- `GET /api/employees` with optional `search`, `country`, `department`, `role`, `status`, `package_state`, `page`, and `page_size` query parameters. Search matches partial names and employee codes without case sensitivity. Country and department use codes; `role` means employee job title. Filters combine with AND. Results are ordered by employee code, with 20 items per page by default and a maximum of 100. Each row includes the current base pay, currency, pay frequency, package state, and next effective date when available. Package states are `CURRENT`, `SCHEDULED_CHANGE`, `SCHEDULED`, `PAST_ONLY`, and `NO_PACKAGE`.
- `GET /api/employees/directory-options` for country, department, location, role, status, package-state, currency, and allowance-type options. Countries include their default currency code.
- `POST /api/employees` to create a basic employee record. Required fields are code, first and last name, email, department code, location ID, and joining date. The response wraps the created employee summary in `employee`; duplicate codes or emails return 409, while invalid references or payloads return 422. Creation and its audit record commit together.
- `GET /api/employees/export` accepts the directory filters and returns a CSV of **all matching rows**, not only the displayed page. Current base pay is exported as integer minor units. Text cells are protected against spreadsheet formula execution, and the export writes an audit event.
- `PATCH /api/employees/{employee_id}` updates supported identity and organization fields and writes an audit event.
- `GET /api/employees/{employee_id}/compensation` accepts optional `as_of=YYYY-MM-DD` (default: today UTC). It returns the employee summary, package effective on that date, past and scheduled packages with allowances, and recent activity.
- `GET /api/employees/{employee_id}/compensation/export` accepts optional `as_of` and returns all package versions and allowances as CSV with an audit event. Amounts are integer minor units.
- `POST /api/employees/{employee_id}/compensation` to create a complete new package with `base_pay`, optional `variable_pay`, `currency_code`, `pay_frequency`, `effective_from`, `reason`, and the full desired `allowances` list. It also accepts optional `change_trigger` (`ANNUAL_MERIT`, `PROMOTION`, `MARKET`, `RETENTION`, `RELOCATION`, or `OTHER`) and `authorization_reference` (at most 120 characters), stored in the audit event and returned with the package. The reference is informational; the API does not verify approval or documents. Amounts are integer minor units. Old pay and allowances remain in history; the prior period is closed if necessary. The write and audit event commit together.

See the [API contract](specs/001-employee-compensation-api/contracts/employee-compensation-api.md) for request and response shapes and error codes. A quick read example:

```bash
curl -H "Authorization: Bearer $TOKEN" 'http://127.0.0.1:8000/api/employees?country=IN&page=1&page_size=20'
curl -H "Authorization: Bearer $TOKEN" 'http://127.0.0.1:8000/api/employees/1/compensation'
```

Authentication and the two application roles are implemented within FastAPI. Authorization currently grants both `ADMIN` and `HR` access to the existing organization-wide workspace; employee self-service and finer scopes are not defined.

The profile shows stored employee, package, and audit facts. Payroll entity, cost center, grade, approval workflow, and historical organization snapshots from the design handoff have no corresponding records or contract yet. The profile therefore omits them. Edit details currently covers identity, employment type, department, location, status, and termination date; manager assignment and formal status-transition rules require separate backend work.

## Audit trail

The **Audit log** navigation opens the global trail with filters, pagination, readable
before/after comparisons and CSV reports. Employee profiles show a compact **Audit &
Change Log** card with the four newest events, separate from compensation history and
the as-of date. **Full audit log** opens the Audit tab filtered by the exact employee ID.
The scope remains in the URL and applies to reports; remove its filter to see all employees.

- `GET /api/audit/events`: search employee name/code, actor, event ID or operation reference;
  filter `action`, `actor_id`, `entity_type`, `outcome`, `employee_id`, `from_date`, `to_date`.
  Dates use `YYYY-MM-DD` and inclusive UTC days. Pagination defaults to 20, maximum 100.
- `GET /api/audit/options`: recorded actions/target types and real application actors.
- `GET /api/employees/{employee_id}/audit`: the employee-scoped equivalent.
- `GET /api/audit/events/export`: all matching events as a formula-safe CSV snapshot.

Schema version 4 preserves legacy events and adds employee association, outcome,
operation reference, reason, actor snapshot and context. Successful employee and
compensation audit writes commit with their business changes. Sensitive failures record
safe explanations without submitted values. Events are retained indefinitely and guarded
against normal updates/deletes; this is not a cryptographic ledger.

Directory, compensation and audit-report exports record requested and completed stages,
with operation summaries and affected-employee entries. Completion means the server
finished sending the response; it does not prove a file was saved or opened. Audit reports
exclude their own export events from the snapshot. Counts deduplicate export operations.

Technical processes can call the central writer with an explicit active actor name. Migrated databases retain the existing `SYSTEM` audit actor.
Future imports, account changes and configuration workflows must use this writer; those
mutation APIs and country scopes are not implemented in this feature.
See [the audit specification and contract](specs/002-audit-trail/spec.md).

## Spec-driven workflow

This repository is initialized with [Spec Kit](https://github.github.com/spec-kit/) for Codex.
The shared project rules are in [the constitution](.specify/memory/constitution.md), and
the agent skills and templates are in `.agents/skills/` and `.specify/`. New contributors
can install the CLI with `uv tool install specify-cli`, then run `specify version` and
`specify integration status` from the repository root. The project was initialized
with Spec Kit 1.0.10. Open a new Codex session in this directory to load its skills.

Stay on the existing Git branch for every feature. Do not create or switch to a
separate feature branch. Spec Kit keeps each feature's work under its own numbered
`specs/` directory, so branch changes are unnecessary for this workflow.

For each bounded feature, use these skills in Codex chat, reviewing each artifact
before moving on:

1. `$speckit-specify` with the requested outcome and compatibility constraints;
   this creates `specs/<number>-<name>/spec.md`.
2. `$speckit-clarify` if requirements have material ambiguity.
3. `$speckit-plan` to design against the existing FastAPI, SQLite, and React code.
4. `$speckit-tasks`, then `$speckit-analyze` to check the spec, plan, and tasks.
5. `$speckit-implement`, then `$speckit-converge`; repeat until the change is complete.

The constitution is already established for this project. Use `$speckit-constitution`
when its principles need an amendment. Specs for future work belong in `specs/`.
The local `artifacts/` directory is ignored by Git, so put requirements needed by
other contributors in the relevant feature spec.

## Generate sample data

The seed generator creates 10,000 employees across India, the United States, the United Kingdom, Germany, and Singapore, with 2,000 employees per country. Salary bands depend on country, department, and role. The figures are illustrative synthetic amounts, not compensation benchmarks. Each employee has one prior and one current annual compensation package, and each package has one to three monthly allowances. Existing app users remain; no audit entries are generated for seeded business data.

Run one of these commands from the repository root:

```bash
backend/.venv/bin/python -m backend.seed_data --format csv
backend/.venv/bin/python -m backend.seed_data --format xlsx
backend/.venv/bin/python -m backend.seed_data --format sqlite
```

CSV creates eight files in `exports/seed-data/`; Excel creates `exports/seed-data.xlsx` with one sheet per generated table. Use `--output PATH` to choose another export destination. SQLite seeds `DB_PATH` (default `backend/data/app.db`); use `--db-path PATH` to target a separate database. SQLite mode stops if any of the eight business tables already contains data. Export paths must not already exist.

All modes default to Faker seed `42`, 10,000 employees, and an as-of date of `2026-10-01`; use `--seed NUMBER`, `--employees NUMBER`, and `--as-of YYYY-MM-DD` to change them. The minimum employee count is 25 so every country and department is represented. Faker is pinned in `backend/requirements.txt` so the generated records stay reproducible across installs. CSV and Excel use the same explicit IDs and integer minor-unit amounts as SQLite.

## Project layout

```text
backend/   FastAPI app, SQLite schema and initialization, virtual environment
frontend/  Vite React/TypeScript app with Coss components for the directory
artifacts/ Requirements and database design
```
