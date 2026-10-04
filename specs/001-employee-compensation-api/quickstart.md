# Quickstart: Verify Employee Compensation API

From the repository root, with dependencies installed and the local SQLite database initialized:

```bash
backend/.venv/bin/python -m unittest discover -s backend/tests -v
backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal, try the read flows against the seeded 50-person database:

```bash
curl 'http://127.0.0.1:8000/api/employees?page=1&page_size=20'
curl 'http://127.0.0.1:8000/api/employees?country=IN&department=ENG&search=emp'
curl 'http://127.0.0.1:8000/api/employees/1/compensation'
```

Expect a total of 50 on the unfiltered list, at most 20 items on page 1, and a current and historical package for employee 1. For a write exercise, copy the database to a temporary path and set `DB_PATH` to that copy before starting the API; use the POST body in [the contract](contracts/employee-compensation-api.md), changing the effective date to a future date. Confirm 201, inspect the new package and audit event, then submit the same date again and confirm 409 with no extra records.

Do not expose these salary routes outside a local development environment until authentication and authorization are implemented.
