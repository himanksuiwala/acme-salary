"""Reference-data views and allowance writes for ADMIN and HR users."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, StringConstraints

from backend.admin_store import (
    AllowanceTypeConflict, AllowanceTypeNotFound, create_allowance_type,
    get_reference_data, set_allowance_type_status, update_allowance_type,
)
from backend.auth import AuthenticatedUser, require_roles

router = APIRouter(prefix="/api/admin", tags=["administration"])


class AllowanceCreate(BaseModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40,
                                           pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class AllowanceUpdate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class LifecycleChange(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@router.get("/reference-data")
def reference_data(
    _user: Annotated[AuthenticatedUser, Depends(require_roles("ADMIN", "HR"))],
) -> dict:
    return get_reference_data()


def _not_found(error: AllowanceTypeNotFound) -> HTTPException:
    return HTTPException(status_code=404, detail="Allowance type not found")


@router.post("/allowance-types", status_code=status.HTTP_201_CREATED)
def create_allowance(
    payload: AllowanceCreate,
    _user: Annotated[AuthenticatedUser, Depends(require_roles("ADMIN", "HR"))],
) -> dict:
    try:
        return {"allowance_type": create_allowance_type(payload.model_dump())}
    except AllowanceTypeConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.patch("/allowance-types/{allowance_id}")
def update_allowance(
    payload: AllowanceUpdate,
    allowance_id: Annotated[int, Path(ge=1)],
    _user: Annotated[AuthenticatedUser, Depends(require_roles("ADMIN", "HR"))],
) -> dict:
    try:
        return {"allowance_type": update_allowance_type(allowance_id, payload.model_dump())}
    except AllowanceTypeNotFound as error:
        raise _not_found(error) from error


def _change_status(allowance_id: int, payload: LifecycleChange, next_status: str) -> dict:
    try:
        return {"allowance_type": set_allowance_type_status(
            allowance_id, next_status, payload.reason
        )}
    except AllowanceTypeNotFound as error:
        raise _not_found(error) from error


@router.post("/allowance-types/{allowance_id}/archive")
def archive_allowance(
    payload: LifecycleChange,
    allowance_id: Annotated[int, Path(ge=1)],
    _user: Annotated[AuthenticatedUser, Depends(require_roles("ADMIN", "HR"))],
) -> dict:
    return _change_status(allowance_id, payload, "INACTIVE")


@router.post("/allowance-types/{allowance_id}/reactivate")
def reactivate_allowance(
    payload: LifecycleChange,
    allowance_id: Annotated[int, Path(ge=1)],
    _user: Annotated[AuthenticatedUser, Depends(require_roles("ADMIN", "HR"))],
) -> dict:
    return _change_status(allowance_id, payload, "ACTIVE")
