"""Tests for static file serving and SPA fallback."""

import os
import unittest

from backend.tests import test_employee_api as fixtures
from backend.tests.test_employee_api import request


class SpaServingTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.EmployeeApiTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def test_root_returns_html(self):
        status, content = request("GET", "/", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("<html", content.lower())

    def test_client_route_falls_back_to_index_html(self):
        status, content = request("GET", "/employees/detail/1", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("<html", content.lower())

    def test_api_404_returns_json_not_html(self):
        status, body = request("GET", "/api/unknown-endpoint-12345")
        self.assertEqual(status, 404)
        self.assertEqual(body.get("detail"), "Not Found")

    def test_auth_404_returns_json_not_html(self):
        status, body = request("GET", "/auth/unknown-endpoint-12345")
        self.assertEqual(status, 404)
        self.assertEqual(body.get("detail"), "Not Found")
