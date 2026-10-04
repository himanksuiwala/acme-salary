# Research decisions

- Repository inspection found duplicated service audit INSERTs and a latest-20 summary on employee detail; no audit read/report APIs. Consolidate them without changing employee business contracts.
- Use a decorator to establish operation context and capture service failures; explicit transactional success writes retain atomicity. HTTP middleware covers request validation before a service executes. Never persist request payloads on failures.
- Export completion belongs to response lifecycle after send; server delivery is the strongest claim available. Capture snapshot employee IDs for both stages; don't re-query membership after download.
- Schema migration adds employee association, outcome, operation ID, reason, metadata and actor snapshot. Legacy event payloads remain intact; read projection computes available differences without fabricating history.
- No cryptographic ledger, integrity verification or approval policy exists. Replace mock claims with real filtered counts; omit unsupported verification control.
- Coss inspection confirmed existing Base UI Table/Select/Sheet/Pagination/Empty patterns. Official primary docs: https://coss.com/ui/docs/components/table, https://coss.com/ui/docs/components/select, https://coss.com/ui/docs/components/sheet, https://coss.com/ui/docs/components/pagination, https://coss.com/ui/docs/components/empty . No dependencies needed.
- Existing fetch/error/download and URLSearchParams/history architecture is sufficient; no query library/router required.
- User explicitly chose no authentication for now. Fixed local Admin attribution and SYSTEM writer support are not proof of an authenticated person. Future scopes cannot be enforced honestly until auth is added.

- Shared audit UI lives in components/product as design.md prescribes; feature service contracts and display helpers remain in features/audit. No business rules are embedded in Coss registry primitives.
