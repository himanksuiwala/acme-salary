# Research: Employee Compensation API

## Existing stack and storage

**Decision**: Reuse Python 3.12, pinned FastAPI/Pydantic and built-in `sqlite3` with schema v3.

**Rationale**: `database.py` already handles path configuration, foreign keys, schema initialization and actor seeding. Schema triggers reject overlapping compensation periods. No schema changes are needed.

**Alternatives considered**: SQLAlchemy and a migration layer add cost without a current need.

## Temporal updates

**Decision**: Model each change as a new complete package. Serialize writers with `BEGIN IMMEDIATE`, close the latest intersecting period to the preceding day, then insert new package and allowances. Reject retrospective changes and dates at/before the latest package start.

**Rationale**: Preserves pay and allowance history and works with inclusive non-overlap triggers.

**Alternatives considered**: In-place edits erase history; independent salary/allowance writes risk incomplete states; backdated inserts require splitting periods and are deferred.

## Money, dates and reference data

**Decision**: Accept integer minor-unit amounts, ISO dates and reference codes. Use UTC date for current classification and submission validation.

**Rationale**: Matches schema semantics and avoids floating-point money and timezone ambiguity.

**Alternatives considered**: Decimal major-unit inputs require conversion; name-based reference lookup is unstable.

## Audit and access

**Decision**: Attribute each successful POST to seeded `Admin@acme.org`; store reason and before/after snapshots in one audit event. Document that no caller is authenticated.

**Rationale**: User chose the temporary actor. The constitution says salary endpoints are not production-ready without auth.

**Alternatives considered**: Caller-provided actor ID is spoofable and was rejected by the user; full login is outside scope.

## Verification

**Decision**: Use repository `unittest` conventions with isolated temporary databases. Exercise HTTP behavior through an ASGI harness without adding a dependency.

**Rationale**: Existing tests use `unittest`; no HTTP test client is installed.
