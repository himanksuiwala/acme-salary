# Employee Salary Management

This starter connects a FastAPI backend, a SQLite database, and a Vite React/TypeScript frontend. The [requirements](artifacts/requirements.md) and [database design](artifacts/db-schema-design.md) describe the planned salary-management features. The backend creates the ten designed tables and exposes health, employee directory, compensation detail, and versioned compensation update endpoints.

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

The backend uses `backend/data/app.db` by default. To change the location, copy `backend/.env.example` to `backend/.env` and edit `DB_PATH`. Relative paths are resolved from `backend/`. The virtual environment, `.env`, and SQLite database are ignored by Git.

The API initializes a fresh database on startup. To initialize it without starting the API, run:

```bash
backend/.venv/bin/python -m backend.init_db
```

Initialization is safe to repeat and migrates existing version 1 or 2 databases to version 3 without removing their records. It creates only two `app_user` records: `Admin@acme.org` (the normal human actor) and `SYSTEM` (for automated actions). Neither has a password yet, and authentication is not implemented. Manual changes should use the human actor; automated changes should use SYSTEM. Other tables start empty.

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

Open the local URL printed by Vite. The page calls `/api/health` through Vite's development proxy. A successful check returns `{"status":"ok","database":"ok"}` after SQLite executes a query. If SQLite cannot be reached, the API returns HTTP 503 and the page shows the database as unavailable. FastAPI's interactive API documentation is at <http://127.0.0.1:8000/docs>.

Run the database checks with `backend/.venv/bin/python -m unittest discover -s backend/tests -v`.

## Employee and compensation API

The API exposes:

- `GET /api/employees` with optional `search`, `country`, `department`, `role`, `status`, `page`, and `page_size` query parameters. Search matches partial names and employee codes without case sensitivity. Country and department use codes; `role` means employee job title. Filters combine with AND. Results are ordered by employee code, with 20 items per page by default and a maximum of 100.
- `GET /api/employees/{employee_id}/compensation` with the employee summary, package effective today (UTC), past packages, scheduled packages, and each package's allowances.
- `POST /api/employees/{employee_id}/compensation` to create a complete new package with `base_pay`, optional `variable_pay`, `currency_code`, `pay_frequency`, `effective_from`, `reason`, and the full desired `allowances` list. Amounts are integer minor units. Old pay and allowances remain in history; the prior period is closed if necessary. The write and audit event commit together.

See the [API contract](specs/001-employee-compensation-api/contracts/employee-compensation-api.md) for request and response shapes and error codes. A quick read example:

```bash
curl 'http://127.0.0.1:8000/api/employees?country=IN&page=1&page_size=20'
curl 'http://127.0.0.1:8000/api/employees/1/compensation'
```

**Local development only:** These salary endpoints have no authentication or authorization. Successful changes are temporarily attributed to the seeded `Admin@acme.org` user for auditing; this does not identify the actual caller. The intended human access role is `NORMAL_USER` for HR platform users; `SYSTEM` is reserved for automated configuration work. Add real authentication and role enforcement before exposing this API beyond a local development environment.

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

The seed generator creates 50 employees across India, the United States, the United Kingdom, Germany, and Singapore, with ten employees per country. Salary bands depend on country, department, and role. The figures are illustrative synthetic amounts, not compensation benchmarks. Each employee has one prior and one current annual compensation package, and each package has one to three monthly allowances. Only the two existing app users remain; no audit entries are generated.

Run one of these commands from the repository root:

```bash
backend/.venv/bin/python -m backend.seed_data --format csv
backend/.venv/bin/python -m backend.seed_data --format xlsx
backend/.venv/bin/python -m backend.seed_data --format sqlite
```

CSV creates eight files in `exports/seed-data/`; Excel creates `exports/seed-data.xlsx` with one sheet per generated table. Use `--output PATH` to choose another export destination. SQLite seeds `DB_PATH` (default `backend/data/app.db`); use `--db-path PATH` to target a separate database. SQLite mode stops if any of the eight business tables already contains data. Export paths must not already exist.

All modes default to Faker seed `42` and an as-of date of `2026-10-01`; use `--seed NUMBER` and `--as-of YYYY-MM-DD` to change them. Faker is pinned in `backend/requirements.txt` so the generated records stay reproducible across installs. CSV and Excel use the same explicit IDs and integer minor-unit amounts as SQLite.

## Project layout

```text
backend/   FastAPI app, SQLite schema and initialization, virtual environment
frontend/  Vite React/TypeScript app with shadcn/ui (Radix base)
artifacts/ Requirements and database design
```
