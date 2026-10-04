# Employee Salary Management

This starter connects a FastAPI backend, a SQLite database, and a Vite React/TypeScript frontend. The [requirements](artifacts/requirements.md) and [database design](artifacts/db-schema-design.md) describe the planned salary-management features. The backend creates the ten designed tables and their relationships; the health check is the only API endpoint so far.

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

## Project layout

```text
backend/   FastAPI app, SQLite schema and initialization, virtual environment
frontend/  Vite React/TypeScript app with shadcn/ui (Radix base)
artifacts/ Requirements and database design
```
