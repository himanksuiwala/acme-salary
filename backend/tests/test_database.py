"""Verify schema initialization and the constraints that protect salary history."""

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.database import connect_database, initialize_database


EXPECTED_TABLES = {
    "currency",
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
        environment = patch.dict(os.environ, {"DB_PATH": str(database_file)})
        environment.start()
        self.addCleanup(environment.stop)
        initialize_database()
        self.connection = connect_database()
        self.addCleanup(self.connection.close)

    def test_initialization_creates_only_the_two_actors_and_is_repeatable(self) -> None:
        tables = {
            row[0]
            for row in self.connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        self.assertEqual(tables, EXPECTED_TABLES)
        self.assertEqual(self.connection.execute("PRAGMA user_version").fetchone()[0], 3)
        for table in EXPECTED_TABLES:
            columns = {row[1] for row in self.connection.execute(f"PRAGMA table_info({table})")}
            self.assertTrue({"created_at", "updated_at"} <= columns, table)

        actors = self.connection.execute(
            "SELECT username, email, password_hash, role FROM app_user ORDER BY user_id"
        ).fetchall()
        self.assertEqual(
            actors,
            [
                ("Admin@acme.org", "Admin@acme.org", None, "NORMAL_USER"),
                ("SYSTEM", None, None, "SYSTEM"),
            ],
        )
        for table in EXPECTED_TABLES - {"app_user"}:
            self.assertEqual(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0)

        initialize_database()
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM app_user").fetchone()[0], 2)

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
                "UPDATE app_user SET status = 'PAUSED' WHERE username = 'Admin@acme.org'"
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
