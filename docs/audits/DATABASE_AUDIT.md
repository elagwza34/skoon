# Database and Prisma Audit

## Local state

- Prisma schema validates successfully.
- 23 Prisma migration directories and 13 Supabase SQL migration files were found.
- Monetary columns generally use `Decimal(10,2)`; inventory quantities use three-decimal logic in the engine.
- Orders, payments, inventory, ledger, HR, and audit relations have extensive indexes and explicit delete actions.

## Key findings

### DB-001 — P1 — Split migration authority

Prisma and Supabase trees overlap in HR, waiter operations, RLS, and supporting constraints. A source build cannot prove the deployed schema. Required read-only staging audit: migration history/checksums, schema diff, constraints, functions, triggers, RLS, grants, and extension versions.

### FIN-001 — P0 — Destructive cascade path

The invoice DELETE handler explicitly removes payments and then deletes an order. Cascades remove dependent operational history. This contradicts immutable financial/audit expectations. Use reversals and terminal states, not deletion.

### Constraint observations

- Positive/valid business values are often enforced in Zod and services, but many status/quantity fields are strings/integers without schema-level CHECK constraints (`prisma/schema.prisma:964-1030,1188-1228,1303-1329`). Direct SQL or a future code path can bypass application invariants.
- `WaiterOrderReconciliationReview` stores branch and order as independent foreign keys (`prisma/schema.prisma:1132-1159`); the schema does not guarantee that both belong together.
- Order numbers are not shown as a branch-scoped unique key in the Order model; public tracking relies on ID plus order number, while `orderRef` is globally unique.
- Financial idempotency has a useful composite unique constraint (`FinancialOperation`), and inventory reservations have a useful order-item/item uniqueness constraint.

## Transaction/concurrency assessment

Strong patterns include `FOR UPDATE` for payment/order/inventory rows, advisory locks for adjustments, and same-transaction audit/notification writes. Gaps remain where direct invoice edits bypass the inventory engine. PostgreSQL tests were not run because an isolated target was not proven.

## Required verification

1. Restore a recent production backup to isolated staging.
2. Compare both migration ledgers and actual schema.
3. Run financial, cashier, inventory, HR, service-request, and shift-concurrency suites.
4. Test FK/cascade behavior and invalid status/quantity writes.
5. Use EXPLAIN on top production queries before adding indexes.
