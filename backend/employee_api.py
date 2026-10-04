"""Local-development employee and compensation REST routes."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, Query, Response
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from backend.employee_store import (
    CompensationConflict, EmployeeConflict, EmployeeNotFound, InvalidReference,
    create_compensation, create_employee, export_directory, get_compensation_detail,
    get_directory_options, list_employees,
)


router = APIRouter(
    prefix="/api",
    tags=["employees"],
)

Money = Annotated[int, Field(strict=True, ge=0, le=9223372036854775807)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Frequency = Literal["ANNUAL", "MONTHLY", "HOURLY"]
PackageState = Literal["CURRENT", "SCHEDULED_CHANGE", "SCHEDULED", "PAST_ONLY", "NO_PACKAGE"]


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


class EmployeeInput(BaseModel):
    employee_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    first_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    last_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    department_code: Code
    location_id: Annotated[int, Field(strict=True, ge=1)]
    job_title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=150)] | None = None
    employment_type: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    joining_date: date
    termination_date: date | None = None
    status: Literal["ACTIVE", "ON_LEAVE", "NOTICE_PERIOD", "TERMINATED", "INACTIVE"] = "ACTIVE"

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        if value.count("@") != 1 or "." not in value.split("@", 1)[1] or any(c.isspace() for c in value):
            raise ValueError("Enter a valid email address")
        return value

    @model_validator(mode="after")
    def valid_dates(self):
        if self.termination_date is not None and self.termination_date < self.joining_date:
            raise ValueError("Termination date cannot be before joining date")
        return self


@router.get(
    "/employees",
    description="Local development only: no authentication or authorization is implemented.",
)
def employees(
    search: str | None = None, country: str | None = None,
    department: str | None = None, role: str | None = None, status: str | None = None,
    package_state: PackageState | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
) -> dict:
    return list_employees(search=search, country=country, department=department,
                          role=role, status=status, package_state=package_state,
                          page=page, page_size=page_size)


@router.get(
    "/employees/directory-options",
    description="Local development only: reference options have no access scoping.",
)
def directory_options() -> dict:
    return get_directory_options()


@router.get(
    "/employees/export",
    description="Local development only: exports are unauthenticated and use a fixed audit actor.",
)
def export_employees(
    search: str | None = None, country: str | None = None,
    department: str | None = None, role: str | None = None,
    status: str | None = None, package_state: PackageState | None = None,
) -> Response:
    content = export_directory(search=search, country=country, department=department,
                               role=role, status=status, package_state=package_state)
    return Response(content=content, media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": 'attachment; filename="employee-directory.csv"',
        "Cache-Control": "no-store",
    })


@router.post(
    "/employees",
    status_code=201,
    description="Local development only: employee creation uses a fixed audit actor.",
)
def add_employee(payload: EmployeeInput) -> dict:
    try:
        employee = create_employee(payload.model_dump())
    except InvalidReference as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except EmployeeConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"employee": employee}


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
