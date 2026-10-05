"""HTTP-level checks for directory and versioned compensation behavior."""

import asyncio
import json
import os
import tempfile
import unittest
from datetime import timedelta, timezone, datetime
from pathlib import Path
from unittest.mock import patch

from backend.database import connect_database, initialize_database
from backend.main import app
from backend.auth import create_access_token


def request(method: str, path: str, *, query: str = "", body: dict | None = None,
            raw: bool = False, headers: list | None = None, authenticated: bool = True):
    payload = json.dumps(body).encode() if body is not None else b""
    messages = []
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": payload, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": method, "scheme": "http", "server": ("test", 80),
        "client": ("127.0.0.1", 12345), "path": path,
        "raw_path": path.encode(), "query_string": query.encode(),
        "headers": [(b"content-type", b"application/json"),
                    *([(b"authorization", f"Bearer {create_access_token(1)}".encode())]
                      if authenticated and path.startswith('/api/') else []),
                    *(headers or [])],
    }
    asyncio.run(app(scope, receive, send))
    status = next(message["status"] for message in messages if message["type"] == "http.response.start")
    content = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    if raw:
        return status, content.decode("utf-8")
    return status, json.loads(content) if content else None


class EmployeeApiTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        env = patch.dict(os.environ, {
            "DB_PATH": str(Path(directory.name) / "test.db"),
            "JWT_SECRET_KEY": "test-only-jwt-secret-with-at-least-32-bytes",
            "JWT_ACCESS_MINUTES": "30",
            "AUTH_BOOTSTRAP_EMAIL": "Admin@acme.org",
            "AUTH_BOOTSTRAP_PASSWORD": "test-only-password",
        })
        env.start()
        self.addCleanup(env.stop)
        initialize_database()
        self.connection = connect_database()
        self.addCleanup(self.connection.close)
        self.today = datetime.now(timezone.utc).date()
        with self.connection:
            self.connection.executemany(
                "INSERT INTO currency (currency_code, currency_name, symbol, decimal_places) VALUES (?, ?, ?, 2)",
                [("USD", "US Dollar", "$"), ("GBP", "Pound Sterling", "£")],
            )
            self.connection.executemany(
                "INSERT INTO country (country_code, country_name, default_currency_id) VALUES (?, ?, ?)",
                [("US", "United States", 1), ("GB", "United Kingdom", 2)],
            )
            self.connection.executemany(
                "INSERT INTO location (country_id, location_name, city) VALUES (?, ?, ?)",
                [(1, "New York", "New York"), (2, "London", "London")],
            )
            self.connection.executemany(
                "INSERT INTO department (department_code, department_name) VALUES (?, ?)",
                [("HR", "Human Resources"), ("ENG", "Engineering")],
            )
            self.connection.executemany(
                "INSERT INTO allowance_type (code, name) VALUES (?, ?)",
                [("MEAL", "Meal"), ("TRANSPORT", "Transport")],
            )
            for number in range(1, 26):
                first, last = ("Ana", "Singh") if number == 1 else ("Bob", f"Person{number:02d}")
                department_id = 1 if number == 1 else 2
                location_id = 1 if number == 1 else 2
                job_title = "Analyst" if number == 1 else "Engineer"
                status = "ACTIVE" if number < 25 else "INACTIVE"
                self.connection.execute(
                    """INSERT INTO employee (employee_code, first_name, last_name, email,
                       department_id, location_id, job_title, joining_date, status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, '2020-01-01', ?)""",
                    (f"EMP{number:03d}", first, last, f"person{number}@example.org",
                     department_id, location_id, job_title, status),
                )
            prior_start = self.today - timedelta(days=400)
            prior_end = self.today - timedelta(days=2)
            current_start = self.today - timedelta(days=1)
            self.connection.execute(
                """INSERT INTO employee_compensation
                   (employee_id, base_pay, currency_id, pay_frequency, effective_from, effective_to)
                   VALUES (1, 7000000, 1, 'ANNUAL', ?, ?)""",
                (prior_start.isoformat(), prior_end.isoformat()),
            )
            self.connection.execute(
                """INSERT INTO employee_compensation
                   (employee_id, base_pay, currency_id, pay_frequency, effective_from)
                   VALUES (1, 8000000, 1, 'ANNUAL', ?)""",
                (current_start.isoformat(),),
            )
            self.connection.executemany(
                "INSERT INTO employee_allowance (compensation_id, allowance_type_id, amount, frequency) VALUES (?, ?, ?, 'MONTHLY')",
                [(1, 1, 10000), (1, 2, 5000), (2, 1, 12000), (2, 2, 6000)],
            )

    def new_package(self, **changes):
        result = {
            "base_pay": 9000000, "variable_pay": 500000, "currency_code": "usd",
            "pay_frequency": "ANNUAL", "effective_from": (self.today + timedelta(days=30)).isoformat(),
            "reason": "Annual review",
            "allowances": [{"type_code": "meal", "amount": 15000, "frequency": "MONTHLY"}],
        }
        result.update(changes)
        return result

    def test_list_search_filters_and_pagination(self):
        status, result = request("GET", "/api/employees")
        self.assertEqual(status, 200)
        self.assertEqual((result["total"], result["page"], result["page_size"]), (25, 1, 20))
        self.assertEqual([item["employee_code"] for item in result["items"]],
                         [f"EMP{i:03d}" for i in range(1, 21)])
        status, result = request("GET", "/api/employees", query="page=2")
        self.assertEqual(status, 200)
        self.assertEqual(len(result["items"]), 5)
        status, result = request("GET", "/api/employees", query="search=ana&country=us&department=hr&role=analyst&status=active")
        self.assertEqual(status, 200)
        self.assertEqual([item["employee_code"] for item in result["items"]], ["EMP001"])
        self.assertEqual(result["items"][0]["country"]["code"], "US")
        for term in ("emp001", "SINGH"):
            self.assertEqual(request("GET", "/api/employees", query=f"search={term}")[1]["total"], 1)
        self.assertEqual(request("GET", "/api/employees", query="country=GB&department=HR")[1]["total"], 0)
        self.assertEqual(request("GET", "/api/employees", query="search=%25")[1]["total"], 0)
        self.assertEqual(request("GET", "/api/employees", query="page=99")[1]["total"], 25)
        self.assertEqual(request("GET", "/api/employees", query="page=99")[1]["items"], [])

    def test_list_rejects_invalid_pagination(self):
        for query in ("page=0", "page_size=0", "page_size=101", "page=foo"):
            self.assertEqual(request("GET", "/api/employees", query=query)[0], 422)
        self.assertEqual(request("GET", "/api/employees", query="page_size=100")[0], 200)

    def test_directory_package_summary_filter_options_and_export(self):
        listing = request("GET", "/api/employees", query="status=ACTIVE")[1]
        self.assertEqual(listing["items"][0]["package_state"], "CURRENT")
        self.assertEqual(listing["items"][0]["current_compensation"]["base_pay"], 8000000)
        self.assertEqual(listing["items"][0]["current_compensation"]["currency"]["code"], "USD")
        self.assertEqual(listing["items"][1]["package_state"], "NO_PACKAGE")
        self.assertIsNone(listing["items"][1]["current_compensation"])
        self.assertEqual(request("GET", "/api/employees", query="package_state=NO_PACKAGE")[1]["total"], 24)
        self.assertEqual(request("GET", "/api/employees", query="package_state=invalid")[0], 422)

        options = request("GET", "/api/employees/directory-options")[1]
        self.assertIn({"code": "GB", "name": "United Kingdom", "default_currency_code": "GBP"}, options["countries"])
        self.assertIn({"code": "HR", "name": "Human Resources"}, options["departments"])
        self.assertIn("Engineer", options["roles"])
        self.assertEqual(len(options["locations"]), 2)

        status, csv_text = request("GET", "/api/employees/export", query="search=EMP001", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("current_base_pay_minor_units,currency_code,pay_frequency", csv_text)
        self.assertIn("8000000,USD,ANNUAL", csv_text)
        self.assertEqual(csv_text.count("EMP001"), 1)
        self.assertEqual(self.connection.execute(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'EXPORT_COMPLETED' AND entity_type = 'export'"
        ).fetchone()[0], 1)

    def test_allowance_admin_lifecycle_and_read_only_role(self):
        status, reference = request("GET", "/api/admin/reference-data")
        self.assertEqual(status, 200)
        self.assertEqual({item["code"] for item in reference["allowance_types"]}, {"MEAL", "TRANSPORT"})
        self.assertEqual(len(reference["countries"]), 2)
        self.assertEqual(len(reference["locations"]), 2)
        self.assertEqual(len(reference["departments"]), 2)
        self.assertEqual(len(reference["currencies"]), 2)

        status, created = request("POST", "/api/admin/allowance-types", body={
            "code": "wellness", "name": "Wellness", "description": "Monthly wellbeing support",
        })
        self.assertEqual(status, 201, created)
        allowance_id = created["allowance_type"]["id"]
        self.assertEqual(created["allowance_type"]["code"], "WELLNESS")
        self.assertEqual(request("POST", "/api/admin/allowance-types", body={
            "code": "WELLNESS", "name": "Duplicate",
        })[0], 409)
        status, updated = request("PATCH", f"/api/admin/allowance-types/{allowance_id}", body={
            "name": "Wellbeing", "description": "Updated description",
        })
        self.assertEqual(status, 200)
        self.assertEqual(updated["allowance_type"]["name"], "Wellbeing")
        status, archived = request("POST", f"/api/admin/allowance-types/{allowance_id}/archive",
                                   body={"reason": "Benefit is no longer offered"})
        self.assertEqual(status, 200)
        self.assertEqual(archived["allowance_type"]["status"], "INACTIVE")
        self.assertNotIn("WELLNESS", {item["code"] for item in request(
            "GET", "/api/employees/directory-options")[1]["allowance_types"]})
        self.assertEqual(request("POST", "/api/employees/1/compensation", body=self.new_package(
            allowances=[{"type_code": "WELLNESS", "amount": 100, "frequency": "MONTHLY"}]
        ))[0], 422)
        status, reactivated = request(
            "POST", f"/api/admin/allowance-types/{allowance_id}/reactivate",
            body={"reason": "Benefit restored"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(reactivated["allowance_type"]["status"], "ACTIVE")
        events = self.connection.execute(
            "SELECT action,reason FROM audit_log WHERE entity_type='allowance_type' ORDER BY audit_id"
        ).fetchall()
        self.assertEqual([row[0] for row in events], [
            "ALLOWANCE_TYPE_CREATED", "ALLOWANCE_TYPE_UPDATED",
            "ALLOWANCE_TYPE_ARCHIVED", "ALLOWANCE_TYPE_REACTIVATED",
        ])
        self.assertEqual(events[-2][1], "Benefit is no longer offered")

        with self.connection:
            self.connection.execute("UPDATE app_user SET role='HR' WHERE user_id=1")
        self.assertEqual(request("GET", "/api/admin/reference-data")[0], 200)
        status, hr_updated = request("PATCH", f"/api/admin/allowance-types/{allowance_id}", body={
            "name": "Blocked", "description": None,
        })
        self.assertEqual(status, 200)
        self.assertEqual(hr_updated["allowance_type"]["name"], "Blocked")
        status, hr_created = request("POST", "/api/admin/allowance-types", body={
            "code": "HR_BENEFIT", "name": "HR benefit", "description": None,
        })
        self.assertEqual(status, 201)
        hr_allowance_id = hr_created["allowance_type"]["id"]
        self.assertEqual(request(
            "POST", f"/api/admin/allowance-types/{hr_allowance_id}/archive",
            body={"reason": "HR lifecycle test"},
        )[1]["allowance_type"]["status"], "INACTIVE")
        self.assertEqual(request(
            "POST", f"/api/admin/allowance-types/{hr_allowance_id}/reactivate",
            body={"reason": "HR lifecycle test complete"},
        )[1]["allowance_type"]["status"], "ACTIVE")

        with self.connection:
            self.connection.execute("UPDATE employee SET first_name = '=2+2' WHERE employee_id = 2")
        _, protected_csv = request("GET", "/api/employees/export", query="search=EMP002", raw=True)
        self.assertIn("'=2+2", protected_csv)

    def test_employee_creation_validates_refs_duplicates_and_audits(self):
        payload = {
            "employee_code": "EMP026", "first_name": "Zoë", "last_name": "Rao",
            "email": "zoe.rao@example.org", "department_code": "HR", "location_id": 1,
            "job_title": "HR Manager", "employment_type": "FULL_TIME",
            "joining_date": "2026-01-01", "status": "ACTIVE",
        }
        status, result = request("POST", "/api/employees", body=payload)
        self.assertEqual(status, 201)
        self.assertEqual(result["employee"]["employee_code"], "EMP026")
        self.assertEqual(request("GET", "/api/employees", query="search=EMP026")[1]["total"], 1)
        self.assertEqual(request("POST", "/api/employees", body=payload)[0], 409)
        self.assertEqual(request("POST", "/api/employees", body={**payload, "employee_code": "emp026",
                                                                    "email": "different@example.org"})[0], 409)
        self.assertEqual(request("POST", "/api/employees", body={**payload, "department_code": "UNKNOWN",
                                                                    "employee_code": "EMP027"})[0], 422)
        self.assertEqual(request("POST", "/api/employees", body={**payload, "employee_code": "EMP028",
                                                                    "email": "bad"})[0], 422)
        self.assertEqual(self.connection.execute(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'EMPLOYEE_CREATED' AND outcome = 'SUCCESS'"
        ).fetchone()[0], 1)

    def test_large_directory_has_bounded_stable_pages(self):
        with self.connection:
            self.connection.executemany(
                """INSERT INTO employee (employee_code, first_name, last_name, email,
                   department_id, location_id, job_title, joining_date, status)
                   VALUES (?, 'Test', 'Person', ?, 2, 2, 'Engineer', '2020-01-01', 'ACTIVE')""",
                ((f"ZZZ{number:05d}", f"large{number}@example.org")
                 for number in range(26, 10001)),
            )
        first = request("GET", "/api/employees", query="page=2&page_size=100")[1]
        repeated = request("GET", "/api/employees", query="page=2&page_size=100")[1]
        next_page = request("GET", "/api/employees", query="page=3&page_size=100")[1]
        self.assertEqual(first["total"], 10000)
        self.assertEqual(len(first["items"]), 100)
        self.assertEqual([item["employee_code"] for item in first["items"]],
                         [item["employee_code"] for item in repeated["items"]])
        self.assertTrue({item["employee_code"] for item in first["items"]}.isdisjoint(
            {item["employee_code"] for item in next_page["items"]}))

    def test_detail_classifies_history_current_scheduled_and_empty(self):
        status, result = request("GET", "/api/employees/1/compensation")
        self.assertEqual(status, 200)
        self.assertEqual(result["employee"]["employee_code"], "EMP001")
        self.assertEqual(result["current"]["base_pay"], 8000000)
        self.assertEqual(result["current"]["currency"]["code"], "USD")
        self.assertEqual(len(result["current"]["allowances"]), 2)
        self.assertEqual(result["history"][0]["base_pay"], 7000000)
        self.assertEqual(result["scheduled"], [])
        self.assertIsNone(result["current"]["change_reason"])
        status, empty = request("GET", "/api/employees/2/compensation")
        self.assertEqual(status, 200)
        self.assertIsNone(empty["current"])
        self.assertEqual(empty["history"], [])
        self.assertEqual(request("GET", "/api/employees/999/compensation")[0], 404)

    def test_profile_as_of_reclassifies_packages_and_exposes_stored_identity(self):
        prior_date = (self.today - timedelta(days=3)).isoformat()
        status, detail = request("GET", "/api/employees/1/compensation", query=f"as_of={prior_date}")
        self.assertEqual(status, 200)
        self.assertEqual(detail["as_of"], prior_date)
        self.assertEqual(detail["current"]["base_pay"], 7000000)
        self.assertEqual(len(detail["history"]), 0)
        self.assertEqual(len(detail["scheduled"]), 1)
        self.assertEqual(detail["employee"]["joining_date"], "2020-01-01")
        self.assertIsNone(detail["employee"]["manager"])
        self.assertEqual(detail["activity"], [])
        self.assertEqual(request("GET", "/api/employees/1/compensation", query="as_of=bad")[0], 422)

    def test_profile_export_contains_all_versions_and_is_audited(self):
        self.assertEqual(request("POST", "/api/employees/1/compensation", body=self.new_package())[0], 201)
        detail = request("GET", "/api/employees/1/compensation")[1]
        self.assertEqual(detail["activity"][0]["reason"], "Annual review")
        status, content = request("GET", "/api/employees/1/compensation/export", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("as_of_utc", content)
        self.assertIn("Annual review", content)
        self.assertIn("9000000", content)
        self.assertEqual(self.connection.execute(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'EXPORT_COMPLETED' AND entity_type = 'employee' AND entity_id = 1"
        ).fetchone()[0], 1)

    def test_employee_edit_updates_profile_and_audits(self):
        payload = {
            "first_name": "Ana", "last_name": "Patel", "email": "ana.patel@example.org",
            "department_code": "ENG", "location_id": 2, "job_title": "Senior Engineer",
            "employment_type": "FULL_TIME", "termination_date": None, "status": "ACTIVE",
        }
        status, result = request("PATCH", "/api/employees/1", body=payload)
        self.assertEqual(status, 200, result)
        self.assertEqual(result["employee"]["last_name"], "Patel")
        detail = request("GET", "/api/employees/1/compensation")[1]
        self.assertEqual(detail["employee"]["country"]["code"], "GB")
        self.assertEqual(detail["activity"][0]["action"], "EMPLOYEE_UPDATED")
        self.assertEqual(request("PATCH", "/api/employees/1", body={**payload, "termination_date": "2019-01-01"})[0], 422)
        self.assertEqual(request("PATCH", "/api/employees/1", body={**payload, "email": "person2@example.org"})[0], 409)

    def test_create_package_preserves_history_allowances_and_audit(self):
        status, result = request("POST", "/api/employees/1/compensation", body=self.new_package(
            change_trigger="ANNUAL_MERIT", authorization_reference="HR-2026-14"))
        self.assertEqual(status, 201, result)
        self.assertEqual(result["compensation"]["base_pay"], 9000000)
        self.assertEqual(result["compensation"]["change_reason"], "Annual review")
        self.assertEqual(result["compensation"]["change_trigger"], "ANNUAL_MERIT")
        self.assertEqual(result["compensation"]["authorization_reference"], "HR-2026-14")
        self.assertEqual([a["type_code"] for a in result["compensation"]["allowances"]], ["MEAL"])
        detail = request("GET", "/api/employees/1/compensation")[1]
        self.assertEqual(detail["current"]["base_pay"], 8000000)
        self.assertEqual(detail["scheduled"][0]["base_pay"], 9000000)
        self.assertEqual(detail["current"]["effective_to"],
                         (self.today + timedelta(days=29)).isoformat())
        self.assertEqual(len(detail["current"]["allowances"]), 2)
        self.assertEqual(len(detail["scheduled"][0]["allowances"]), 1)
        self.assertEqual(detail["scheduled"][0]["authorization_reference"], "HR-2026-14")
        self.assertEqual(detail["activity"][0]["change_trigger"], "ANNUAL_MERIT")
        self.assertEqual(detail["activity"][0]["authorization_reference"], "HR-2026-14")
        directory = request("GET", "/api/employees", query="package_state=SCHEDULED_CHANGE")[1]
        self.assertEqual(directory["items"][0]["employee_code"], "EMP001")
        self.assertEqual(directory["items"][0]["next_effective_from"],
                         (self.today + timedelta(days=30)).isoformat())
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM employee_compensation WHERE employee_id=1").fetchone()[0], 3)
        actor, reason = self.connection.execute(
            "SELECT u.username, a.reason FROM audit_log a JOIN app_user u ON u.user_id=a.user_id"
        ).fetchone()
        self.assertEqual((actor, reason), ("Admin@acme.org", "Annual review"))

    def test_create_rejects_bad_input_without_partial_writes(self):
        bad_cases = [
            (self.new_package(base_pay=-1), 422),
            (self.new_package(base_pay="9000000"), 422),
            (self.new_package(base_pay=9223372036854775808), 422),
            (self.new_package(reason="  "), 422),
            (self.new_package(currency_code="XXX"), 422),
            (self.new_package(pay_frequency="WEEKLY"), 422),
            (self.new_package(change_trigger="UNSUPPORTED"), 422),
            (self.new_package(effective_from=1793491200), 422),
            (self.new_package(effective_from="20261101"), 422),
            (self.new_package(allowances=[{"type_code": "NOPE", "amount": 5, "frequency": "MONTHLY"}]), 422),
            (self.new_package(allowances=[{"type_code": "MEAL", "amount": 5, "frequency": "MONTHLY"}, {"type_code": "meal", "amount": 6, "frequency": "MONTHLY"}]), 422),
            (self.new_package(effective_from=(self.today - timedelta(days=1)).isoformat()), 409),
            (self.new_package(effective_from=(self.today - timedelta(days=2)).isoformat()), 409),
        ]
        before = [self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                  for table in ("employee_compensation", "employee_allowance")]
        for body, expected in bad_cases:
            with self.subTest(body=body):
                self.assertEqual(request("POST", "/api/employees/1/compensation", body=body)[0], expected)
        self.assertEqual(request("POST", "/api/employees/999/compensation", body=self.new_package())[0], 404)
        after = [self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                 for table in ("employee_compensation", "employee_allowance")]
        self.assertEqual(before, after)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM audit_log WHERE outcome='FAILED'").fetchone()[0], len(bad_cases)+1)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM audit_log WHERE old_values IS NOT NULL OR new_values IS NOT NULL").fetchone()[0], 0)
        self.assertIsNone(self.connection.execute("SELECT effective_to FROM employee_compensation WHERE id=2").fetchone()[0])

    def test_first_package_and_same_date_conflict(self):
        initial = self.new_package(effective_from=self.today.isoformat(), allowances=[])
        self.assertEqual(request("POST", "/api/employees/2/compensation", body=initial)[0], 201)
        self.assertEqual(request("POST", "/api/employees/2/compensation", body=initial)[0], 409)
        self.assertEqual(request("GET", "/api/employees/2/compensation")[1]["current"]["base_pay"], 9000000)

    def test_effective_today_and_following_future_version(self):
        today_package = self.new_package(effective_from=self.today.isoformat())
        self.assertEqual(request("POST", "/api/employees/1/compensation", body=today_package)[0], 201)
        detail = request("GET", "/api/employees/1/compensation")[1]
        self.assertEqual(detail["current"]["base_pay"], 9000000)
        self.assertEqual(detail["history"][0]["base_pay"], 8000000)
        self.assertEqual(detail["history"][0]["effective_to"],
                         (self.today - timedelta(days=1)).isoformat())

        later = self.new_package(base_pay=9500000, effective_from=(self.today + timedelta(days=30)).isoformat())
        self.assertEqual(request("POST", "/api/employees/1/compensation", body=later)[0], 201)
        detail = request("GET", "/api/employees/1/compensation")[1]
        self.assertEqual(detail["current"]["effective_to"],
                         (self.today + timedelta(days=29)).isoformat())
        self.assertEqual(detail["scheduled"][0]["base_pay"], 9500000)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0], 2)


if __name__ == "__main__":
    unittest.main()
