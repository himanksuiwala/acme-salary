"""SQLite connections and schema initialization."""

import os
import sqlite3
from contextlib import closing
from pathlib import Path

from dotenv import load_dotenv

from backend.fx_reference import seed_usd_reference_rates
from backend.passwords import hash_password


BASE_DIR = Path(__file__).resolve().parent
SCHEMA_PATH = BASE_DIR / "schema.sql"
load_dotenv(BASE_DIR / ".env")

TABLE_PRIMARY_KEYS = {
    "currency": "currency_id",
    "fx_rate": "id",
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
        if table == "audit_log":
            continue  # Audit timestamps are fixed when the event is inserted.
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


def _migrate_audit(connection: sqlite3.Connection) -> None:
    for suffix in ("fill_timestamps", "touch_updated_at", "require_timestamps"):
        connection.execute(f"DROP TRIGGER IF EXISTS audit_log_{suffix}")
    columns = {row[1] for row in connection.execute("PRAGMA table_info(audit_log)")}
    additions = {
        "employee_id": "INTEGER REFERENCES employee(employee_id) ON DELETE RESTRICT",
        "operation_id": "TEXT",
        "outcome": "TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(outcome IN ('SUCCESS', 'FAILED'))",
        "actor_name": "TEXT",
        "reason": "TEXT",
        "metadata": "TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata))",
    }
    if "operation_id" not in columns:
        for name, definition in additions.items():
            connection.execute(f"ALTER TABLE audit_log ADD COLUMN {name} {definition}")
        connection.execute("""UPDATE audit_log SET
            employee_id = CASE
                WHEN entity_type = 'employee' THEN (SELECT employee_id FROM employee WHERE employee_id = audit_log.entity_id)
                WHEN entity_type = 'employee_compensation' THEN (SELECT employee_id FROM employee_compensation WHERE id = audit_log.entity_id)
                ELSE NULL END,
            operation_id = 'legacy-' || audit_id,
            actor_name = (SELECT username FROM app_user WHERE user_id = audit_log.user_id),
            reason = CASE WHEN json_valid(new_values) THEN json_extract(new_values, '$.reason') END,
            metadata = '{"legacy":true}'""")
    connection.execute("CREATE INDEX IF NOT EXISTS audit_time_idx ON audit_log(created_at DESC, audit_id DESC)")
    connection.execute("CREATE INDEX IF NOT EXISTS audit_employee_time_idx ON audit_log(employee_id, created_at DESC, audit_id DESC)")
    connection.execute("CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_log(action)")
    connection.execute("CREATE INDEX IF NOT EXISTS audit_operation_idx ON audit_log(operation_id)")
    for operation in ("UPDATE", "DELETE"):
        connection.execute(f"""CREATE TRIGGER IF NOT EXISTS audit_log_no_{operation.lower()}
            BEFORE {operation} ON audit_log BEGIN
            SELECT RAISE(ABORT, 'audit events are append-only'); END""")


def _migrate_auth_users(connection: sqlite3.Connection) -> None:
    columns = {row[1] for row in connection.execute("PRAGMA table_info(app_user)")}
    for name in ("first_name", "last_name"):
        if name not in columns:
            connection.execute(f"ALTER TABLE app_user ADD COLUMN {name} TEXT")
    if "password" in columns:
        for user_id, password, stored_hash in connection.execute(
            "SELECT user_id,password,password_hash FROM app_user WHERE password IS NOT NULL"
        ):
            if not stored_hash:
                connection.execute("UPDATE app_user SET password_hash=? WHERE user_id=?",
                                   (hash_password(password), user_id))
        connection.execute("ALTER TABLE app_user DROP COLUMN password")
    connection.execute("""UPDATE app_user SET role='HR'
        WHERE role IN ('NORMAL_USER','HR_ADMIN','HR_MANAGER','HR_SPECIALIST')""")
    connection.execute("""UPDATE app_user SET role='ADMIN'
        WHERE role IN ('SYSTEM','SYS_ADMIN')""")
    connection.execute("""UPDATE app_user SET first_name=COALESCE(first_name,'Avery'),
        last_name=COALESCE(last_name,'Patel') WHERE username='Admin@acme.org'""")
    connection.execute("""UPDATE app_user SET first_name=COALESCE(first_name,'System'),
        last_name=COALESCE(last_name,'Admin'), email=COALESCE(email,'system@acme.com')
        WHERE username='SYSTEM'""")
    connection.execute("PRAGMA user_version = 7")


def _bootstrap_admin(connection: sqlite3.Connection) -> None:
    display_email = os.getenv("AUTH_BOOTSTRAP_EMAIL", "").strip()
    email = display_email.casefold()
    password = os.getenv("AUTH_BOOTSTRAP_PASSWORD", "")
    if bool(email) != bool(password):
        raise RuntimeError("AUTH_BOOTSTRAP_EMAIL and AUTH_BOOTSTRAP_PASSWORD must be set together")
    if connection.execute("""SELECT 1 FROM app_user WHERE role='ADMIN'
        AND status='ACTIVE' AND password_hash IS NOT NULL LIMIT 1""").fetchone():
        return
    if not email:
        return
    existing = connection.execute("SELECT user_id FROM app_user WHERE lower(email)=?", (email,)).fetchone()
    hashed = hash_password(password)
    if existing:
        connection.execute("""UPDATE app_user SET password_hash=?,role='ADMIN',status='ACTIVE'
            WHERE user_id=?""", (hashed, existing[0]))
    else:
        connection.execute("""INSERT INTO app_user
            (username,email,password_hash,first_name,last_name,role,status)
            VALUES (?,?,?,'System','Admin','ADMIN','ACTIVE')""", (display_email, display_email, hashed))


def initialize_database(path: Path | None = None) -> Path:
    """Create or migrate the schema, preserving users and audit references."""
    path = path or database_path()
    with closing(connect_database(path)) as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1, 2, 3, 4, 5, 6, 7):
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
            if 0 < version < 5:
                connection.executescript("""CREATE TABLE IF NOT EXISTS fx_rate (
                    id INTEGER PRIMARY KEY,
                    source_currency_id INTEGER NOT NULL REFERENCES currency(currency_id) ON DELETE RESTRICT,
                    target_currency_id INTEGER NOT NULL REFERENCES currency(currency_id) ON DELETE RESTRICT,
                    rate_date TEXT NOT NULL CHECK (rate_date = date(rate_date)),
                    rate TEXT NOT NULL CHECK (CAST(rate AS REAL) > 0),
                    source TEXT NOT NULL CHECK (trim(source) <> ''),
                    approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (source_currency_id, target_currency_id, rate_date),
                    CHECK (source_currency_id <> target_currency_id));
                    CREATE INDEX IF NOT EXISTS fx_rate_lookup_idx ON fx_rate(source_currency_id, target_currency_id, approved, rate_date DESC);""")
            _create_timestamp_triggers(connection)
            _migrate_audit(connection)
            if 0 < version < 7:
                _migrate_auth_users(connection)
            _bootstrap_admin(connection)
            seed_usd_reference_rates(connection)

    return path
