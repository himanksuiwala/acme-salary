-- Version 4. Dates use YYYY-MM-DD text; monetary amounts use integer minor units.
BEGIN IMMEDIATE;

CREATE TABLE currency (
    currency_id INTEGER PRIMARY KEY,
    currency_code TEXT NOT NULL UNIQUE,
    currency_name TEXT NOT NULL,
    symbol TEXT,
    decimal_places INTEGER NOT NULL
        CHECK (typeof(decimal_places) = 'integer' AND decimal_places BETWEEN 0 AND 3),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE country (
    country_id INTEGER PRIMARY KEY,
    country_code TEXT NOT NULL UNIQUE,
    country_name TEXT NOT NULL,
    default_currency_id INTEGER NOT NULL
        REFERENCES currency(currency_id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE location (
    location_id INTEGER PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES country(country_id) ON DELETE RESTRICT,
    location_name TEXT NOT NULL,
    city TEXT,
    state TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE department (
    department_id INTEGER PRIMARY KEY,
    department_code TEXT NOT NULL UNIQUE,
    department_name TEXT NOT NULL,
    manager_id INTEGER REFERENCES employee(employee_id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee (
    employee_id INTEGER PRIMARY KEY,
    employee_code TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    department_id INTEGER NOT NULL REFERENCES department(department_id) ON DELETE RESTRICT,
    location_id INTEGER NOT NULL REFERENCES location(location_id) ON DELETE RESTRICT,
    manager_id INTEGER REFERENCES employee(employee_id) ON DELETE RESTRICT,
    job_title TEXT,
    employment_type TEXT,
    joining_date TEXT NOT NULL,
    termination_date TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_compensation (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employee(employee_id) ON DELETE RESTRICT,
    base_pay INTEGER NOT NULL CHECK (typeof(base_pay) = 'integer' AND base_pay >= 0),
    variable_pay INTEGER
        CHECK (variable_pay IS NULL OR (typeof(variable_pay) = 'integer' AND variable_pay >= 0)),
    currency_id INTEGER NOT NULL REFERENCES currency(currency_id) ON DELETE RESTRICT,
    pay_frequency TEXT NOT NULL,
    effective_from TEXT NOT NULL
        CHECK (julianday(effective_from) IS NOT NULL
               AND effective_from = date(julianday(effective_from))),
    effective_to TEXT
        CHECK (effective_to IS NULL OR
               (julianday(effective_to) IS NOT NULL
                AND effective_to = date(julianday(effective_to))
                AND effective_to >= effective_from)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE allowance_type (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_allowance (
    id INTEGER PRIMARY KEY,
    compensation_id INTEGER NOT NULL
        REFERENCES employee_compensation(id) ON DELETE RESTRICT,
    allowance_type_id INTEGER NOT NULL REFERENCES allowance_type(id) ON DELETE RESTRICT,
    amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount >= 0),
    frequency TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (compensation_id, allowance_type_id)
);

CREATE TABLE app_user (
    user_id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role <> ''),
    employee_id INTEGER REFERENCES employee(employee_id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status <> ''),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (role <> 'SYSTEM' OR password_hash IS NULL)
);

CREATE TABLE audit_log (
    audit_id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES app_user(user_id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    old_values TEXT,
    new_values TEXT,
    ip_address TEXT,
    employee_id INTEGER REFERENCES employee(employee_id) ON DELETE RESTRICT,
    operation_id TEXT,
    outcome TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (outcome IN ('SUCCESS', 'FAILED')),
    actor_name TEXT,
    reason TEXT,
    metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER employee_compensation_no_overlap_insert
BEFORE INSERT ON employee_compensation
WHEN EXISTS (
    SELECT 1 FROM employee_compensation AS existing
    WHERE existing.employee_id = NEW.employee_id
      AND existing.effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
      AND NEW.effective_from <= COALESCE(existing.effective_to, '9999-12-31')
)
BEGIN
    SELECT RAISE(ABORT, 'overlapping compensation period');
END;

CREATE TRIGGER employee_compensation_no_overlap_update
BEFORE UPDATE OF employee_id, effective_from, effective_to ON employee_compensation
WHEN EXISTS (
    SELECT 1 FROM employee_compensation AS existing
    WHERE existing.employee_id = NEW.employee_id
      AND existing.id <> OLD.id
      AND existing.effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
      AND NEW.effective_from <= COALESCE(existing.effective_to, '9999-12-31')
)
BEGIN
    SELECT RAISE(ABORT, 'overlapping compensation period');
END;

CREATE INDEX country_currency_idx ON country(default_currency_id);
CREATE INDEX location_country_idx ON location(country_id);
CREATE INDEX department_manager_idx ON department(manager_id);
CREATE INDEX employee_department_idx ON employee(department_id);
CREATE INDEX employee_location_idx ON employee(location_id);
CREATE INDEX employee_manager_idx ON employee(manager_id);
CREATE INDEX compensation_employee_idx ON employee_compensation(employee_id);
CREATE INDEX compensation_currency_idx ON employee_compensation(currency_id);
CREATE INDEX allowance_compensation_idx ON employee_allowance(compensation_id);
CREATE INDEX allowance_type_idx ON employee_allowance(allowance_type_id);
CREATE INDEX app_user_employee_idx ON app_user(employee_id);
CREATE INDEX audit_user_idx ON audit_log(user_id);

PRAGMA user_version = 4;
COMMIT;
