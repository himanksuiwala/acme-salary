"""Audit context and response lifecycle at the ASGI boundary (no body capture)."""
import asyncio
import logging
import re

from starlette.concurrency import run_in_threadpool

from backend.audit import Operation, finish_export, operation_context, record_failure

logger = logging.getLogger(__name__)


def sensitive_operation(method: str, path: str):
    employee = re.fullmatch(r'/api/employees/(\d+)(/compensation)?(/export)?', path)
    if employee:
        employee_id = int(employee[1])
        if method == 'POST' and employee[2] and not employee[3]:
            return 'CREATE_COMPENSATION', 'employee', employee_id
        if method == 'PATCH' and not employee[2] and not employee[3]:
            return 'EMPLOYEE_UPDATED', 'employee', employee_id
        if method == 'GET' and employee[3]:
            return 'EXPORT_FAILED', 'employee', employee_id
    if method == 'POST' and path == '/api/employees':
        return 'EMPLOYEE_CREATED', 'employee', None
    if method == 'GET' and path in ('/api/employees/export', '/api/audit/events/export', '/api/analytics/compensation/export'):
        return 'EXPORT_FAILED', 'export', None
    return None


class AuditMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        context = Operation(actor=None, ip=(scope.get('client') or (None,))[0])
        token = operation_context.set(context)
        target = sensitive_operation(scope['method'], scope['path'])
        status = 500
        delivery_finished = False
        async def audited_send(message):
            nonlocal status, delivery_finished
            if message['type'] == 'http.response.start':
                status = message['status']
            await send(message)
            if message['type'] == 'http.response.body' and not message.get('more_body', False):
                delivery_finished = True
                if 200 <= status < 300 and context.export is not None:
                    await run_in_threadpool(finish_export, context)
        try:
            await self.app(scope, receive, audited_send)
            if status >= 400 and target and context.actor and not context.failure_recorded:
                action, entity_type, employee_id = target
                reason = {422:'Request validation failed', 404:'Target not found', 409:'Operation conflicts with existing data'}.get(status, 'Operation could not be completed')
                await run_in_threadpool(record_failure, action, entity_type, employee_id, employee_id, reason, operation=context)
        except (Exception, asyncio.CancelledError):
            try:
                if context.export is not None and not delivery_finished:
                    await run_in_threadpool(finish_export, context, failed=True)
                elif target and context.actor and not context.failure_recorded:
                    action, entity_type, employee_id = target
                    await run_in_threadpool(record_failure, action, entity_type, employee_id, employee_id,
                                            'Operation could not be completed', operation=context)
            except Exception:
                logger.exception('Unable to persist failed request audit')
            raise
        finally:
            operation_context.reset(token)
