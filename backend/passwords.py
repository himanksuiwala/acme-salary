"""Password hashing shared by account migration and sign-in."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        return password_hasher.verify(stored_hash, password)
    except (InvalidHashError, VerificationError):
        return False
