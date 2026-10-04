# Audit data model

Extend audit_log in schema version 4 without rebuilding business tables:
- employee_id nullable FK -> employee; compensation events resolve to their employee; legacy unresolved targets remain null.
- operation_id text identifies one logical request and correlates summary/per-employee export stages.
- outcome SUCCESS or FAILED, historical default SUCCESS.
- actor_name historical snapshot; existing app_user FK retained.
- reason optional explanation; failed entries contain safe failure reason, never submitted values.
- metadata valid JSON: safe dataset/count/filter context; compensation currency/frequency/effective date/trigger/reference; legacy marker where relevant.
- old_values/new_values remain JSON, new entries contain changed fields only. Normalize compensation business fields and named allowances; compare without storage IDs/timestamps. Include previous effective-period closure.
- created_at/updated_at retained for compatibility, immutable once inserted; UTC timestamp.

Indexes: employee/time/id, time/id, action, operation ID; actor index already exists. BEFORE UPDATE/DELETE guards prevent normal modification. This is append-only application storage, not a tamper-proof crypto ledger. Events retained indefinitely. No new user table or auth model.
