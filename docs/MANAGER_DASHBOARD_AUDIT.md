# Manager Dashboard audit — 2026-10-23

| Capability | Existing | Partial | Missing | Required action |
|---|---:|---:|---:|---|
| Branch-scoped dashboard/revenue | yes |  |  | Reused authoritative completed-payment metrics. |
| Operational command center |  | yes |  | Added real order, table, shift and delay overview; service requests/complaints have no persisted model. |
| Orders, cancellation, kitchen states | yes |  |  | Reuse existing state-machine and audit services. |
| Cash, payments, float and shifts | yes |  |  | Existing ledger/idempotency services remain authoritative. |
| Employee operational directory | yes |  |  | Manager read access is branch scoped and compensation is hidden. |
| Scheduling/attendance |  | yes |  | Local pending-migration APIs/UI exist; reporting and automatic review remain pending. |
| Pricing approval limits |  |  | yes | Requires Owner-configured limits and an approval migration; no direct Manager price bypass was introduced. |
| Leave, payroll and sensitive HR |  |  | yes | Leave foundation is local pending migration; payroll remains absent and confidential. |

## Authorization findings

- Page access is guarded by `requirePageAccess` and permission-derived `canSeeRoute`; sidebar visibility is not the security boundary.
- Existing write services enforce branch and, where applicable, open-shift checks. The new command center is read-only.
- Manager continues to be denied compensation, payroll, profile lifecycle, role, and permission administration.
- No database mutation, migration execution, or financial posting occurred for this audit.
