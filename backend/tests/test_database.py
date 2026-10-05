"""Verify schema initialization and the constraints that protect salary history."""

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.database import SCHEMA_PATH, connect_database, initialize_database
from backend.passwords import verify_password


EXPECTED_TABLES = {
    "currency",
    "fx_rate",
    "country",
    "location",
    "department",
    "employee",
    "employee_compensation",
    "allowance_type",
    "employee_allowance",
    "app_user",
    "audit_log",
}


class DatabaseSchemaTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        database_file = Path(temporary_directory.name) / "app.db"
        environment = patch.dict(os.environ, {
            "DB_PATH": str(database_file),
            "AUTH_BOOTSTRAP_EMAIL": "Admin@acme.org",
            "AUTH_BOOTSTRAP_PASSWORD": "test-only-password",
        })
        environment.start()
        self.addCleanup(environment.stop)
        initialize_database()
        self.connection = connect_database()
        self.addCleanup(self.connection.close)

    def test_initialization_creates_bootstrap_admin_and_is_repeatable(self) -> None:
        tables = {
            row[0]
            for row in self.connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        self.assertEqual(tables, EXPECTED_TABLES)
        self.assertEqual(self.connection.execute("PRAGMA user_version").fetchone()[0], 7)
        for table in EXPECTED_TABLES:
            columns = {row[1] for row in self.connection.execute(f"PRAGMA table_info({table})")}
            self.assertTrue({"created_at", "updated_at"} <= columns, table)

        actors = self.connection.execute(
            "SELECT username,email,password_hash,role FROM app_user ORDER BY user_id"
        ).fetchall()
        self.assertEqual(len(actors), 1)
        self.assertEqual((actors[0][0], actors[0][1], actors[0][3]),
                         ("Admin@acme.org", "Admin@acme.org", "ADMIN"))
        self.assertTrue(verify_password("test-only-password", actors[0][2]))
        self.assertNotIn("password", {row[1] for row in self.connection.execute("PRAGMA table_info(app_user)")})
        for table in EXPECTED_TABLES - {"app_user"}:
            self.assertEqual(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0)

        initialize_database()
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM app_user").fetchone()[0], 1)

    def test_timestamps_are_set_and_updated_automatically(self) -> None:
        original = self.connection.execute(
            "SELECT created_at, updated_at FROM app_user WHERE username = 'Admin@acme.org'"
        ).fetchone()
        self.assertTrue(all(original))

        with self.connection:
            self.connection.execute(
                "UPDATE app_user SET updated_at = '2000-01-01 00:00:00' "
                "WHERE username = 'Admin@acme.org'"
            )
            self.connection.execute(
                "UPDATE app_user SET status = 'INACTIVE' WHERE username = 'Admin@acme.org'"
            )

        changed = self.connection.execute(
            "SELECT created_at, updated_at FROM app_user WHERE username = 'Admin@acme.org'"
        ).fetchone()
        self.assertEqual(changed[0], original[0])
        self.assertNotEqual(changed[1], "2000-01-01 00:00:00")

        self.connection.execute("PRAGMA recursive_triggers = ON")
        with self.connection:
            self.connection.execute(
                "UPDATE app_user SET status = 'ACTIVE' WHERE username = 'Admin@acme.org'"
            )
        latest = self.connection.execute(
            "SELECT updated_at FROM app_user WHERE username = 'Admin@acme.org'"
        ).fetchone()[0]
        self.assertGreater(latest, changed[1])

    def test_version_six_user_migration_preserves_audit_and_removes_plaintext(self) -> None:
        schema = SCHEMA_PATH.read_text().replace("email TEXT NOT NULL UNIQUE", "email TEXT UNIQUE")
        schema = schema.replace("password_hash TEXT NOT NULL,", "password_hash TEXT,\n    password TEXT,")
        schema = schema.replace("role TEXT NOT NULL CHECK (role IN ('ADMIN', 'HR'))",
                                "role TEXT NOT NULL CHECK (role <> '')")
        schema = schema.replace("CHECK (status IN ('ACTIVE', 'INACTIVE'))",
                                "CHECK (role <> 'SYSTEM' OR password_hash IS NULL)")
        schema = schema.replace("PRAGMA user_version = 7", "PRAGMA user_version = 6")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.db"
            with sqlite3.connect(path) as legacy:
                legacy.executescript(schema)
                legacy.execute("""INSERT INTO app_user
                    (username,email,password,role,status) VALUES
                    ('Admin@acme.org','Admin@acme.org','legacy-hr-password','HR_ADMIN','ACTIVE'),
                    ('SYSTEM','system@acme.com','legacy-admin-password','SYS_ADMIN','ACTIVE')""")
                legacy.execute("""INSERT INTO audit_log(user_id,action,entity_type,metadata)
                    VALUES(2,'CONFIG_UPDATED','currency','{}')""")
                legacy.commit()
            initialize_database(path)
            with sqlite3.connect(path) as migrated:
                self.assertEqual(migrated.execute("PRAGMA user_version").fetchone()[0], 7)
                self.assertNotIn("password", {row[1] for row in migrated.execute("PRAGMA table_info(app_user)")})
                actors = migrated.execute("SELECT user_id,username,password_hash,role FROM app_user ORDER BY user_id").fetchall()
                self.assertEqual([(row[0], row[1], row[3]) for row in actors],
                                 [(1, 'Admin@acme.org', 'HR'), (2, 'SYSTEM', 'ADMIN')])
                self.assertTrue(verify_password('legacy-hr-password', actors[0][2]))
                self.assertTrue(verify_password('legacy-admin-password', actors[1][2]))
                self.assertEqual(migrated.execute("SELECT user_id FROM audit_log").fetchone()[0], 2)
                self.assertEqual(migrated.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_foreign_keys_and_compensation_periods_are_enforced(self) -> None:
        self.assertEqual(self.connection.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            with self.connection:
                self.connection.execute(
                    "INSERT INTO country (country_code, country_name, default_currency_id) "
                    "VALUES ('IN', 'India', 999)"
                )

        with self.connection:
            self.connection.execute(
                "INSERT INTO currency (currency_code, currency_name, decimal_places) "
                "VALUES ('INR', 'Indian Rupee', 2)"
            )
            self.connection.execute(
                "INSERT INTO country (country_code, country_name, default_currency_id) "
                "VALUES ('IN', 'India', 1)"
            )
            self.connection.execute(
                "INSERT INTO location (country_id, location_name) VALUES (1, 'Head office')"
            )
            self.connection.execute(
                "INSERT INTO department (department_code, department_name) VALUES ('HR', 'HR')"
            )
            self.connection.execute(
                """INSERT INTO employee
                   (employee_code, first_name, last_name, email, department_id,
                    location_id, joining_date, status)
                   VALUES ('EMP001', 'Test', 'Person', 'test@acme.org', 1, 1,
                           '2024-01-01', 'ACTIVE')"""
            )
            self.connection.execute(
                """INSERT INTO employee_compensation
                   (employee_id, base_pay, currency_id, pay_frequency, effective_from, effective_to)
                   VALUES (1, 12000000, 1, 'ANNUAL', '2025-01-01', '2025-12-31')"""
            )

        with self.assertRaisesRegex(sqlite3.IntegrityError, "overlapping compensation period"):
            with self.connection:
                self.connection.execute(
                    """INSERT INTO employee_compensation
                       (employee_id, base_pay, currency_id, pay_frequency, effective_from)
                       VALUES (1, 13000000, 1, 'ANNUAL', '2025-12-31')"""
                )

        with self.connection:
            self.connection.execute(
                """INSERT INTO employee_compensation
                   (employee_id, base_pay, currency_id, pay_frequency, effective_from)
                   VALUES (1, 13000000, 1, 'ANNUAL', '2026-01-01')"""
            )

        with self.assertRaisesRegex(sqlite3.IntegrityError, "overlapping compensation period"):
            with self.connection:
                self.connection.execute(
                    "UPDATE employee_compensation SET effective_from = '2025-06-01' WHERE id = 2"
                )

        with self.assertRaises(sqlite3.IntegrityError):
            with self.connection:
                self.connection.execute("DELETE FROM currency WHERE currency_id = 1")


if __name__ == "__main__":
    unittest.main()
