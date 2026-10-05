# Data model: Compensation analytics

## Existing source entities

- **Employee**: employee_id, joining_date, termination_date, current status, current department/location/country/job_title. Defines as-of cohort and current-attribute groups.
- **Employee compensation**: inclusive effective_from/to, base_pay and nullable variable_pay as integer minor units, currency_id, pay_frequency. One effective package per date because overlap triggers exist.
- **Employee allowance**: package-linked amount in the package currency, with ANNUAL/MONTHLY/HOURLY frequency.
- **Currency**: code, symbol and decimal_places.
- **Audit log**: existing operation and export lifecycle.

## New stored entity: FX rate

- id; source_currency_id and target_currency_id referencing currency, distinct.
- rate_date as ISO date; positive decimal rate stored as text; nonblank source; approved 0/1.
- Unique source/target/date. Analytics uses only the fixed, sourced USD reference set dated 2026-09-25, even for an earlier compensation as-of date. INR and SGD direct USD rates are the decimal reciprocals of the Federal Reserve's currency-per-USD observations. No chained conversion is used.
- created_at/updated_at follow existing triggers. Migration from schema v1–v4 adds this table without editing existing salaries or audit rows.

## Derived response

- **Context**: as_of UTC date, generated_at UTC, filters, reporting currency metadata.
- **Coverage**: employee_count, included base count, exclusions by no package/hourly/missing FX, missing FX currencies and rates used.
- **Metrics**: annual base sum/average/median; variable pool; allowance sum; indicative target sum, each nullable and with own coverage/Partial status.
- **Distribution**: bounded bins with lower/upper target minor units and employee count; exact table uses same array.
- **Breakdowns**: country, department, role rows with group code/label, cohort count, included count, annual base sum/average/median and exclusions.
- **Changes**: bounded recent package starts in selected period with prior package, before/after base and percentage only when currency and frequency match.
