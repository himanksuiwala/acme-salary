"""FastAPI entry point for the salary management application."""

import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="Employee Salary Management API")


def database_path() -> Path:
    configured_path = Path(os.getenv("DB_PATH", "data/app.db"))
    return configured_path if configured_path.is_absolute() else BASE_DIR / configured_path


@app.get("/api/health", response_model=None)
def health_check() -> dict[str, str] | JSONResponse:
    try:
        path = database_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(path) as connection:
            connection.execute("SELECT 1").fetchone()
    except (OSError, sqlite3.Error):
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "unavailable"},
        )

    return {"status": "ok", "database": "ok"}
