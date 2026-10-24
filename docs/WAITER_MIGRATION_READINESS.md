# Waiter Phase 3 migration readiness

Status: **not applied**. The authoritative production migration workflow for this repository is the reviewed Supabase migration workflow; `prisma migrate deploy` is not an approved production executor.

## Pending migration

`supabase/migrations/20261024100000_waiter_responsibility_operations.sql`

The migration is additive: it adds nullable QR/responsibility fields to `orders`, nullable floor-plan fields to `cafe_tables`, and the immutable responsibility-history, table-transfer, and waiter-handover tables. It adds foreign keys, operational indexes, a pending-handover partial unique index, RLS, and direct-role revocations. It contains no `DROP`, `TRUNCATE`, deletion, or historical-data rewrite.

## Compatibility and release ordering

- Existing orders remain valid because `responsible_waiter_id` is nullable and `created_by` remains the immutable creator/audit actor.
- Legacy active orders will have no current responsible waiter until an authorized manager explicitly reassigns them. This must be an operational reconciliation step, not an implicit backfill.
- Release the migration before code that selects the new columns or tables. The code and migration must be deployed as one ordered release.
- Before approval, verify the Prisma runtime role retains table and sequence access after RLS/revocations; `anon`, `authenticated`, and `PUBLIC` must not gain direct access.

## Required post-apply verification

1. Confirm columns, foreign keys, indexes, check constraints, and RLS match `prisma/schema.prisma`.
2. Execute isolated PostgreSQL tests for concurrent QR claims, table transfers, handover accept/reject races, emergency serving, branch isolation, and shift closure.
3. Reconcile active legacy orders deliberately, then confirm a sender with outstanding responsible orders cannot close a shift until a recipient accepts the handover.

## Local connectivity status

The local client previously resolved the Supabase pooler hostname to IPv4 but could not establish TCP connections to ports 6543 or 5432. That is an outbound network/VPN/firewall issue before TLS or Prisma authentication, so it cannot be corrected in application code. No migration or fixture writes were attempted.
