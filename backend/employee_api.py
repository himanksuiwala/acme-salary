"""Local-development employee and compensation REST routes."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from backend.employee_store import (
    CompensationConflict, EmployeeNotFound, InvalidReference,
    create_compensation, get_compensation_detail, list_employees,
)


router = APIRouter(
    prefix="/api",
    tags=["employees"],
)

Money = Annotated[int, Field(strict=True, ge=0, le=9223372036854775807)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Frequency = Literal["ANNUAL", "MONTHLY", "HOURLY"]


class AllowanceInput(BaseModel):
    type_code: Code
    amount: Money
    frequency: Frequency


class CompensationInput(BaseModel):
    base_pay: Money
    variable_pay: Money | None = None
    currency_code: Code
    pay_frequency: Frequency
    effective_from: date
    reason: Reason
    allowances: list[AllowanceInput]

    @field_validator("effective_from", mode="before")
    @classmethod
    def iso_calendar_date(cls, value):
        if not isinstance(value, str):
            raise ValueError("Effective date must use YYYY-MM-DD")
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise ValueError("Effective date must use YYYY-MM-DD") from error
        if parsed.isoformat() != value:
            raise ValueError("Effective date must use YYYY-MM-DD")
        return parsed

    @model_validator(mode="after")
    def unique_allowance_types(self):
        codes = [allowance.type_code.casefold() for allowance in self.allowances]
        if len(codes) != len(set(codes)):
            raise ValueError("Duplicate allowance type")
        return self


@router.get(
    "/employees",
    description="Local development only: no authentication or authorization is implemented.",
)
def employees(
    search: str | None = None, country: str | None = None,
    department: str | None = None, role: str | None = None, status: str | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
) -> dict:
    return list_employees(search=search, country=country, department=department,
                          role=role, status=status, page=page, page_size=page_size)


@router.get(
    "/employees/{employee_id}/compensation",
    description="Local development only: salary data has no authentication or authorization.",
)
def employee_compensation(employee_id: int = Path(ge=1)) -> dict:
    try:
        return get_compensation_detail(employee_id)
    except EmployeeNotFound as error:
        raise HTTPException(status_code=404, detail="Employee not found") from error


@router.post(
    "/employees/{employee_id}/compensation",
    status_code=201,
    description="Local development only: writes use a fixed audit actor, not an authenticated caller.",
)
def add_compensation(payload: CompensationInput, employee_id: int = Path(ge=1)) -> dict:
    try:
        package = create_compensation(employee_id, payload.model_dump())
    except EmployeeNotFound as error:
        raise HTTPException(status_code=404, detail="Employee not found") from error
    except InvalidReference as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except CompensationConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"compensation": package}
