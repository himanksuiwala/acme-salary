"""Initialize the configured SQLite database without starting the API."""

from backend.database import initialize_database


if __name__ == "__main__":
    print(f"Initialized {initialize_database()}")
