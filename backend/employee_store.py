"""SQLite reads and versioned writes for the local employee API."""

import csv
import io
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta, timezone

from backend.database import connect_database
from backend.audit import audited, package_fields, record_event, request_export
from backend.audit_store import csv_safe


class EmployeeNotFound(Exception):
    pass


class InvalidReference(Exception):
    pass


class CompensationConflict(Exception):
    pass


class EmployeeConflict(Exception):
    pass


EMPLOYEE_FROM = """
FROM employee e
JOIN department d ON d.department_id = e.department_id
JOIN location l ON l.location_id = e.location_id
JOIN country c ON c.country_id = l.country_id
"""

EMPLOYEE_COLUMNS = """
e.employee_id, e.employee_code, e.first_name, e.last_name, e.email,
e.job_title, e.employment_type, e.status, e.joining_date, e.termination_date, e.manager_id,
d.department_code, d.department_name,
l.location_id, l.location_name, l.city,
c.country_code, c.country_name
"""


def _connect() -> sqlite3.Connection:
    connection = connect_database()
    connection.row_factory = sqlite3.Row
    connection.create_function(
        "casefold", 1, lambda value: value.casefold() if value is not None else "", deterministic=True
    )
    return connection


def _employee_summary(row: sqlite3.Row) -> dict:
    return {
        "employee_id": row["employee_id"],
        "employee_code": row["employee_code"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "email": row["email"],
        "job_title": row["job_title"],
        "employment_type": row["employment_type"],
        "status": row["status"],
        "joining_date": row["joining_date"],
        "termination_date": row["termination_date"],
        "department": {"code": row["department_code"], "name": row["department_name"]},
        "location": {
            "id": row["location_id"], "name": row["location_name"], "city": row["city"]
        },
        "country": {"code": row["country_code"], "name": row["country_name"]},
    }


def _employee(connection: sqlite3.Connection, employee_id: int) -> sqlite3.Row | None:
    return connection.execute(
        f"SELECT {EMPLOYEE_COLUMNS} {EMPLOYEE_FROM} WHERE e.employee_id = ?", (employee_id,)
    ).fetchone()


def _like_pattern(value: str) -> str:
    escaped = value.casefold().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


DIRECTORY_FROM = EMPLOYEE_FROM + """
LEFT JOIN employee_compensation current_pay ON current_pay.id = (
    SELECT package.id FROM employee_compensation package
    WHERE package.employee_id = e.employee_id
      AND package.effective_from <= date('now')
      AND (package.effective_to IS NULL OR package.effective_to >= date('now'))
    ORDER BY package.effective_from DESC, package.id DESC LIMIT 1
)
LEFT JOIN currency current_currency ON current_currency.currency_id = current_pay.currency_id
"""

PACKAGE_STATE = """
CASE
  WHEN current_pay.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM employee_compensation future
    WHERE future.employee_id = e.employee_id AND future.effective_from > date('now')
  ) THEN 'SCHEDULED_CHANGE'
  WHEN current_pay.id IS NOT NULL THEN 'CURRENT'
  WHEN EXISTS (
    SELECT 1 FROM employee_compensation future
    WHERE future.employee_id = e.employee_id AND future.effective_from > date('now')
  ) THEN 'SCHEDULED'
  WHEN EXISTS (
    SELECT 1 FROM employee_compensation previous
    WHERE previous.employee_id = e.employee_id
  ) THEN 'PAST_ONLY'
  ELSE 'NO_PACKAGE'
END
"""

DIRECTORY_COLUMNS = EMPLOYEE_COLUMNS + """,
current_pay.base_pay AS current_base_pay,
current_pay.pay_frequency AS current_pay_frequency,
current_currency.currency_code AS current_currency_code,
current_currency.currency_name AS current_currency_name,
current_currency.symbol AS current_currency_symbol,
current_currency.decimal_places AS current_currency_decimal_places,
(SELECT MIN(future.effective_from) FROM employee_compensation future
 WHERE future.employee_id = e.employee_id AND future.effective_from > date('now'))
 AS next_effective_from
""" + f", {PACKAGE_STATE} AS package_state"


def _directory_employee(row: sqlite3.Row) -> dict:
    employee = _employee_summary(row)
    employee["package_state"] = row["package_state"]
    employee["next_effective_from"] = row["next_effective_from"]
    employee["current_compensation"] = None if row["current_base_pay"] is None else {
        "base_pay": row["current_base_pay"],
        "pay_frequency": row["current_pay_frequency"],
        "currency": {
            "code": row["current_currency_code"],
            "name": row["current_currency_name"],
            "symbol": row["current_currency_symbol"],
            "decimal_places": row["current_currency_decimal_places"],
        },
    }
    return employee


def _directory_where(*, search: str | None, country: str | None,
                     department: str | None, role: str | None,
                     status: str | None, package_state: str | None,
                     location_id: int | None = None, employed_as_of: bool = False,
                     sql_date: str = "date('now')") -> tuple[str, list[str]]:
    predicates = []
    parameters: list[str] = []
    if search and search.strip():
        pattern = _like_pattern(search.strip())
        predicates.append("""(casefold(e.first_name) LIKE ? ESCAPE '\\'
            OR casefold(e.last_name) LIKE ? ESCAPE '\\'
            OR casefold(e.first_name || ' ' || e.last_name) LIKE ? ESCAPE '\\'
            OR casefold(e.employee_code) LIKE ? ESCAPE '\\')""")
        parameters.extend([pattern] * 4)
    if role == "UNSPECIFIED":
        predicates.append("(e.job_title IS NULL OR trim(e.job_title) = '')")
        role = None
    for column, value in (
        ("c.country_code", country), ("d.department_code", department),
        ("e.job_title", role), ("e.status", status),
    ):
        if value is not None:
            predicates.append(f"casefold({column}) = ?")
            parameters.append(value.strip().casefold())
    if package_state is not None:
        predicates.append(f"({PACKAGE_STATE.replace('date(\'now\')', sql_date)}) = ?")
        parameters.append(package_state)
    if location_id is not None:
        predicates.append("l.location_id = ?")
        parameters.append(location_id)
    if employed_as_of:
        predicates.extend((f"e.joining_date <= {sql_date}",
                           f"(e.termination_date IS NULL OR e.termination_date >= {sql_date})"))
    return ("WHERE " + " AND ".join(predicates) if predicates else "", parameters)


def list_employees(*, search: str | None, country: str | None, department: str | None,
                   role: str | None, status: str | None, package_state: str | None = None,
                   page: int, page_size: int, as_of: date | None = None,
                   location_id: int | None = None, employed_as_of: bool = False) -> dict:
    sql_date = f"'{as_of.isoformat()}'" if as_of else "date('now')"
    directory_from = DIRECTORY_FROM.replace("date('now')", sql_date)
    directory_columns = DIRECTORY_COLUMNS.replace("date('now')", sql_date)
    where_clause, parameters = _directory_where(
        search=search, country=country, department=department, role=role,
        status=status, package_state=package_state, location_id=location_id,
        employed_as_of=employed_as_of, sql_date=sql_date,
    )
    with closing(_connect()) as connection:
        total = connection.execute(
            f"SELECT COUNT(*) {directory_from} {where_clause}", parameters
        ).fetchone()[0]
        rows = connection.execute(
            f"""SELECT {directory_columns} {directory_from} {where_clause}
                ORDER BY e.employee_code COLLATE NOCASE, e.employee_id
                LIMIT ? OFFSET ?""",
            [*parameters, page_size, (page - 1) * page_size],
        ).fetchall()
    return {"page": page, "page_size": page_size, "total": total,
            "items": [_directory_employee(row) for row in rows]}


def get_directory_options() -> dict:
    with closing(_connect()) as connection:
        countries = connection.execute(
            """SELECT c.country_code AS code, c.country_name AS name,
                      cu.currency_code AS default_currency_code
               FROM country c JOIN currency cu ON cu.currency_id = c.default_currency_id
               ORDER BY c.country_name"""
        ).fetchall()
        departments = connection.execute(
            "SELECT department_code AS code, department_name AS name FROM department ORDER BY department_name"
        ).fetchall()
        locations = connection.execute(
            """SELECT l.location_id AS id, l.location_name AS name, l.city,
                      c.country_code AS country_code, c.country_name AS country_name
               FROM location l JOIN country c ON c.country_id = l.country_id
               ORDER BY c.country_name, l.location_name"""
        ).fetchall()
        roles = connection.execute(
            "SELECT DISTINCT job_title FROM employee WHERE job_title IS NOT NULL AND trim(job_title) <> '' ORDER BY job_title"
        ).fetchall()
        statuses = connection.execute(
            "SELECT DISTINCT status FROM employee ORDER BY status"
        ).fetchall()
        currencies = connection.execute(
            "SELECT currency_code AS code, currency_name AS name, symbol, decimal_places FROM currency ORDER BY currency_code"
        ).fetchall()
        allowance_types = connection.execute(
            "SELECT code, name FROM allowance_type WHERE status='ACTIVE' ORDER BY name"
        ).fetchall()
    return {
        "countries": [dict(row) for row in countries],
        "departments": [dict(row) for row in departments],
        "locations": [dict(row) for row in locations],
        "roles": [row[0] for row in roles],
        "statuses": [row[0] for row in statuses],
        "currencies": [dict(row) for row in currencies],
        "allowance_types": [dict(row) for row in allowance_types],
        "package_states": ["CURRENT", "SCHEDULED_CHANGE", "SCHEDULED", "PAST_ONLY", "NO_PACKAGE"],
    }


@audited('EMPLOYEE_CREATED', 'employee')
def create_employee(payload: dict) -> dict:
    with closing(_connect()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")
            department = connection.execute(
                "SELECT department_id FROM department WHERE upper(department_code) = upper(?)",
                (payload["department_code"],),
            ).fetchone()
            location = connection.execute(
                "SELECT location_id FROM location WHERE location_id = ?",
                (payload["location_id"],),
            ).fetchone()
            if department is None or location is None:
                raise InvalidReference("Unknown department or location")
            duplicate = connection.execute(
                """SELECT 1 FROM employee
                   WHERE casefold(employee_code) = ? OR casefold(email) = ? LIMIT 1""",
                (payload["employee_code"].casefold(), payload["email"].casefold()),
            ).fetchone()
            if duplicate is not None:
                raise EmployeeConflict("Employee code or email already exists")
            cursor = connection.execute(
                """INSERT INTO employee
                   (employee_code, first_name, last_name, email, department_id,
                    location_id, job_title, employment_type, joining_date,
                    termination_date, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (payload["employee_code"], payload["first_name"], payload["last_name"],
                 payload["email"], department["department_id"], location["location_id"],
                 payload["job_title"], payload["employment_type"],
                 payload["joining_date"].isoformat(),
                 payload["termination_date"].isoformat() if payload["termination_date"] else None,
                 payload["status"]),
            )
            employee_id = cursor.lastrowid
            employee = _employee(connection, employee_id)
            record_event(connection, action='EMPLOYEE_CREATED', entity_type='employee',
                         entity_id=employee_id, employee_id=employee_id,
                         after=_employee_summary(employee))
            connection.commit()
        except sqlite3.IntegrityError as error:
            connection.rollback()
            raise EmployeeConflict("Employee code or email already exists") from error
        except Exception:
            connection.rollback()
            raise
    return _employee_summary(employee)


@audited('EMPLOYEE_UPDATED', 'employee', employee_arg='employee_id')
def update_employee(employee_id: int, payload: dict) -> dict:
    with closing(_connect()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")
            before = _employee(connection, employee_id)
            if before is None:
                raise EmployeeNotFound
            if payload["termination_date"] and payload["termination_date"] < date.fromisoformat(before["joining_date"]):
                raise InvalidReference("Termination date cannot precede joining date")
            department = connection.execute(
                "SELECT department_id FROM department WHERE upper(department_code) = upper(?)",
                (payload["department_code"],),
            ).fetchone()
            location = connection.execute(
                "SELECT location_id FROM location WHERE location_id = ?", (payload["location_id"],)
            ).fetchone()
            if department is None or location is None:
                raise InvalidReference("Unknown department or location")
            old_summary = _employee_summary(before)
            connection.execute(
                """UPDATE employee SET first_name = ?, last_name = ?, email = ?, job_title = ?,
                   employment_type = ?, department_id = ?, location_id = ?, status = ?, termination_date = ?
                   WHERE employee_id = ?""",
                (payload["first_name"], payload["last_name"], payload["email"], payload["job_title"],
                 payload["employment_type"], department["department_id"], location["location_id"],
                 payload["status"], payload["termination_date"].isoformat() if payload["termination_date"] else None,
                 employee_id),
            )
            updated = _employee(connection, employee_id)
            new_summary = _employee_summary(updated)
            record_event(connection, action='EMPLOYEE_UPDATED', entity_type='employee',
                         entity_id=employee_id, employee_id=employee_id,
                         before=old_summary, after=new_summary)
            connection.commit()
            return new_summary
        except sqlite3.IntegrityError as error:
            connection.rollback()
            raise EmployeeConflict("Email already belongs to another employee") from error
        except Exception:
            connection.rollback()
            raise


@audited('EXPORT_FAILED', 'export')
def export_directory(*, search: str | None, country: str | None,
                     department: str | None, role: str | None,
                     status: str | None, package_state: str | None,
                     as_of: date | None = None, location_id: int | None = None,
                     employed_as_of: bool = False) -> str:
    sql_date = f"'{as_of.isoformat()}'" if as_of else "date('now')"
    directory_from = DIRECTORY_FROM.replace("date('now')", sql_date)
    directory_columns = DIRECTORY_COLUMNS.replace("date('now')", sql_date)
    where_clause, parameters = _directory_where(
        search=search, country=country, department=department, role=role,
        status=status, package_state=package_state, location_id=location_id,
        employed_as_of=employed_as_of, sql_date=sql_date,
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(("employee_code", "first_name", "last_name", "email", "job_title",
                     "department_code", "country_code", "location", "status", "package_state",
                     "current_base_pay_minor_units", "currency_code", "pay_frequency"))
    with closing(_connect()) as connection:
        connection.execute("BEGIN IMMEDIATE")
        try:
            rows = connection.execute(
                f"SELECT {directory_columns} {directory_from} {where_clause} "
                "ORDER BY e.employee_code COLLATE NOCASE, e.employee_id", parameters,
            ).fetchall()
            for row in rows:
                writer.writerow((csv_safe(row["employee_code"]), csv_safe(row["first_name"]),
                                 csv_safe(row["last_name"]), csv_safe(row["email"]),
                                 csv_safe(row["job_title"]), csv_safe(row["department_code"]),
                                 csv_safe(row["country_code"]), csv_safe(row["location_name"]),
                                 csv_safe(row["status"]), row["package_state"],
                                 row["current_base_pay"] if row["current_base_pay"] is not None else "",
                                 row["current_currency_code"] or "",
                                 row["current_pay_frequency"] or ""))
            request_export(connection, dataset='Employee directory',
                           employee_ids=[row['employee_id'] for row in rows],
                           metadata={'row_count':len(rows), 'filters':{
                               'search':search, 'country':country, 'department':department,
                               'role':role, 'status':status, 'package_state':package_state,
                               'as_of':as_of.isoformat() if as_of else None,
                               'location_id':location_id, 'employed_as_of':employed_as_of}})
            connection.commit()
        except Exception:
            connection.rollback()
            raise
    return output.getvalue()


PACKAGE_COLUMNS = """
ec.id, ec.employee_id, ec.base_pay, ec.variable_pay, ec.pay_frequency,
ec.effective_from, ec.effective_to,
cu.currency_code, cu.currency_name, cu.symbol, cu.decimal_places,
COALESCE(a.reason, CASE WHEN json_valid(a.new_values) THEN json_extract(a.new_values, '$.reason') END) AS change_reason,
COALESCE(json_extract(a.metadata, '$.change_trigger'), CASE WHEN json_valid(a.new_values) THEN json_extract(a.new_values, '$.change_trigger') END) AS change_trigger,
COALESCE(json_extract(a.metadata, '$.authorization_reference'), CASE WHEN json_valid(a.new_values) THEN json_extract(a.new_values, '$.authorization_reference') END) AS authorization_reference
"""

PACKAGE_FROM = """
FROM employee_compensation ec
JOIN currency cu ON cu.currency_id = ec.currency_id
LEFT JOIN audit_log a ON a.audit_id = (
    SELECT MAX(a2.audit_id) FROM audit_log a2
    WHERE a2.entity_type = 'employee_compensation' AND a2.entity_id = ec.id
      AND a2.action = 'CREATE_COMPENSATION' AND a2.outcome = 'SUCCESS'
)
"""


def _packages(connection: sqlite3.Connection, employee_id: int) -> list[dict]:
    rows = connection.execute(
        f"SELECT {PACKAGE_COLUMNS} {PACKAGE_FROM} WHERE ec.employee_id = ? ORDER BY ec.effective_from DESC, ec.id DESC",
        (employee_id,),
    ).fetchall()
    if not rows:
        return []
    package_ids = [row["id"] for row in rows]
    placeholders = ",".join("?" for _ in package_ids)
    allowance_rows = connection.execute(
        f"""SELECT ea.compensation_id, at.code, at.name, ea.amount, ea.frequency
            FROM employee_allowance ea JOIN allowance_type at ON at.id = ea.allowance_type_id
            WHERE ea.compensation_id IN ({placeholders}) ORDER BY at.code""",
        package_ids,
    ).fetchall()
    allowances: dict[int, list[dict]] = {package_id: [] for package_id in package_ids}
    for row in allowance_rows:
        allowances[row["compensation_id"]].append({
            "type_code": row["code"], "type_name": row["name"],
            "amount": row["amount"], "frequency": row["frequency"],
        })
    return [{
        "id": row["id"], "base_pay": row["base_pay"],
        "variable_pay": row["variable_pay"],
        "currency": {"code": row["currency_code"], "name": row["currency_name"],
                     "symbol": row["symbol"], "decimal_places": row["decimal_places"]},
        "pay_frequency": row["pay_frequency"],
        "effective_from": row["effective_from"], "effective_to": row["effective_to"],
        "change_reason": row["change_reason"],
        "change_trigger": row["change_trigger"],
        "authorization_reference": row["authorization_reference"],
        "allowances": allowances[row["id"]],
    } for row in rows]


def get_compensation_detail(employee_id: int, as_of: date | None = None) -> dict:
    selected_date = as_of or datetime.now(timezone.utc).date()
    selected = selected_date.isoformat()
    with closing(_connect()) as connection:
        employee = _employee(connection, employee_id)
        if employee is None:
            raise EmployeeNotFound
        packages = _packages(connection, employee_id)
        manager = None
        if employee["manager_id"] is not None:
            manager_row = connection.execute(
                "SELECT employee_id, employee_code, first_name, last_name FROM employee WHERE employee_id = ?",
                (employee["manager_id"],),
            ).fetchone()
            if manager_row is not None:
                manager = dict(manager_row)
    current = next((package for package in packages
                    if package["effective_from"] <= selected
                    and (package["effective_to"] is None or selected <= package["effective_to"])), None)
    history = [package for package in packages
               if package["effective_to"] is not None and package["effective_to"] < selected]
    scheduled = sorted((package for package in packages if package["effective_from"] > selected),
                       key=lambda package: package["effective_from"])
    from backend.audit_store import list_events
    activity = [{
        'id':event['id'], 'action':event['action'], 'created_at':event['timestamp'],
        'actor':event['actor']['name'], 'reason':event['reason'],
        'change_trigger':event['metadata'].get('change_trigger'),
        'authorization_reference':event['metadata'].get('authorization_reference'),
        'effective_from':event['metadata'].get('effective_from'),
    } for event in list_events(employee_id=employee_id, page_size=20)['items']]
    summary = _employee_summary(employee)
    summary["manager"] = manager
    return {"employee": summary, "as_of": selected, "current": current,
            "history": history, "scheduled": scheduled, "activity": activity}


@audited('EXPORT_FAILED', 'employee', employee_arg='employee_id')
def export_employee_compensation(employee_id: int, as_of: date | None = None) -> str:
    detail = get_compensation_detail(employee_id, as_of)
    employee = detail["employee"]
    packages = [*detail["history"], *([detail["current"]] if detail["current"] else []), *detail["scheduled"]]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(("employee_code", "employee_name", "as_of_utc", "package_id", "effective_from",
                     "effective_to", "base_pay_minor_units", "variable_pay_minor_units", "currency_code",
                     "pay_frequency", "allowance_type", "allowance_minor_units", "allowance_frequency", "reason"))
    for package in sorted(packages, key=lambda item: (item["effective_from"], item["id"])):
        for allowance in package["allowances"] or [None]:
            writer.writerow((csv_safe(employee["employee_code"]), csv_safe(employee["first_name"] + " " + employee["last_name"]),
                             detail["as_of"], package["id"], package["effective_from"], package["effective_to"] or "",
                             package["base_pay"], package["variable_pay"] if package["variable_pay"] is not None else "",
                             package["currency"]["code"], package["pay_frequency"],
                             csv_safe(allowance["type_name"]) if allowance else "", allowance["amount"] if allowance else "",
                             allowance["frequency"] if allowance else "", csv_safe(package["change_reason"])))
    with closing(_connect()) as connection:
        with connection:
            request_export(connection, dataset='Employee compensation', employee_ids=[employee_id],
                           metadata={'as_of':detail['as_of'], 'package_count':len(packages)})
    return output.getvalue()


@audited('CREATE_COMPENSATION', 'employee_compensation', employee_arg='employee_id')
def create_compensation(employee_id: int, payload: dict) -> dict:
    """Append a complete package and audit event in one serialized transaction."""
    effective_from = payload["effective_from"]
    today = datetime.now(timezone.utc).date()
    with closing(_connect()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")
            employee = _employee(connection, employee_id)
            if employee is None:
                raise EmployeeNotFound
            latest = connection.execute(
                """SELECT id, effective_from, effective_to FROM employee_compensation
                   WHERE employee_id = ? ORDER BY effective_from DESC, id DESC LIMIT 1""",
                (employee_id,),
            ).fetchone()
            before = _packages(connection, employee_id)[0] if latest else None
            if latest:
                if effective_from < today or effective_from <= date.fromisoformat(latest["effective_from"]):
                    raise CompensationConflict("Effective date must be today or later and after the latest package start")
            elif effective_from < date.fromisoformat(employee["joining_date"]):
                raise CompensationConflict("First package cannot start before employee joining date")

            currency = connection.execute(
                "SELECT currency_id FROM currency WHERE upper(currency_code) = upper(?)",
                (payload["currency_code"],),
            ).fetchone()
            if currency is None:
                raise InvalidReference("Unknown currency code")
            allowance_types = {}
            for allowance in payload["allowances"]:
                row = connection.execute(
                    "SELECT id FROM allowance_type WHERE upper(code) = upper(?) AND status='ACTIVE'",
                    (allowance["type_code"],),
                ).fetchone()
                if row is None:
                    raise InvalidReference(f"Unknown allowance type: {allowance['type_code']}")
                if row["id"] in allowance_types:
                    raise InvalidReference("Duplicate allowance type")
                allowance_types[row["id"]] = allowance

            if latest and (latest["effective_to"] is None or latest["effective_to"] >= effective_from.isoformat()):
                connection.execute(
                    "UPDATE employee_compensation SET effective_to = ? WHERE id = ?",
                    ((effective_from - timedelta(days=1)).isoformat(), latest["id"]),
                )
            cursor = connection.execute(
                """INSERT INTO employee_compensation
                   (employee_id, base_pay, variable_pay, currency_id, pay_frequency, effective_from)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (employee_id, payload["base_pay"], payload["variable_pay"], currency["currency_id"],
                 payload["pay_frequency"], effective_from.isoformat()),
            )
            package_id = cursor.lastrowid
            for type_id, allowance in allowance_types.items():
                connection.execute(
                    """INSERT INTO employee_allowance
                       (compensation_id, allowance_type_id, amount, frequency)
                       VALUES (?, ?, ?, ?)""",
                    (package_id, type_id, allowance["amount"], allowance["frequency"]),
                )
            package = next(package for package in _packages(connection, employee_id)
                           if package["id"] == package_id)
            package["change_reason"] = payload["reason"]
            package["change_trigger"] = payload.get("change_trigger")
            package["authorization_reference"] = payload.get("authorization_reference")
            old_fields, new_fields = package_fields(before), package_fields(package)
            if latest and (latest['effective_to'] is None or latest['effective_to'] >= effective_from.isoformat()):
                old_fields['previous_period.effective_to'] = latest['effective_to']
                new_fields['previous_period.effective_to'] = (effective_from - timedelta(days=1)).isoformat()
            record_event(connection, action='CREATE_COMPENSATION', entity_type='employee_compensation',
                         entity_id=package_id, employee_id=employee_id,
                         before=old_fields, after=new_fields, reason=payload['reason'], metadata={
                             'before_currency':before['currency'] if before else None,
                             'after_currency':package['currency'],
                             'before_frequency':before['pay_frequency'] if before else None,
                             'after_frequency':package['pay_frequency'],
                             'before_allowance_frequencies':{a['type_code']:a['frequency'] for a in before['allowances']} if before else {},
                             'after_allowance_frequencies':{a['type_code']:a['frequency'] for a in package['allowances']},
                             'effective_from':package['effective_from'],
                             'previous_package_id':latest['id'] if latest else None,
                             'change_trigger':payload.get('change_trigger'),
                             'authorization_reference':payload.get('authorization_reference')})
            connection.commit()
            return package
        except sqlite3.IntegrityError as error:
            connection.rollback()
            raise CompensationConflict(str(error)) from error
        except sqlite3.OperationalError as error:
            connection.rollback()
            if error.sqlite_errorname == "SQLITE_BUSY":
                raise CompensationConflict("Database is busy; retry the change") from error
            raise
        except Exception:
            connection.rollback()
            raise
