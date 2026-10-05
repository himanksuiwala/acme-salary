"""FastAPI entry point for the salary management application."""

import sqlite3
from contextlib import asynccontextmanager, closing

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from backend.database import connect_database, initialize_database
from backend.employee_api import router as employee_router
from backend.audit_api import router as audit_router
from backend.analytics_api import router as analytics_router
from backend.audit_http import AuditMiddleware


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Employee Salary Management API", lifespan=lifespan)
app.add_middleware(AuditMiddleware)
app.include_router(employee_router)
app.include_router(audit_router)
app.include_router(analytics_router)


@app.get("/api/health", response_model=None)
def health_check() -> dict[str, str] | JSONResponse:
    try:
        with closing(connect_database()) as connection:
            connection.execute("SELECT 1").fetchone()
    except (OSError, sqlite3.Error):
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "unavailable"},
        )

    return {"status": "ok", "database": "ok"}
