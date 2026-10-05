"""Email/password sign-in and bearer-token dependencies for the existing API."""

import os
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from backend.audit import operation_context
from backend.database import connect_database
from backend.passwords import verify_password

bearer = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/auth", tags=["auth"])


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: int
    username: str
    email: str
    first_name: str | None
    last_name: str | None
    role: str


class LoginInput(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def auth_config() -> tuple[str, int]:
    secret = os.getenv("JWT_SECRET_KEY", "")
    if len(secret.encode("utf-8")) < 32:
        raise RuntimeError("JWT_SECRET_KEY must contain at least 32 bytes")
    try:
        minutes = int(os.environ["JWT_ACCESS_MINUTES"])
    except (KeyError, ValueError) as error:
        raise RuntimeError("JWT_ACCESS_MINUTES must be a positive integer") from error
    if not 1 <= minutes <= 1440:
        raise RuntimeError("JWT_ACCESS_MINUTES must be between 1 and 1440")
    return secret, minutes


def create_access_token(user_id: int) -> str:
    secret, minutes = auth_config()
    expires = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode({"sub": str(user_id), "exp": expires}, secret, algorithm="HS256")


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                         detail="Could not validate credentials",
                         headers={"WWW-Authenticate": "Bearer"})


def _user_from_row(row: sqlite3.Row | tuple) -> AuthenticatedUser:
    return AuthenticatedUser(*row)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()
    secret, _ = auth_config()
    try:
        claims = jwt.decode(credentials.credentials, secret, algorithms=["HS256"],
                            options={"require": ["sub", "exp"]})
        subject = claims["sub"]
        if not isinstance(subject, str) or not subject.isdecimal() or int(subject) < 1:
            raise ValueError("Invalid subject")
    except (jwt.InvalidTokenError, ValueError, TypeError) as error:
        raise _unauthorized() from error
    with closing(connect_database()) as connection:
        row = connection.execute("""SELECT user_id,username,email,first_name,last_name,role
            FROM app_user WHERE user_id=? AND status='ACTIVE'""", (int(subject),)).fetchone()
    if row is None:
        raise _unauthorized()
    user = _user_from_row(row)
    context = operation_context.get()
    if context is not None:
        context.actor = user.username
    return user


def require_roles(*roles: str):
    def check(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return check


@router.post("/login", response_model=TokenResponse)
def login(credentials: LoginInput) -> TokenResponse:
    email = credentials.email.strip().casefold()
    with closing(connect_database()) as connection:
        row = connection.execute("""SELECT user_id,password_hash,status FROM app_user
            WHERE lower(email)=?""", (email,)).fetchone()
    if row is None or not verify_password(credentials.password, row[1]) or row[2] != "ACTIVE":
        raise HTTPException(status_code=401, detail="Invalid email or password",
                            headers={"WWW-Authenticate": "Bearer"})
    return TokenResponse(access_token=create_access_token(row[0]))


@router.get("/me")
def me(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> dict:
    return {"user_id": user.user_id, "email": user.email,
            "first_name": user.first_name, "last_name": user.last_name, "role": user.role}
