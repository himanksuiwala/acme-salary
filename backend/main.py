"""FastAPI entry point for the salary management application."""

import sqlite3
from contextlib import asynccontextmanager, closing
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse, JSONResponse

from backend.database import connect_database, initialize_database
from backend.employee_api import router as employee_router
from backend.audit_api import router as audit_router
from backend.analytics_api import router as analytics_router
from backend.admin_api import router as admin_router
from backend.audit_http import AuditMiddleware
from backend.auth import auth_config, require_roles, router as auth_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    auth_config()
    with closing(connect_database()) as connection:
        if connection.execute("""SELECT 1 FROM app_user WHERE role='ADMIN' AND status='ACTIVE'
            AND password_hash IS NOT NULL LIMIT 1""").fetchone() is None:
            raise RuntimeError("Configure AUTH_BOOTSTRAP_EMAIL and AUTH_BOOTSTRAP_PASSWORD to create an admin")
    yield


app = FastAPI(title="Employee Salary Management API", lifespan=lifespan)
app.add_middleware(AuditMiddleware)
workspace_access = [Depends(require_roles("ADMIN", "HR"))]
app.include_router(employee_router, dependencies=workspace_access)
app.include_router(audit_router, dependencies=workspace_access)
app.include_router(analytics_router, dependencies=workspace_access)
app.include_router(admin_router)
app.include_router(auth_router)


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


# Serve Vite production build if dist directory exists
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    from fastapi.staticfiles import StaticFiles

    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Do not catch API or auth endpoints (let them return 404 JSON)
        if full_path.startswith(("api/", "auth/")) or full_path in ("api", "auth"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})

        requested = FRONTEND_DIST / full_path
        if full_path and requested.is_file():
            return FileResponse(requested)

        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)

        return JSONResponse(status_code=404, content={"detail": "Frontend index.html not found"})
