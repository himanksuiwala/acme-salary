"""Read-only compensation analytics endpoints for local development."""
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import Annotated

from backend.analytics_store import export_snapshot, snapshot

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def query_args(
    as_of: date | None = None, country: str | None = None,
    department: str | None = None, role: str | None = None,
    status: str | None = None, location_id: int | None = Query(None, ge=1),
    reporting_currency: str | None = None,
    metric: Literal["base"] = Query("base", deprecated=True),
    period_from: date | None = None, period_to: date | None = None,
):
    selected = as_of or datetime.now(timezone.utc).date()
    start, end = period_from or selected.replace(day=1), period_to or selected
    if start > end:
        raise HTTPException(422, "Period start must be on or before period end")
    if end > selected:
        raise HTTPException(422, "Change period cannot end after the as-of date")
    if reporting_currency and reporting_currency.upper() != "USD":
        raise HTTPException(422, "Analytics reporting currency is fixed to USD")
    return dict(as_of=selected, country=country, department=department, role=role,
                status=status, location_id=location_id, reporting_currency=reporting_currency,
                period_from=start, period_to=end)


AnalyticsQuery = Annotated[dict, Depends(query_args)]


@router.get("/compensation", description="Local development only: no authentication or salary scope enforcement.")
def compensation(query: AnalyticsQuery):
    try:
        return snapshot(**query)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.get("/compensation/export", description="Local development only: unauthenticated CSV export with fixed audit actor.")
def export_compensation(query: AnalyticsQuery):
    try:
        content = export_snapshot(**query)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return Response(content, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="compensation-analytics.csv"',
                             "Cache-Control": "no-store"})
