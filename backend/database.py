"""SQLite connections and schema initialization."""

import os
import sqlite3
from contextlib import closing
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
SCHEMA_PATH = BASE_DIR / "schema.sql"
load_dotenv(BASE_DIR / ".env")

TABLE_PRIMARY_KEYS = {
    "currency": "currency_id",
    "country": "country_id",
    "location": "location_id",
    "department": "department_id",
    "employee": "employee_id",
    "employee_compensation": "id",
    "allowance_type": "id",
    "employee_allowance": "id",
    "app_user": "user_id",
    "audit_log": "audit_id",
}

TABLES_WITHOUT_TIMESTAMPS_IN_V1 = (
    "currency",
    "country",
    "location",
    "employee_compensation",
    "allowance_type",
    "employee_allowance",
)
TABLES_WITH_ONLY_CREATED_AT_IN_V1 = ("department", "app_user", "audit_log")


def database_path() -> Path:
    configured_path = Path(os.getenv("DB_PATH", "data/app.db"))
    return configured_path if configured_path.is_absolute() else BASE_DIR / configured_path


def connect_database(path: Path | None = None) -> sqlite3.Connection:
    path = path or database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _add_missing_timestamps(connection: sqlite3.Connection) -> None:
    for table in TABLES_WITHOUT_TIMESTAMPS_IN_V1:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN created_at TEXT")
        connection.execute(f"ALTER TABLE {table} ADD COLUMN updated_at TEXT")
        connection.execute(
            f"""UPDATE {table}
                SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                    updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)"""
        )

    for table in TABLES_WITH_ONLY_CREATED_AT_IN_V1:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN updated_at TEXT")
        connection.execute(f"UPDATE {table} SET updated_at = created_at")

def _create_timestamp_triggers(connection: sqlite3.Connection) -> None:
    for table, primary_key in TABLE_PRIMARY_KEYS.items():
        connection.execute(
            f"""CREATE TRIGGER IF NOT EXISTS {table}_fill_timestamps
                AFTER INSERT ON {table}
                WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
                BEGIN
                    UPDATE {table}
                    SET created_at = COALESCE(NEW.created_at, CURRENT_TIMESTAMP),
                        updated_at = COALESCE(NEW.updated_at, NEW.created_at, CURRENT_TIMESTAMP)
                    WHERE {primary_key} = NEW.{primary_key};
                END"""
        )
        connection.execute(
            f"""CREATE TRIGGER IF NOT EXISTS {table}_touch_updated_at
                AFTER UPDATE ON {table}
                WHEN NEW.updated_at IS OLD.updated_at
                BEGIN
                    UPDATE {table}
                    SET updated_at = CASE
                        WHEN STRFTIME('%Y-%m-%d %H:%M:%f', 'now') > OLD.updated_at
                            THEN STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
                        ELSE STRFTIME('%Y-%m-%d %H:%M:%f', OLD.updated_at, '+0.001 seconds')
                    END
                    WHERE {primary_key} = NEW.{primary_key};
                END"""
        )
        connection.execute(
            f"""CREATE TRIGGER IF NOT EXISTS {table}_require_timestamps
                BEFORE UPDATE ON {table}
                WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
                BEGIN
                    SELECT RAISE(ABORT, 'timestamps cannot be null');
                END"""
        )


def initialize_database(path: Path | None = None) -> Path:
    """Create or migrate the schema and seed the two application actors."""
    path = path or database_path()
    with closing(connect_database(path)) as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1, 2, 3):
            raise RuntimeError(f"Unsupported database schema version: {version}")

        if version == 0:
            existing_tables = connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
            if existing_tables:
                raise RuntimeError("Cannot initialize an unversioned database that already has tables")

            try:
                connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
            except Exception:
                connection.rollback()
                raise

        with connection:
            connection.execute("BEGIN IMMEDIATE")
            if version == 1:
                _add_missing_timestamps(connection)
            if version == 2:
                for table in TABLE_PRIMARY_KEYS:
                    connection.execute(f"DROP TRIGGER IF EXISTS {table}_fill_timestamps")
                    connection.execute(f"DROP TRIGGER IF EXISTS {table}_touch_updated_at")
            _create_timestamp_triggers(connection)
            if version in (1, 2):
                connection.execute("PRAGMA user_version = 3")
            connection.executemany(
                """
                INSERT INTO app_user (username, email, password_hash, role, status)
                VALUES (?, ?, NULL, ?, 'ACTIVE')
                ON CONFLICT(username) DO NOTHING
                """,
                [
                    ("Admin@acme.org", "Admin@acme.org", "NORMAL_USER"),
                    ("SYSTEM", None, "SYSTEM"),
                ],
            )

    return path
