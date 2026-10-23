# Skoon ERP transformation tracker

Last audited: 2026-10-23. This tracker records verified source state, not
claims about the deployed Supabase database.

| Domain | Status | Existing source / decision | Next executable work |
|---|---|---|---|
| Identity and RBAC | Implemented, unverified live | `src/lib/session.ts`, `src/lib/authz.ts`, `src/lib/require-page-access.ts` | Database-backed role/API denial tests; add least-privilege ERP roles only with seeded permissions. |
| POS, invoices, payments | Implemented, partial | `staff-pos-write.ts`, `staff-invoices.ts`, `staff-payments-write.ts` | Options/addons/discounts and DB acceptance tests. Customer checkout remains full-payment only. |
| Waiter and kitchen | Implemented, partial | `staff-waiter.ts`, `staff-orders.ts`, waiter/kitchen boards | Item-level preparation/ready/serve, QR review and real-time subscriptions. |
| Shifts and fixed float | Implemented, unverified live | `staff-shifts.ts`, `staff-float.ts` | Isolated PostgreSQL acceptance and migration status repair. |
| Inventory engine | IMPLEMENTED, NOT TESTED | `staff-inventory-engine.ts`, migration `20261023120000_*`; per-item serving API and waiter controls added | Apply only to isolated DB; execute `test:inventory`, then batches/receipts UI, counts and expiry. |
| Procurement / suppliers | Missing | No Supplier/Purchase models or routes found | Model, double-entry integration, receipt workflow. |
| Accounting ledger | Missing as ERP GL | FinancialMovement is cash custody, not double-entry GL | Chart of accounts, journal, posting adapter, statements. |
| HR / payroll | Missing | User salary exists; accountability schema is pending migration | Attendance, leave, advances, payroll and legal approval workflow. |
| Reports | Implemented, partial | `staff-reports.ts`, invoice CSV export | ERP P&L, balance sheet, COGS, inventory/HR/AP reports. |
| Real-time | Partial | refresh/polling and notifications only | Authenticated branch-scoped realtime design and E2E reconnect tests. |
| CI and lint | IMPLEMENTED, TESTED locally | `eslint.config.mjs`, `.github/workflows/quality.yml`; `npm run lint` exits zero | CI has not run remotely. |
| Database migration state | BLOCKED | Runtime uses pooled `DATABASE_URL`; migrations use `DIRECT_URL`. `.env.staging` is absent from the current workspace/session, so guarded commands refuse to connect. | Save the separate project configuration as `D:\سكون\.env.staging`; run `staging:check`, then `staging:status`. |

## Current safety constraints

- `tmp-inspect.cjs` is user-owned and remains untouched.
- No migration has been applied by this work.
- No PostgreSQL write test has been run.
- The new inventory migration is additive and documented in
  `docs/INVENTORY-CUTOVER.md`.

## Next executable task

Provision or identify an isolated PostgreSQL database with a direct URL,
verify its migration state read-only, run `prisma migrate deploy` there, and
execute inventory concurrency tests using unique fixtures with targeted cleanup.
