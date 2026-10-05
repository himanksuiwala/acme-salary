"""Audit reading and reporting routes."""
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from pydantic import BeforeValidator

from backend.audit_store import audit_options, export_audit, list_events
from backend.database import connect_database
from contextlib import closing

router = APIRouter(prefix='/api',tags=['audit'])


def iso_date(value):
    if not isinstance(value, str):
        raise ValueError('Date must use YYYY-MM-DD')
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError('Date must use YYYY-MM-DD')
    return parsed


IsoDate = Annotated[date, BeforeValidator(iso_date)]


def filters(search: str | None = Query(None,max_length=200), action: str | None = None,
            actor_id: int | None = Query(None,ge=1), entity_type: str | None = None,
            outcome: Literal['SUCCESS','FAILED'] | None = None,
            from_date: IsoDate | None = None, to_date: IsoDate | None = None):
    if from_date and to_date and from_date > to_date:
        raise HTTPException(422,'From date must be on or before to date')
    return dict(search=search,action=action,actor_id=actor_id,entity_type=entity_type,
                outcome=outcome,from_date=from_date,to_date=to_date)


Filters = Annotated[dict, Depends(filters)]


@router.get('/audit/events', description='Audit events for authenticated HR and admin users.')
def events(query: Filters, page: int = Query(1,ge=1), page_size: int = Query(20,ge=1,le=100),
           employee_id: int | None = Query(None,ge=1)):
    return list_events(**query,employee_id=employee_id,page=page,page_size=page_size)


@router.get('/audit/options')
def options():
    return audit_options()


@router.get('/audit/events/export', description='Filtered CSV snapshot; audit of this export is appended after snapshot generation.')
def report(query: Filters, employee_id: int | None = Query(None,ge=1)):
    return Response(export_audit(**query,employee_id=employee_id), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition':'attachment; filename="audit-report.csv"','Cache-Control':'no-store'})


@router.get('/employees/{employee_id}/audit')
def employee_audit(query: Filters, employee_id: int = Path(ge=1),
                   page: int = Query(1,ge=1), page_size: int = Query(20,ge=1,le=100)):
    with closing(connect_database()) as connection:
        if connection.execute('SELECT 1 FROM employee WHERE employee_id=?',(employee_id,)).fetchone() is None:
            raise HTTPException(404,'Employee not found')
    return list_events(**query,employee_id=employee_id,page=page,page_size=page_size)
