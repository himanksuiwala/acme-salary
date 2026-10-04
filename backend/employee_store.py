"""SQLite reads and versioned writes for the local employee API."""

import json
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta, timezone

from backend.database import connect_database


class EmployeeNotFound(Exception):
    pass


class InvalidReference(Exception):
    pass


class CompensationConflict(Exception):
    pass


EMPLOYEE_FROM = """
FROM employee e
JOIN department d ON d.department_id = e.department_id
JOIN location l ON l.location_id = e.location_id
JOIN country c ON c.country_id = l.country_id
"""

EMPLOYEE_COLUMNS = """
e.employee_id, e.employee_code, e.first_name, e.last_name, e.email,
e.job_title, e.status, e.joining_date,
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
        "status": row["status"],
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


def list_employees(*, search: str | None, country: str | None, department: str | None,
                   role: str | None, status: str | None, page: int, page_size: int) -> dict:
    predicates = []
    parameters: list[str] = []
    if search and search.strip():
        pattern = _like_pattern(search.strip())
        predicates.append("""(casefold(e.first_name) LIKE ? ESCAPE '\\'
            OR casefold(e.last_name) LIKE ? ESCAPE '\\'
            OR casefold(e.first_name || ' ' || e.last_name) LIKE ? ESCAPE '\\'
            OR casefold(e.employee_code) LIKE ? ESCAPE '\\')""")
        parameters.extend([pattern] * 4)
    for column, value in (
        ("c.country_code", country), ("d.department_code", department),
        ("e.job_title", role), ("e.status", status),
    ):
        if value is not None:
            predicates.append(f"casefold({column}) = ?")
            parameters.append(value.strip().casefold())
    where_clause = "WHERE " + " AND ".join(predicates) if predicates else ""
    with closing(_connect()) as connection:
        total = connection.execute(
            f"SELECT COUNT(*) {EMPLOYEE_FROM} {where_clause}", parameters
        ).fetchone()[0]
        rows = connection.execute(
            f"""SELECT {EMPLOYEE_COLUMNS} {EMPLOYEE_FROM} {where_clause}
                ORDER BY e.employee_code COLLATE NOCASE, e.employee_id
                LIMIT ? OFFSET ?""",
            [*parameters, page_size, (page - 1) * page_size],
        ).fetchall()
    return {"page": page, "page_size": page_size, "total": total,
            "items": [_employee_summary(row) for row in rows]}


PACKAGE_COLUMNS = """
ec.id, ec.employee_id, ec.base_pay, ec.variable_pay, ec.pay_frequency,
ec.effective_from, ec.effective_to,
cu.currency_code, cu.currency_name, cu.symbol, cu.decimal_places,
CASE WHEN json_valid(a.new_values) THEN json_extract(a.new_values, '$.reason')
     ELSE NULL END AS change_reason
"""

PACKAGE_FROM = """
FROM employee_compensation ec
JOIN currency cu ON cu.currency_id = ec.currency_id
LEFT JOIN audit_log a ON a.audit_id = (
    SELECT MAX(a2.audit_id) FROM audit_log a2
    WHERE a2.entity_type = 'employee_compensation' AND a2.entity_id = ec.id
      AND a2.action = 'CREATE_COMPENSATION'
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
        "change_reason": row["change_reason"], "allowances": allowances[row["id"]],
    } for row in rows]


def get_compensation_detail(employee_id: int) -> dict:
    today = datetime.now(timezone.utc).date().isoformat()
    with closing(_connect()) as connection:
        employee = _employee(connection, employee_id)
        if employee is None:
            raise EmployeeNotFound
        packages = _packages(connection, employee_id)
    current = next((package for package in packages
                    if package["effective_from"] <= today
                    and (package["effective_to"] is None or today <= package["effective_to"])), None)
    history = [package for package in packages
               if package["effective_to"] is not None and package["effective_to"] < today]
    scheduled = sorted((package for package in packages if package["effective_from"] > today),
                       key=lambda package: package["effective_from"])
    return {"employee": _employee_summary(employee), "current": current,
            "history": history, "scheduled": scheduled}


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
                    "SELECT id FROM allowance_type WHERE upper(code) = upper(?)",
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
            actor = connection.execute(
                "SELECT user_id FROM app_user WHERE username = 'Admin@acme.org' AND role = 'NORMAL_USER' AND status = 'ACTIVE'"
            ).fetchone()
            if actor is None:
                raise RuntimeError("Local audit actor is missing or inactive")
            connection.execute(
                """INSERT INTO audit_log
                   (user_id, action, entity_type, entity_id, old_values, new_values)
                   VALUES (?, 'CREATE_COMPENSATION', 'employee_compensation', ?, ?, ?)""",
                (actor["user_id"], package_id,
                 json.dumps(before) if before is not None else None,
                 json.dumps({"reason": payload["reason"], "package": package})),
            )
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
