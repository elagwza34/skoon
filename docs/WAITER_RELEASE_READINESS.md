# Waiter release readiness — 2026-10-24

## Verified facts

### Database connectivity

- `DATABASE_URL` is a PostgreSQL URL for Supabase Shared Pooler transaction mode: `aws-0-eu-west-1.pooler.supabase.com:6543`.
- `DIRECT_URL` is a PostgreSQL URL for Supabase Shared Pooler session mode on port `5432`; it includes an SSL mode parameter.
- DNS resolves the pooler host to IPv4 addresses. Local TCP connection attempts to both configured pooler ports fail before TLS, database authentication, or Prisma can run.
- The failure category is **local outbound PostgreSQL connectivity** (network, firewall, VPN, proxy, or ISP policy). It is not evidence of an invalid password, RLS problem, or a Prisma schema failure.
- Supabase MCP reports project `bkgxjutnfkslpgshufhb` (`skoon`, `eu-west-1`) as `ACTIVE_HEALTHY`.

Recommended correction: allow outbound TCP to the Supabase Shared Pooler host on `6543` and `5432`, or test from a network/VPN that permits it. Keep transaction-pooler `DATABASE_URL` configured with Prisma's pooler-safe parameters (including `pgbouncer=true` where required), and use the documented direct connection for migrations only when IPv6/IPv4 availability supports it. Do not change credentials until TCP succeeds.

### Migration readiness

Pending migration: `supabase/migrations/20261024100000_waiter_responsibility_operations.sql`.

- The reviewed SQL is additive: nullable order responsibility/QR fields, nullable floor-plan fields, three new operational tables, foreign keys, indexes, checks, RLS, and revocation of direct public/anon/authenticated access.
- It contains no `DROP`, `TRUNCATE`, record deletion, or historical rewrite.
- Prisma models align with the proposed table and column names. The partial unique index permits at most one pending handover per sender shift, which matches the application advisory lock.
- Supabase read-only migration history does **not** contain this migration. Read-only schema checks confirm `waiter_shift_handovers`, `order_table_transfers`, and `order_responsibility_history` do not exist.
- Existing orders remain compatible because the new responsibility field is nullable; active legacy orders must be deliberately reconciled by an authorized manager after release, not silently assigned.

Prerequisites before approval: confirm the production/runtime Prisma role can access the new tables and sequences after the revokes and RLS are enabled; test the migration on an authorized non-production target if available; then apply only this reviewed Supabase migration before releasing code that selects its fields.

### Build outcome

`next build` completed compilation, type checking, static-page generation, page optimization, build traces, and printed the complete route manifest. Warnings were limited to missing Next ESLint plugin configuration and `metadataBase` fallback.

The local command host repeatedly stopped observation before emitting an exit marker, so no `exit code 0` was captured. Treat the build as **output-complete but not exit-code verified** until it runs in CI/a terminal that preserves the parent process to completion.

## Safe deployment sequence

1. Restore outbound PostgreSQL connectivity and validate a read-only Prisma query.
2. Confirm the exact Supabase project reference and migration history.
3. Back up/verify recovery policy according to the deployment environment.
4. Apply only `20261024100000_waiter_responsibility_operations.sql` using the approved Supabase migration workflow — never `prisma db push` or `prisma migrate deploy`.
5. Verify columns, tables, foreign keys, indexes, RLS, and runtime-role access.
6. Run isolated PostgreSQL tests for QR claims, transfers, emergency serving, handover, branch scope, and duplicate inventory consumption.
7. Release the application code after the migration, reconcile legacy active responsibilities deliberately, and run the manual acceptance checklist below.

## Manual acceptance checklist

- [ ] QR: valid table token creates one pending order; first waiter claim wins; only the responsible waiter may approve/reject; kitchen sees the order only after approval.
- [ ] Responsibility: “My Orders” follows current responsibility, while original creator remains visible in audit history.
- [ ] Table transfer: responsible waiter can move an unpaid active order to an empty same-branch table with a reason; paid, terminal, cross-branch, and occupied-destination transfers fail; invoice/payment history is unchanged.
- [ ] Emergency serving: a second waiter can serve only a kitchen-ready quantity after the responsible waiter is unavailable and a reason is confirmed; no unready or duplicate serving succeeds; audit identifies actor/time/reason.
- [ ] Shift handover: sender with responsibilities cannot close; recipient with an open shift can accept and atomically receives all active responsibilities; rejection creates no assignment change.
- [ ] Floor plan: all users see the same live occupancy as grid view; only Owner can save bounded positions; unauthorized requests receive 403.
- [ ] Kitchen: approved orders only; partial readiness and cancellation behavior remain unchanged.
- [ ] Cashier: table transfer does not change invoice totals, payment records, shift balances, or receipt history.
- [ ] Financial and inventory: serving produces exactly one existing authoritative consumption path; no duplicate ledger, reservation, or waste movement occurs on retry.

## Remaining blockers

1. Local network cannot reach either configured Supabase pooler port.
2. Waiter migration is intentionally unapplied.
3. PostgreSQL integration scenarios are therefore unexecuted.
4. Next build has no captured terminal exit code despite complete build output.
