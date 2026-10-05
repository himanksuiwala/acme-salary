"""Audit contracts: real data, atomic writes, safe failures and delivery lifecycle."""
import asyncio
import json
import sqlite3
import unittest
from unittest.mock import patch

from backend.database import initialize_database
from backend.auth import create_access_token
from backend.tests import test_employee_api as fixtures
from backend.tests.test_employee_api import request


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.EmployeeApiTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.connection = self.fixture.connection
        with self.connection:
            self.connection.execute("""INSERT INTO app_user
                (username,email,password_hash,first_name,last_name,role,status)
                SELECT 'SYSTEM','system@acme.com',password_hash,'System','Admin','ADMIN','ACTIVE'
                FROM app_user WHERE user_id=1""")

    def test_compensation_diff_scope_and_reason(self):
        self.assertEqual(request('POST', '/api/employees/1/compensation', body=self.fixture.new_package())[0], 201)
        status, result = request('GET', '/api/employees/1/audit')
        self.assertEqual(status, 200)
        event = result['items'][0]
        fields = {item['field']: item for item in event['changes']}
        self.assertEqual(fields['base_pay']['before'], 8000000)
        self.assertEqual(fields['base_pay']['after'], 9000000)
        self.assertIn('allowances.TRANSPORT.amount', fields)
        self.assertIn('previous_period.effective_to', fields)
        self.assertNotIn('employee_id', fields)
        self.assertEqual(event['actor']['name'], 'System Admin')
        self.assertEqual(event['actor']['email'], 'Admin@acme.org')
        self.assertEqual(event['reason'], 'Annual review')
        self.assertEqual(request('GET', '/api/employees/2/audit')[1]['total'], 0)
        self.assertEqual(request('GET', '/api/employees/999/audit')[0], 404)

    def test_currency_frequency_context_and_allowance_addition(self):
        body=self.fixture.new_package(currency_code='GBP',pay_frequency='MONTHLY',
                                      allowances=[{'type_code':'MEAL','amount':15000,'frequency':'ANNUAL'}])
        self.assertEqual(request('POST','/api/employees/2/compensation',body=body)[0],201)
        event=request('GET','/api/employees/2/audit')[1]['items'][0]
        self.assertIsNone(event['metadata']['before_currency'])
        self.assertEqual(event['metadata']['after_currency']['code'],'GBP')
        self.assertEqual(event['metadata']['after_frequency'],'MONTHLY')
        fields={c['field']:c for c in event['changes']}
        self.assertEqual(fields['allowances.MEAL.amount'],{'field':'allowances.MEAL.amount','before':None,'after':15000})
        self.assertEqual(fields['allowances.MEAL.frequency']['after'],'ANNUAL')
        body=self.fixture.new_package(currency_code='GBP',pay_frequency='MONTHLY')
        self.assertEqual(request('POST','/api/employees/1/compensation',body=body)[0],201)
        event=request('GET','/api/employees/1/audit')[1]['items'][0]
        self.assertEqual((event['metadata']['before_currency']['code'],event['metadata']['after_currency']['code']),('USD','GBP'))
        self.assertEqual((event['metadata']['before_frequency'],event['metadata']['after_frequency']),('ANNUAL','MONTHLY'))

    def test_failures_exclude_submitted_values_and_are_not_duplicated(self):
        secret = 'secret-value-not-for-audit'
        for body in (self.fixture.new_package(base_pay=-1, reason=secret),
                     self.fixture.new_package(allowances=[{'type_code':secret,'amount':5,'frequency':'MONTHLY'}])):
            self.assertEqual(request('POST', '/api/employees/1/compensation', body=body)[0], 422)
        result = request('GET', '/api/audit/events', query='outcome=FAILED')[1]
        self.assertEqual(result['total'], 2)
        for event in result['items']:
            self.assertEqual(event['changes'], [])
            self.assertNotIn(secret, json.dumps(event))
            self.assertTrue(event['reason'])
        self.assertEqual(self.connection.execute('SELECT COUNT(*) FROM employee_compensation').fetchone()[0], 2)
        self.assertEqual(request('POST','/api/employees/999/compensation',body=self.fixture.new_package())[0],404)
        unknown=request('GET','/api/audit/events')[1]['items'][0]
        self.assertEqual((unknown['entity_type'],unknown['entity_id'],unknown['employee']),('employee',999,None))

    def test_success_audit_failure_rolls_back_business_write(self):
        from backend.employee_store import create_compensation
        from datetime import date
        payload = self.fixture.new_package()
        payload['effective_from'] = date.fromisoformat(payload['effective_from'])
        with patch('backend.employee_store.record_event', side_effect=RuntimeError('audit unavailable')):
            with self.assertRaises(RuntimeError):
                create_compensation(1, payload)
        self.assertEqual(self.connection.execute('SELECT COUNT(*) FROM employee_compensation').fetchone()[0], 2)
        self.assertIsNone(self.connection.execute('SELECT effective_to FROM employee_compensation WHERE id=2').fetchone()[0])

    def test_append_only_and_system_redaction(self):
        from backend.audit import record_event
        with self.connection:
            record_event(self.connection, action='CONFIG_UPDATED', entity_type='currency', entity_id=1,
                         actor_name='SYSTEM', before={'name':'old','password_hash':'private'},
                         after={'name':'new','password_hash':'changed'})
        event = request('GET', '/api/audit/events')[1]['items'][0]
        self.assertEqual(event['actor']['name'], 'System Admin')
        self.assertEqual(event['actor']['email'], 'system@acme.com')
        self.assertEqual([c['field'] for c in event['changes']], ['name'])
        for sql in ('UPDATE audit_log SET reason = "changed"', 'DELETE FROM audit_log'):
            with self.assertRaises(sqlite3.IntegrityError):
                self.connection.execute(sql)
            self.connection.rollback()
        initialize_database()
        self.assertEqual(request('GET', '/api/audit/events')[1]['total'], 1)

    def test_export_membership_stages_and_summary(self):
        status, _ = request('GET', '/api/employees/export', query='search=EMP001', raw=True)
        self.assertEqual(status, 200)
        global_result = request('GET', '/api/audit/events')[1]
        self.assertEqual(global_result['total'], 4)
        self.assertEqual(global_result['summary']['completed_exports'], 1)
        scoped = request('GET', '/api/employees/1/audit')[1]
        self.assertEqual({e['action'] for e in scoped['items']}, {'EXPORT_REQUESTED','EXPORT_COMPLETED'})
        self.assertEqual(len({e['operation_id'] for e in global_result['items']}), 1)
        self.assertEqual(request('GET', '/api/employees/2/audit')[1]['total'], 0)

    def test_interrupted_export_has_no_completion(self):
        from backend.main import app
        async def receive():
            return {'type':'http.request','body':b'','more_body':False}
        async def send(message):
            if message['type'] == 'http.response.body':
                raise ConnectionError('client disconnected')
        scope = {'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':'GET',
                 'scheme':'http','server':('test',80),'client':('127.0.0.1',1),
                'path':'/api/employees/export','query_string':b'search=EMP001',
                'headers':[(b'authorization', f'Bearer {create_access_token(1)}'.encode())]}
        with self.assertRaises(ConnectionError):
            asyncio.run(app(scope, receive, send))
        async def cancelled_send(message):
            if message['type']=='http.response.body':
                raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            asyncio.run(app(scope, receive, cancelled_send))
        events = request('GET', '/api/audit/events')[1]['items']
        self.assertNotIn('EXPORT_COMPLETED', {e['action'] for e in events})
        self.assertIn('EXPORT_FAILED', {e['action'] for e in events})

    def test_filters_pagination_and_report_snapshot(self):
        request('GET', '/api/employees/export', query='search=EMP001', raw=True)
        status, result = request('GET', '/api/audit/events', query='search=ana&action=EXPORT_COMPLETED&page_size=1')
        self.assertEqual(status, 200)
        self.assertEqual((result['total'], len(result['items'])), (1,1))
        self.assertEqual(request('GET', '/api/audit/events', query='page=99')[1]['items'], [])
        for query in ('page=0','page_size=101','from_date=invalid','from_date=20261004','from_date=1793491200','from_date=2026-10-04&to_date=2026-10-03'):
            self.assertEqual(request('GET', '/api/audit/events', query=query)[0], 422)
        options = request('GET', '/api/audit/options')[1]
        self.assertIn('EXPORT_COMPLETED', options['actions'])
        status, report = request('GET', '/api/audit/events/export', query='action=EXPORT_COMPLETED', raw=True)
        self.assertEqual(status, 200)
        self.assertNotIn('Audit report', report)
        self.assertEqual(request('GET', '/api/audit/events')[1]['summary']['completed_exports'], 2)

    def test_employee_diff_only_filters_and_untrusted_actor_header(self):
        detail = request('GET','/api/employees/1/compensation')[1]['employee']
        payload = {key:detail[key] for key in ('first_name','last_name','email','job_title','employment_type','status','termination_date')}
        payload.update(department_code=detail['department']['code'],location_id=detail['location']['id'],job_title='Senior Analyst')
        request('PATCH','/api/employees/1',body=payload,headers=[(b'x-actor-id',b'2'),(b'x-actor',b'SYSTEM')])
        event = request('GET','/api/audit/events')[1]['items'][0]
        self.assertEqual(event['actor']['name'],'System Admin')
        self.assertEqual(event['changes'],[{'field':'job_title','before':'Analyst','after':'Senior Analyst'}])
        for query in ('actor_id=2','entity_type=currency','from_date=2000-01-01&to_date=2000-01-01','search=%25'):
            self.assertEqual(request('GET','/api/audit/events',query=query)[1]['total'],0)
        self.assertEqual(request('GET','/api/audit/events',query='actor_id=1&entity_type=employee')[1]['total'],1)
        self.assertEqual(request('GET','/api/audit/events',query=f"search={event['operation_id']}")[1]['total'],1)

    def test_report_csv_is_formula_safe_and_legacy_export_is_not_a_change(self):
        from backend.audit import record_event
        with self.connection:
            record_event(self.connection,action='EMPLOYEE_UPDATED',entity_type='employee',entity_id=1,employee_id=1,
                         before={'job_title':'Analyst'},after={'job_title':'=2+2'},reason='=unsafe')
            self.connection.execute("INSERT INTO audit_log(user_id,action,entity_type,entity_id,employee_id,new_values,metadata) VALUES(1,'DATA_EXPORTED','employee',1,1,?,?)",
                                    (json.dumps({'as_of':'2026-10-04','package_count':2}),json.dumps({'legacy':True})))
        legacy = request('GET','/api/employees/1/audit',query='action=DATA_EXPORTED')[1]['items'][0]
        self.assertEqual(legacy['changes'],[])
        self.assertEqual(legacy['metadata']['package_count'],2)
        status, report = request('GET','/api/audit/events/export',query='action=EMPLOYEE_UPDATED',raw=True)
        self.assertEqual(status,200)
        self.assertIn("'=unsafe",report)
        self.assertNotIn('password_hash',report)

    def test_v3_migration_preserves_legacy_and_links_employee(self):
        # Build a faithful v3 audit table while retaining all seeded business records.
        with self.connection:
            for name, in self.connection.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='audit_log'").fetchall():
                self.connection.execute(f'DROP TRIGGER {name}')
            self.connection.execute('DROP TABLE audit_log')
            self.connection.execute('''CREATE TABLE audit_log (audit_id INTEGER PRIMARY KEY,
                user_id INTEGER REFERENCES app_user(user_id), action TEXT NOT NULL, entity_type TEXT NOT NULL,
                entity_id INTEGER, old_values TEXT, new_values TEXT, ip_address TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
            self.connection.execute('''INSERT INTO audit_log(audit_id,user_id,action,entity_type,entity_id,new_values)
                VALUES(88,1,'CREATE_COMPENSATION','employee_compensation',2,?)''', (json.dumps({'reason':'Legacy review','package':{'base_pay':8000000}}),))
            self.connection.execute("UPDATE audit_log SET created_at='2020-01-01 00:00:00', updated_at='2020-01-01 00:00:00'")
            self.connection.execute("CREATE TRIGGER audit_log_touch_updated_at AFTER UPDATE ON audit_log BEGIN UPDATE audit_log SET updated_at=CURRENT_TIMESTAMP WHERE audit_id=NEW.audit_id; END")
            self.connection.execute('PRAGMA user_version=3')
        initialize_database()
        event = request('GET', '/api/employees/1/audit')[1]['items'][0]
        self.assertEqual((event['id'], event['reason'], event['legacy']), (88,'Legacy review',True))
        self.assertEqual(self.connection.execute('SELECT created_at,updated_at FROM audit_log WHERE audit_id=88').fetchone(),('2020-01-01 00:00:00','2020-01-01 00:00:00'))
        self.assertEqual(self.connection.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(self.connection.execute('SELECT COUNT(*) FROM employee').fetchone()[0],25)
