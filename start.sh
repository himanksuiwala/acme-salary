#!/bin/sh
set -e

# Run startup checks, seeding, and user bootstrapping
python -c "
import os, sqlite3
from backend.database import database_path, initialize_database
from backend.passwords import hash_password

db_path = database_path()
initialize_database(db_path)
conn = sqlite3.connect(db_path)

auto_seed = os.getenv('AUTO_SEED', '').lower() in ('true', '1')

# 1. Seed business data (10K employees by default) if AUTO_SEED is enabled and DB is empty
if auto_seed:
    try:
        count = conn.execute('SELECT COUNT(*) FROM employee').fetchone()[0]
    except Exception:
        count = 0

    if count == 0:
        emp_count = int(os.getenv('SEED_EMPLOYEES', '10000'))
        print(f'AUTO_SEED enabled: generating and inserting {emp_count} employees...')
        from backend.seed_data import generate_dataset, seed_sqlite, DEFAULT_SEED, DEFAULT_AS_OF
        dataset = generate_dataset(DEFAULT_SEED, DEFAULT_AS_OF, emp_count)
        seed_sqlite(dataset, db_path)
        initialize_database(db_path)
        print(f'Successfully seeded {emp_count} employees!')
    else:
        print(f'Database already contains {count} employees. Skipping employee seed.')

# 2. Bootstrap HR user if configured or if AUTO_SEED demo mode is enabled
hr_email = os.getenv('AUTH_BOOTSTRAP_HR_EMAIL', 'hr@example.com' if auto_seed else '').strip()
hr_pass = os.getenv('AUTH_BOOTSTRAP_HR_PASSWORD', 'HrPassword123!' if auto_seed else '')

if hr_email and hr_pass:
    existing = conn.execute('SELECT user_id, role FROM app_user WHERE lower(email)=?', (hr_email.casefold(),)).fetchone()
    if not existing:
        conn.execute('''INSERT INTO app_user (username, email, password_hash, first_name, last_name, role, status)
            VALUES (?, ?, ?, 'Jordan', 'Taylor', 'HR', 'ACTIVE')''',
            (hr_email, hr_email, hash_password(hr_pass)))
        conn.commit()
        print(f'Bootstrap HR user created: {hr_email}')
    else:
        # Ensure password and status are active
        conn.execute('''UPDATE app_user SET password_hash=?, role='HR', status='ACTIVE' WHERE user_id=?''',
            (hash_password(hr_pass), existing[0]))
        conn.commit()
        print(f'Bootstrap HR user updated: {hr_email}')

conn.close()
" || echo "Startup check / seed step finished."

# Determine port from Railway PORT env var or default to 8000
PORT="${PORT:-8000}"
echo "Starting Uvicorn server on port ${PORT}..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT}"
