"""Authentication and authorization through the real ASGI routes."""

import os
import unittest
from datetime import datetime, timedelta, timezone

import jwt

from backend.auth import create_access_token
from backend.passwords import hash_password
from backend.tests import test_employee_api as fixtures
from backend.tests.test_employee_api import request


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.EmployeeApiTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.db = self.fixture.connection

    def login(self, email="Admin@acme.org", password="test-only-password"):
        return request("POST", "/auth/login", body={"email": email, "password": password})

    def bearer(self, token):
        return [(b"authorization", f"Bearer {token}".encode())]

    def test_login_and_protected_request(self):
        status, result = self.login()
        self.assertEqual(status, 200)
        self.assertEqual(set(result), {"access_token", "token_type"})
        self.assertEqual(result["token_type"], "bearer")
        token = result["access_token"]
        claims = jwt.decode(token, os.environ["JWT_SECRET_KEY"], algorithms=["HS256"])
        self.assertEqual(set(claims), {"sub", "exp"})
        self.assertEqual(claims["sub"], "1")
        self.assertEqual(request("GET", "/api/employees", authenticated=False,
                                 headers=self.bearer(token))[0], 200)
        status, me = request("GET", "/auth/me", headers=self.bearer(token))
        self.assertEqual(status, 200)
        self.assertEqual((me["email"], me["role"]), ("Admin@acme.org", "ADMIN"))
        self.assertNotIn("password_hash", me)

    def test_login_rejects_wrong_unknown_and_inactive_account(self):
        self.assertEqual(self.login(password="wrong")[0], 401)
        self.assertEqual(self.login(email="unknown@acme.org")[0], 401)
        with self.db:
            self.db.execute("UPDATE app_user SET status='INACTIVE' WHERE user_id=1")
        self.assertEqual(self.login()[0], 401)

    def test_missing_invalid_expired_and_unknown_user_tokens(self):
        self.assertEqual(request("GET", "/api/employees", authenticated=False)[0], 401)
        self.assertEqual(request("GET", "/api/employees", authenticated=False,
                                 headers=self.bearer("invalid"))[0], 401)
        expired = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
                             os.environ["JWT_SECRET_KEY"], algorithm="HS256")
        self.assertEqual(request("GET", "/api/employees", authenticated=False,
                                 headers=self.bearer(expired))[0], 401)
        self.assertEqual(request("GET", "/api/employees", authenticated=False,
                                 headers=self.bearer(create_access_token(999)))[0], 401)

    def test_token_stops_working_when_user_becomes_inactive(self):
        token = self.login()[1]["access_token"]
        with self.db:
            self.db.execute("UPDATE app_user SET status='INACTIVE' WHERE user_id=1")
        self.assertEqual(request("GET", "/api/employees", authenticated=False,
                                 headers=self.bearer(token))[0], 401)

    def test_token_stops_working_when_user_is_deleted(self):
        with self.db:
            self.db.execute("""INSERT INTO app_user
                (username,email,password_hash,role,status) VALUES(?,?,?,'HR','ACTIVE')""",
                ("temporary@acme.org", "temporary@acme.org", hash_password("test-password")))
        user_id = self.db.execute("SELECT user_id FROM app_user WHERE email='temporary@acme.org'").fetchone()[0]
        token = self.login("temporary@acme.org", "test-password")[1]["access_token"]
        with self.db:
            self.db.execute("DELETE FROM app_user WHERE user_id=?", (user_id,))
        self.assertEqual(request("GET", "/api/employees", authenticated=False,
                                 headers=self.bearer(token))[0], 401)

    def test_hr_role_and_audit_identity_come_from_token(self):
        with self.db:
            self.db.execute("""INSERT INTO app_user
                (username,email,password_hash,first_name,last_name,role,status)
                VALUES(?,?,?,?,?,'HR','ACTIVE')""",
                ("shrishti.singh@acme.com", "shrishti.singh@acme.com",
                 hash_password("test-hr-password"), "Shrishti", "Singh"))
        token = self.login("shrishti.singh@acme.com", "test-hr-password")[1]["access_token"]
        self.assertEqual(request("GET", "/api/analytics/compensation", authenticated=False,
                                 headers=self.bearer(token))[0], 200)
        status, _ = request("POST", "/api/employees/1/compensation", body=self.fixture.new_package(),
                            authenticated=False, headers=[*self.bearer(token), (b"x-mock-user-id", b"1")])
        self.assertEqual(status, 201)
        event = request("GET", "/api/audit/events")[1]["items"][0]
        self.assertEqual((event["actor"]["id"], event["actor"]["name"]),
                         (2, "shrishti.singh@acme.com"))

    def test_unknown_role_cannot_use_workspace(self):
        # A legacy account can carry an old role despite the new schema's role check.
        with self.db:
            self.db.execute("PRAGMA ignore_check_constraints=ON")
            self.db.execute("""INSERT INTO app_user
                (username,email,password_hash,role,status) VALUES(?,?,?,'LEGACY','ACTIVE')""",
                ("legacy@acme.org", "legacy@acme.org", hash_password("test-password")))
            self.db.execute("PRAGMA ignore_check_constraints=OFF")
        token = self.login("legacy@acme.org", "test-password")[1]["access_token"]
        self.assertEqual(request("GET", "/api/employees", authenticated=False,
                                 headers=self.bearer(token))[0], 403)

    def test_health_and_login_are_public(self):
        self.assertEqual(request("GET", "/api/health", authenticated=False)[0], 200)
        self.assertEqual(self.login()[0], 200)

    def test_all_workspace_routers_require_a_token(self):
        for path in ("/api/employees", "/api/analytics/compensation", "/api/audit/events"):
            with self.subTest(path=path):
                self.assertEqual(request("GET", path, authenticated=False)[0], 401)
