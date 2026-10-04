# Employee Salary Management

This starter connects a FastAPI backend, a SQLite database, and a Vite React/TypeScript frontend. The [requirements](artifacts/requirements.md) and [database design](artifacts/db-schema-design.md) describe the planned salary-management features. The application currently implements only a health check; the domain tables are not created yet.

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

## Run

Start the API in one terminal:

```bash
backend/.venv/bin/uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Start the web app in another terminal:

```bash
npm --prefix frontend run dev
```

Open the local URL printed by Vite. The page calls `/api/health` through Vite's development proxy. A successful check returns `{"status":"ok","database":"ok"}` after SQLite executes a query. If SQLite cannot be reached, the API returns HTTP 503 and the page shows the database as unavailable. FastAPI's interactive API documentation is at <http://127.0.0.1:8000/docs>.

## Project layout

```text
backend/   FastAPI app, virtual environment, and SQLite configuration
frontend/  Vite React/TypeScript app with shadcn/ui (Radix base)
artifacts/ Requirements and database design
```
