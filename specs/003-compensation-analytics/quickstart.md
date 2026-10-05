# Quickstart: Compensation analytics

1. Initialize and seed the local database using README instructions. Run API and Vite.
2. Open Analytics. Confirm the page uses actual cohort counts and says annualized commitments, not cash paid. Change as-of date and filters; refresh and confirm URL/context persist.
3. Select one country with a single currency. Compare annualized sum/mean/median with stored packages. Inspect distribution chart and exact-value table; drill into Employees.
4. Select a mixed-country cohort. All values stay in USD without a reporting-currency control. Confirm the rate-set date and source in Methodology and export metadata. Do not expect the mock's USD values.
5. Remove one reference rate in a disposable database and confirm Partial explains the missing currency. An unrelated approved rate on another date must not silently replace the fixed set.
6. Select a change period; compare comparable and incomparable starts. Export snapshot and inspect CSV metadata and audit log.
7. Test narrow viewport, keyboard controls, loading/error/empty states. Run backend unittest, frontend build and lint.
