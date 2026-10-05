"""Central audit writing. Successful events share the caller's transaction.

Decorators handle context and failures; they do not commit business data. Trusted
technical processes pass an explicit actor_name to record_event. Protected HTTP
requests receive their actor from the validated bearer token.
"""
import inspect
import json
import logging
import sqlite3
from contextlib import closing
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import wraps
from uuid import uuid4

from backend.database import connect_database

logger = logging.getLogger(__name__)
SECRET_WORDS = ('password', 'secret', 'token', 'credential', 'authorization_header')


@dataclass
class Operation:
    id: str = field(default_factory=lambda: str(uuid4()))
    actor: str | None = 'Admin@acme.org'
    ip: str | None = None
    failure_recorded: bool = False
    export: dict | None = None


operation_context: ContextVar[Operation | None] = ContextVar('audit_operation', default=None)


def safe_values(value):
    if isinstance(value, dict):
        return {str(key): safe_values(item) for key, item in value.items()
                if not any(word in str(key).casefold() for word in SECRET_WORDS)}
    if isinstance(value, list):
        return [safe_values(item) for item in value]
    return value


def changed_values(before: dict | None, after: dict | None) -> tuple[dict, dict]:
    def flatten(values, prefix=''):
        fields = {}
        for key, value in safe_values(values).items():
            name = f'{prefix}.{key}' if prefix else key
            if isinstance(value, dict):
                fields.update(flatten(value, name))
            else:
                fields[name] = value
        return fields
    before, after = flatten(before or {}), flatten(after or {})
    keys = sorted(before.keys() | after.keys())
    changed = [key for key in keys if before.get(key) != after.get(key)]
    return ({key: before.get(key) for key in changed}, {key: after.get(key) for key in changed})


def record_event(connection: sqlite3.Connection, *, action: str, entity_type: str,
                 entity_id: int | None = None, employee_id: int | None = None,
                 before: dict | None = None, after: dict | None = None,
                 reason: str | None = None, metadata: dict | None = None,
                 outcome: str = 'SUCCESS', actor_name: str | None = None,
                 operation: Operation | None = None) -> int:
    """Append one event, leaving commit/rollback to the caller. Never log secrets."""
    context = operation or operation_context.get() or Operation()
    actor_name = actor_name or context.actor
    actor = connection.execute('SELECT user_id FROM app_user WHERE username=? AND status=?',
                               (actor_name, 'ACTIVE')).fetchone()
    if actor is None:
        raise RuntimeError('Audit actor is missing or inactive')
    if employee_id is not None and connection.execute(
            'SELECT 1 FROM employee WHERE employee_id=?', (employee_id,)).fetchone() is None:
        employee_id = None
    old, new = changed_values(before, after) if outcome == 'SUCCESS' else ({}, {})
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
    cursor = connection.execute('''INSERT INTO audit_log
        (user_id,action,entity_type,entity_id,employee_id,operation_id,outcome,actor_name,
         old_values,new_values,reason,metadata,ip_address,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        (actor[0], action, entity_type, entity_id, employee_id, context.id, outcome, actor_name,
         json.dumps(old) if old else None, json.dumps(new) if new else None,
         reason, json.dumps(safe_values(metadata or {})), context.ip, timestamp, timestamp))
    return cursor.lastrowid


def record_failure(action: str, entity_type: str, entity_id: int | None,
                   employee_id: int | None, reason: str, *, operation: Operation | None = None):
    context = operation or operation_context.get() or Operation()
    if context.failure_recorded:
        return
    # The business transaction has already rolled back and closed its connection.
    with closing(connect_database()) as connection, connection:
        record_event(connection, action=action, entity_type=entity_type, entity_id=entity_id,
                     employee_id=employee_id, outcome='FAILED', reason=reason, operation=context)
    context.failure_recorded = True


def audited(action: str, entity_type: str, *, employee_arg: str | None = None):
    """Operation boundary; success data is recorded explicitly in the transaction."""
    def decorate(function):
        signature = inspect.signature(function)
        @wraps(function)
        def wrapped(*args, **kwargs):
            existing = operation_context.get()
            token = operation_context.set(Operation()) if existing is None else None
            bound = signature.bind(*args, **kwargs)
            employee_id = bound.arguments.get(employee_arg) if employee_arg else None
            try:
                return function(*args, **kwargs)
            except Exception as error:
                # Exception strings may include submitted values or database details.
                names = {'EmployeeNotFound':'Employee not found', 'InvalidReference':'Invalid reference or date',
                         'EmployeeConflict':'Employee data conflicts with an existing record',
                         'CompensationConflict':'Compensation period or data conflict'}
                reason = names.get(type(error).__name__, 'Operation could not be completed')
                try:
                    record_failure(action, 'employee' if employee_arg else entity_type,
                                   employee_id, employee_id, reason)
                except Exception:
                    logger.exception('Unable to persist failed audit operation')
                raise
            finally:
                if token is not None:
                    operation_context.reset(token)
        return wrapped
    return decorate


def package_fields(package: dict | None) -> dict:
    if package is None:
        return {}
    fields = {key: package.get(key) for key in ('base_pay','variable_pay','pay_frequency','effective_from','effective_to')}
    fields['currency'] = package['currency']['code']
    for allowance in package.get('allowances', []):
        for key in ('amount', 'frequency'):
            fields[f"allowances.{allowance['type_code']}.{key}"] = allowance[key]
    return fields


def request_export(connection: sqlite3.Connection, *, dataset: str, employee_ids: list[int], metadata: dict):
    context = operation_context.get()
    if context is None:
        raise RuntimeError('Export requires an audited operation context')
    context.export = {'dataset': dataset, 'employee_ids': sorted(set(employee_ids)), 'metadata':metadata}
    _export_stage(connection, context, 'EXPORT_REQUESTED')


def _export_stage(connection: sqlite3.Connection, context: Operation, action: str, *, failed=False):
    export = context.export
    if export is None:
        return
    metadata = {**export['metadata'], 'dataset':export['dataset'], 'affected_employees':len(export['employee_ids'])}
    if failed:
        metadata = {'dataset':export['dataset'], 'affected_employees':len(export['employee_ids'])}
    kwargs = {'action':action, 'outcome':'FAILED' if failed else 'SUCCESS', 'metadata':metadata,
              'reason':'Response delivery did not finish' if failed else None, 'operation':context}
    record_event(connection, entity_type='export', **kwargs)
    for employee_id in export['employee_ids']:
        record_event(connection, entity_type='employee', entity_id=employee_id, employee_id=employee_id, **kwargs)


def finish_export(context: Operation, *, failed=False):
    with closing(connect_database()) as connection, connection:
        _export_stage(connection, context, 'EXPORT_FAILED' if failed else 'EXPORT_COMPLETED', failed=failed)
    if failed:
        context.failure_recorded = True
