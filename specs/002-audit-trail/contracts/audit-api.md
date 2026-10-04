# Audit REST contract (local development only)

GET /api/audit/events
GET /api/employees/{employee_id}/audit
- Query: search, action, actor_id, entity_type, outcome (SUCCESS|FAILED), from_date/to_date (YYYY-MM-DD UTC inclusive), page (>=1), page_size (1..100, default20).
- Global endpoint additionally accepts employee_id. Scoped endpoint validates employee existence.
- Response: items[], total, page, page_size, total_pages, summary {events, compensation_changes, completed_exports, failed_operations}.
- Summary computed across all filter matches before pagination; operation counts distinct operation IDs to avoid bulk double-counting.
- Item: id, operation_id, timestamp, action, entity_type, entity_id, employee {id,code,name}|null, actor {id,name,role}, outcome, reason, metadata, changes[{field,before,after}], legacy.
- Stable newest-first timestamp/id order; page beyond last returns empty items with actual total. Invalid date order returns422.

GET /api/audit/options
- actors[{id,name,role}], actions[], entity_types[] sourced from recorded data/actors, no fake entries.

GET /api/audit/events/export
- Same filter parameters; exports all matching records, no pagination.
- CSV includes event/time/action/target/employee/actor/outcome/reason/correlation and readable changed fields; formula-safe text; no-store.
- Snapshot built before its own requested/completed audit events are inserted.

Existing employee write payloads/responses remain unchanged. Export endpoints retain existing CSV formats and filenames. Audit has no update/delete endpoints. Failures record safe status explanations; no validation input values or secrets. No client-supplied actor accepted.
