"""Focused analytics contract, calculation and FX migration checks."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.database import connect_database, initialize_database
from backend.fx_reference import FX_REFERENCE_DATE, FX_REFERENCE_SOURCE, seed_usd_reference_rates, usd_rate
from backend.main import app


def request(path, query="", raw=False):
    messages = []
    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}
    async def send(message):
        messages.append(message)
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
             "method": "GET", "scheme": "http", "server": ("test", 80),
             "client": ("127.0.0.1", 12345), "path": path,
             "raw_path": path.encode(), "query_string": query.encode(), "headers": []}
    asyncio.run(app(scope, receive, send))
    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    content = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, content.decode() if raw else json.loads(content)


class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        env = patch.dict(os.environ, {"DB_PATH": str(Path(directory.name) / "test.db")})
        env.start()
        self.addCleanup(env.stop)
        initialize_database()
        self.db = connect_database()
        self.addCleanup(self.db.close)
        with self.db:
            self.db.executemany(
                "INSERT INTO currency(currency_code,currency_name,symbol,decimal_places) VALUES(?,?,?,2)",
                [("USD", "US Dollar", "$"), ("GBP", "Pound", "£")])
            self.db.executemany("INSERT INTO country(country_code,country_name,default_currency_id) VALUES(?,?,?)",
                                [("US", "United States", 1), ("GB", "United Kingdom", 2)])
            self.db.executemany("INSERT INTO location(country_id,location_name) VALUES(?,?)",
                                [(1, "New York"), (2, "London")])
            self.db.execute("INSERT INTO department(department_code,department_name) VALUES('ENG','Engineering')")
            self.db.execute("INSERT INTO allowance_type(code,name) VALUES('MEAL','Meal')")
            for index in range(1, 6):
                self.db.execute("""INSERT INTO employee(employee_code,first_name,last_name,email,department_id,location_id,job_title,joining_date,status)
                    VALUES(?,?,?,?,1,?,'Engineer','2020-01-01','ACTIVE')""",
                    (f"E{index}", "Person", str(index), f"p{index}@test.org", 1 if index in (1,2,5) else 2))
            packages = [(1, 1000000, 1, 'ANNUAL'), (2, 200000, 1, 'MONTHLY'),
                        (3, 3000000, 2, 'ANNUAL'), (4, 2000, 2, 'HOURLY')]
            for employee, amount, currency, frequency in packages:
                self.db.execute("""INSERT INTO employee_compensation(employee_id,base_pay,variable_pay,currency_id,pay_frequency,effective_from)
                    VALUES(?,?,?,?,?,'2026-01-01')""",
                    (employee, amount, 0 if employee == 1 else None, currency, frequency))
            self.db.execute("INSERT INTO employee_allowance(compensation_id,allowance_type_id,amount,frequency) VALUES(1,1,10000,'MONTHLY')")
            seed_usd_reference_rates(self.db)

    def test_as_of_summary_exclusions_and_distribution(self):
        status, data = request("/api/analytics/compensation",
                               "as_of=2026-10-05&country=US")
        self.assertEqual(status, 200)
        self.assertEqual(data["coverage"]["employee_count"], 3)
        self.assertEqual(data["metrics"]["base"]["sum"], 3400000)
        self.assertEqual(data["metrics"]["base"]["median"], 1700000)
        self.assertNotIn("metric", data["context"]["filters"])
        self.assertEqual(data["metrics"]["variable"]["included"], 1)
        self.assertEqual(data["coverage"]["no_package"], 1)
        self.assertEqual(sum(bin["count"] for bin in data["distribution"]), 2)
        self.assertEqual(request("/api/analytics/compensation", "as_of=2025-01-01")[1]["coverage"]["no_package"], 5)
        empty = request("/api/analytics/compensation", "as_of=2019-01-01")[1]
        self.assertEqual(empty["coverage"]["employee_count"], 0)
        self.assertEqual(empty["distribution"], [])

    def test_large_cohort_returns_aggregates_only(self):
        with self.db:
            self.db.executemany("""INSERT INTO employee(employee_code,first_name,last_name,email,department_id,location_id,job_title,joining_date,status)
                VALUES(?, 'Person', 'Bulk', ?, 1, 1, 'Engineer', '2020-01-01', 'ACTIVE')""",
                ((f"B{index}", f"b{index}@test.org") for index in range(10000)))
        status, data = request("/api/analytics/compensation", "as_of=2026-10-05&country=US")
        self.assertEqual(status, 200)
        self.assertEqual(data["coverage"]["employee_count"], 10003)
        self.assertEqual(data["metrics"]["base"]["excluded"], 10001)
        self.assertLess(len(json.dumps(data)), 100000)

    def test_fixed_usd_reference_set_and_missing_fx_is_partial(self):
        data = request("/api/analytics/compensation", "as_of=2026-10-05")[1]
        self.assertEqual(data["context"]["reporting_currency"]["code"], "USD")
        self.assertEqual(data["context"]["fx_reference_date"], FX_REFERENCE_DATE)
        self.assertEqual(data["metrics"]["base"]["sum"], 7375000)
        self.assertTrue(data["metrics"]["base"]["partial"])
        self.assertEqual(data["coverage"]["missing_fx"], 0)
        self.assertEqual(data["breakdowns"]["country"][0]["exclusion_reasons"], {"hourly": 1})
        self.assertEqual(data["coverage"]["rates"][0]["rate_date"], FX_REFERENCE_DATE)
        self.assertEqual(data["coverage"]["rates"][0]["source_name"], FX_REFERENCE_SOURCE)
        with self.db:
            self.db.execute("DELETE FROM fx_rate WHERE source_currency_id=2")
            self.db.execute("""INSERT INTO fx_rate(source_currency_id,target_currency_id,rate_date,rate,source,approved)
                VALUES(2,1,'2026-10-05','9','Unrelated rate',1)""")
        data = request("/api/analytics/compensation", "as_of=2026-10-05")[1]
        self.assertEqual(data["metrics"]["base"]["sum"], 3400000)
        self.assertTrue(data["metrics"]["base"]["partial"])  # Hourly and no-package exclusions remain.
        self.assertEqual(data["coverage"]["missing_fx"], 1)
        self.assertEqual(data["coverage"]["missing_fx_currencies"], ["GBP"])
        self.assertEqual(data["breakdowns"]["country"][0]["exclusion_reasons"],
                         {"missing_fx": 1, "hourly": 1})

    def test_dates_filters_and_export_audit(self):
        self.assertEqual(request("/api/analytics/compensation", "as_of=bad")[0], 422)
        self.assertEqual(request("/api/analytics/compensation", "reporting_currency=XXX")[0], 422)
        self.assertEqual(request("/api/analytics/compensation", "metric=base")[0], 200)
        self.assertEqual(request("/api/analytics/compensation", "metric=variable")[0], 422)
        self.assertEqual(request("/api/analytics/compensation/export", "metric=target")[0], 422)
        self.assertEqual(request("/api/analytics/compensation", "period_from=2026-10-06&period_to=2026-10-05")[0], 422)
        status, csv_data = request("/api/analytics/compensation/export",
                                   "as_of=2026-10-05&country=US", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("annualized base", csv_data.lower())
        self.assertIn("2026-10-05", csv_data)
        self.assertIn("3400000", csv_data)
        self.assertIn("FX reference date,2026-09-25", csv_data)
        self.assertNotIn("Filter metric", csv_data)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit_log WHERE action='EXPORT_COMPLETED' AND entity_type='export'").fetchone()[0], 1)

    def test_directory_drilldown_uses_selected_date_and_employment(self):
        with self.db:
            self.db.execute("UPDATE employee SET termination_date='2026-07-01' WHERE employee_id=5")
        status, listing = request("/api/employees", "as_of=2026-10-05&employed_as_of=true&location_id=1&status=ACTIVE")
        self.assertEqual(status, 200)
        self.assertEqual(listing["total"], 2)
        status, listing = request("/api/employees", "as_of=2025-10-05&employed_as_of=true&location_id=1&status=ACTIVE")
        self.assertEqual(status, 200)
        self.assertEqual(listing["total"], 3)
        self.assertEqual({item["package_state"] for item in listing["items"]}, {"SCHEDULED", "NO_PACKAGE"})
        self.assertTrue(all(item["current_compensation"] is None for item in listing["items"]))

    def test_changes_only_compare_matching_currency_and_frequency(self):
        with self.db:
            self.db.execute("UPDATE employee_compensation SET effective_to='2026-05-31' WHERE employee_id=1")
            self.db.execute("""INSERT INTO employee_compensation(employee_id,base_pay,currency_id,pay_frequency,effective_from)
                VALUES(1,1200000,1,'ANNUAL','2026-06-01')""")
        data = request("/api/analytics/compensation", "as_of=2026-10-05&country=US&period_from=2026-06-01&period_to=2026-06-30")[1]
        self.assertEqual(data["changes"]["count"], 1)
        self.assertEqual(data["changes"]["items"][0]["percentage"], 20.0)
        self.assertEqual(data["changes"]["items"][0]["previous_decimal_places"], 2)

    def test_conversion_respects_currency_precision(self):
        with self.db:
            self.db.execute("UPDATE currency SET decimal_places=0 WHERE currency_code='GBP'")
            self.db.execute("UPDATE employee_compensation SET base_pay=30000 WHERE employee_id=3")
        data = request("/api/analytics/compensation", "as_of=2026-10-05")[1]
        self.assertEqual(data["metrics"]["base"]["sum"], 7375000)

    def test_reference_rates_cover_seed_currencies_and_invert_quotes(self):
        with self.db:
            self.db.executemany("INSERT INTO currency(currency_code,currency_name,decimal_places) VALUES(?,?,2)",
                                [("EUR", "Euro"), ("INR", "Rupee"), ("SGD", "Singapore Dollar")])
            seed_usd_reference_rates(self.db)
            seed_usd_reference_rates(self.db)
        rows = self.db.execute("SELECT c.currency_code,r.rate,r.rate_date FROM fx_rate r JOIN currency c ON c.currency_id=r.source_currency_id").fetchall()
        rates = {code: (rate, day) for code, rate, day in rows}
        self.assertEqual(set(rates), {"GBP", "EUR", "INR", "SGD"})
        self.assertEqual(rates["EUR"], ("1.1400", FX_REFERENCE_DATE))
        self.assertEqual(rates["SGD"][0], usd_rate("1.2771", "SOURCE_PER_USD"))
        self.assertEqual(request("/api/analytics/compensation", "reporting_currency=GBP")[0], 422)

    def test_export_includes_changes_beyond_screen_limit(self):
        with self.db:
            for index in range(6, 57):
                self.db.execute("""INSERT INTO employee(employee_code,first_name,last_name,email,department_id,location_id,job_title,joining_date,status)
                    VALUES(?,?,?,?,1,1,'Engineer','2020-01-01','ACTIVE')""",
                    (f"E{index}", "Person", str(index), f"p{index}@test.org"))
                self.db.execute("""INSERT INTO employee_compensation(employee_id,base_pay,currency_id,pay_frequency,effective_from)
                    VALUES(?,1000000,1,'ANNUAL','2026-10-02')""", (index,))
        query = "as_of=2026-10-05&country=US&period_from=2026-10-01&period_to=2026-10-05"
        data = request("/api/analytics/compensation", query)[1]
        self.assertEqual(data["changes"]["count"], 51)
        self.assertEqual(len(data["changes"]["items"]), 50)
        status, csv_data = request("/api/analytics/compensation/export", query, raw=True)
        self.assertEqual(status, 200)
        self.assertIn("Person 6,E6,2026-10-02", csv_data)

    def test_version_five_reinitializes_without_data_loss(self):
        initialize_database()
        self.assertEqual(self.db.execute("PRAGMA user_version").fetchone()[0], 5)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee").fetchone()[0], 5)

    def test_version_four_migration_adds_fx_without_touching_salaries(self):
        with self.db:
            self.db.execute("DROP TABLE fx_rate")
            self.db.execute("PRAGMA user_version=4")
        initialize_database()
        self.assertEqual(self.db.execute("PRAGMA user_version").fetchone()[0], 5)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM employee_compensation").fetchone()[0], 4)
        self.assertIsNotNone(self.db.execute("SELECT name FROM sqlite_master WHERE name='fx_rate'").fetchone())
