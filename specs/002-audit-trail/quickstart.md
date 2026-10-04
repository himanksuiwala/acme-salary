# Audit verification

From repository root:

```sh
backend/.venv/bin/python -m unittest discover -s backend/tests -v
npm --prefix frontend run build
npm --prefix frontend run lint
backend/.venv/bin/python -m uvicorn backend.main:app --reload
```

In another terminal:

```sh
npm --prefix frontend run dev
```

Open Vite URL. Select Audit log, clear/filter/search and expand an event. An empty seeded audit store is valid. Edit an employee or record compensation to create real events; inspect the employee profile’s compact Audit & Change Log card (up to four newest events). Select Full audit log to open the Audit tab with that exact employee filter. Browser Back returns to the profile; remove the employee filter or select the main Audit navigation to see global activity. Export directory/profile/report and refresh to see requested and completed stages. Dates are UTC. Use disposable SQLite copies for destructive or failure QA. Startup performs schema4 migration without populating fake logs. Local fixed Admin identity is not authentication; don't deploy without auth and scope enforcement.
