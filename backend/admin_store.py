"""Read-only configuration views and governed allowance-type writes."""

import sqlite3
from contextlib import closing

from backend.audit import record_event
from backend.database import connect_database


class AllowanceTypeNotFound(Exception):
    pass


class AllowanceTypeConflict(Exception):
    pass


def _connect() -> sqlite3.Connection:
    connection = connect_database()
    connection.row_factory = sqlite3.Row
    return connection


def _allowance(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "code": row["code"], "name": row["name"],
        "description": row["description"], "status": row["status"],
        "created_at": row["created_at"], "updated_at": row["updated_at"],
    }


def get_reference_data() -> dict:
    with closing(_connect()) as connection:
        allowances = connection.execute(
            "SELECT * FROM allowance_type ORDER BY name COLLATE NOCASE, id"
        ).fetchall()
        countries = connection.execute("""SELECT c.country_id AS id,c.country_code AS code,
            c.country_name AS name,cu.currency_code AS default_currency
            FROM country c JOIN currency cu ON cu.currency_id=c.default_currency_id
            ORDER BY c.country_name COLLATE NOCASE""").fetchall()
        locations = connection.execute("""SELECT l.location_id AS id,l.location_name AS name,
            l.city,l.state,c.country_code AS country_code,c.country_name AS country_name
            FROM location l JOIN country c ON c.country_id=l.country_id
            ORDER BY c.country_name COLLATE NOCASE,l.location_name COLLATE NOCASE""").fetchall()
        departments = connection.execute("""SELECT d.department_id AS id,d.department_code AS code,
            d.department_name AS name,d.manager_id,
            CASE WHEN e.employee_id IS NULL THEN NULL ELSE e.first_name || ' ' || e.last_name END AS manager_name
            FROM department d LEFT JOIN employee e ON e.employee_id=d.manager_id
            ORDER BY d.department_name COLLATE NOCASE""").fetchall()
        currencies = connection.execute("""SELECT currency_id AS id,currency_code AS code,
            currency_name AS name,symbol,decimal_places FROM currency
            ORDER BY currency_code COLLATE NOCASE""").fetchall()
        rates = connection.execute("""SELECT r.id,source.currency_code AS source_currency,
            target.currency_code AS target_currency,r.rate_date,r.rate,r.source,r.approved
            FROM fx_rate r JOIN currency source ON source.currency_id=r.source_currency_id
            JOIN currency target ON target.currency_id=r.target_currency_id
            ORDER BY r.rate_date DESC,source.currency_code,target.currency_code""").fetchall()
    return {
        "allowance_types": [_allowance(row) for row in allowances],
        "countries": [dict(row) for row in countries],
        "locations": [dict(row) for row in locations],
        "departments": [dict(row) for row in departments],
        "currencies": [dict(row) for row in currencies],
        "fx_rates": [{**dict(row), "approved": bool(row["approved"])} for row in rates],
    }


def create_allowance_type(payload: dict) -> dict:
    with closing(_connect()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")
            cursor = connection.execute(
                "INSERT INTO allowance_type(code,name,description) VALUES(?,?,?)",
                (payload["code"].upper(), payload["name"], payload.get("description")),
            )
            row = connection.execute("SELECT * FROM allowance_type WHERE id=?", (cursor.lastrowid,)).fetchone()
            result = _allowance(row)
            record_event(connection, action="ALLOWANCE_TYPE_CREATED", entity_type="allowance_type",
                         entity_id=result["id"], after=result)
            connection.commit()
            return result
        except sqlite3.IntegrityError as error:
            connection.rollback()
            raise AllowanceTypeConflict("Allowance code already exists") from error


def update_allowance_type(allowance_id: int, payload: dict) -> dict:
    with closing(_connect()) as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT * FROM allowance_type WHERE id=?", (allowance_id,)).fetchone()
        if row is None:
            connection.rollback()
            raise AllowanceTypeNotFound
        before = _allowance(row)
        connection.execute("UPDATE allowance_type SET name=?,description=? WHERE id=?",
                           (payload["name"], payload.get("description"), allowance_id))
        result = _allowance(connection.execute(
            "SELECT * FROM allowance_type WHERE id=?", (allowance_id,)
        ).fetchone())
        record_event(connection, action="ALLOWANCE_TYPE_UPDATED", entity_type="allowance_type",
                     entity_id=allowance_id, before=before, after=result)
        connection.commit()
        return result


def set_allowance_type_status(allowance_id: int, status: str, reason: str) -> dict:
    with closing(_connect()) as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT * FROM allowance_type WHERE id=?", (allowance_id,)).fetchone()
        if row is None:
            connection.rollback()
            raise AllowanceTypeNotFound
        before = _allowance(row)
        if before["status"] != status:
            connection.execute("UPDATE allowance_type SET status=? WHERE id=?", (status, allowance_id))
        result = _allowance(connection.execute(
            "SELECT * FROM allowance_type WHERE id=?", (allowance_id,)
        ).fetchone())
        action = "ALLOWANCE_TYPE_ARCHIVED" if status == "INACTIVE" else "ALLOWANCE_TYPE_REACTIVATED"
        record_event(connection, action=action, entity_type="allowance_type", entity_id=allowance_id,
                     before=before, after=result, reason=reason)
        connection.commit()
        return result
