# ACME Salary Management — One-Page Requirements

## Goal

Build a secure salary-management workspace for HR teams to find employees, maintain effective-dated compensation packages, inspect salary history, export auditable records, and understand compensation trends without relying on manual spreadsheets. The product should make every salary figure explainable by showing the employee, effective date, currency, pay frequency, package state, and audit context. The system manages compensation commitments, not actual payroll payments.

## Scope

The first release covers organization-wide access for authenticated `ADMIN` and `HR` users. Both roles can sign in, browse the employee directory, create and edit employee records, inspect compensation profiles, record new compensation packages, view analytics, export CSV snapshots, manage allowance types, review read-only reference data, and inspect audit history.

The application includes a FastAPI backend, SQLite persistence, authenticated APIs, and a React/Vite frontend. Routes should be simple and product-oriented, such as `/employees`, `/employees/detail/:employeeId`, `/analytics`, `/audit`, and `/administration/:section`. Protected screens must redirect unauthenticated users to sign in and preserve their intended destination after a successful login.

## Features

- **Authentication and access:** Email/password sign-in, short-lived JWT sessions, active-user checks, authenticated API access, session expiry handling, and visible user identity/logout in the workspace shell.
- **Employee directory:** Server-side search, filters, pagination, responsive table/cards, active filter chips, CSV export, loading/error/empty states, and employee profile navigation.
- **Employee profile:** Identity and employment details, as-of compensation view, current/scheduled/history package sections, allowances, package reasons, recent activity, employee compensation export, and manager profile navigation where data exists.
- **Employee maintenance:** Create and edit employee identity, employment, department, location, status, and date fields with validation and audit events.
- **Compensation package workflow:** Full-page package form with prefilled current values, allowance editor, effective-date validation, annualized preview, prior-package cutoff, review/save flow, dirty-form warning, conflict handling, and audit attribution.
- **Analytics:** USD annualized salary metrics, distribution chart with table, country/department/role breakdowns, compensation changes, cohort filters, methodology and FX notes, partial-coverage explanations, employee drill-downs, and CSV export.
- **Administration:** Direct sidebar access to organization data, allowance setup, and currencies/FX. Allowance types can be created, edited, archived, and reactivated with reasons; organization, currency, and FX records are read-only.
- **Audit trail:** Filterable global and employee-scoped audit views with actor, action, target, timestamp, readable details, export events, and CSV export.

## Deliberately Out Of Scope

The release intentionally prioritizes breadth of core HR salary-management functionality over deep enterprise workflows. Given the limited build duration, the focus is to demonstrate a complete working product surface across employees, compensation, analytics, administration, exports, audit, and authentication, while avoiding unnecessary complexity in areas that require dedicated policy, compliance, or operational design.

- **Payroll execution, payslips, tax, deductions, and bank transfers:** The system records contractual compensation commitments only. Payroll would require deeper compliance, payment, and statutory calculation rules, so it was excluded to keep the product focused.
- **Employee self-service and read-only/scoped roles:** The first release supports only `ADMIN` and `HR` with organization-wide access. More granular roles or country/department scopes would add authorization complexity and need a dedicated access-control model.
- **Limited reference data coverage:** The product currently supports the countries, departments, locations, currencies, and allowance types available in the seeded/reference dataset. Full master-data lifecycle management was left out so the release could cover more product functionality end to end.
- **Import workspace:** Bulk upload, mapping, row-level validation, atomic commit, idempotency, and import history are deferred because they are large enough to become their own feature area. Building them deeply would reduce time available for the rest of the system.
- **Unified export workspace and background jobs:** The release supports direct audited CSV exports. XLSX, selectable field sets, async large exports, expiring download links, and completed-download tracking are deferred to avoid overbuilding before real export-volume needs are known.
- **User and role administration UI:** Bootstrap and migrated users are supported, but account lifecycle management, last-admin protection, and role assignment screens are deferred because partial security administration can create more risk than value.
- **Reference and FX mutation governance:** Countries, departments, locations, currencies, and FX rates are visible but mostly read-only. FX rates change frequently, so supporting ongoing FX management would add approval, publishing, audit, and historical-impact complexity; the release uses a simpler fixed reference-rate approach.
- **Historical organization reconstruction:** Analytics groups by currently stored department, role, and location. Reconstructing past organization structure requires historical assignment records, which were left out to keep the data model and analytics understandable within the limited timeframe.
- **Approval workflow for salary changes:** Package reasons and authorization references can be recorded, but the product does not verify approvals or attach documents. A formal approval workflow needs separate design for states, approvers, notifications, and exceptions.

## Success Criteria

HR users can find an employee, understand their current and historical compensation, add or schedule a compensation change without losing history, export an audited snapshot, and explain core compensation analytics. Unauthenticated users cannot access protected app routes or APIs. Salary figures are never ambiguous about date, currency, frequency, or coverage.
