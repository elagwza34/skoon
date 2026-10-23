# ERP database migration protocol

## Current verified state

`prisma/schema.prisma` validates. Local migration folders exist through
`20261023120000_inventory_reservations_batches_accountability`; the latter has
not been deployed by this work. The deployment state of the configured database
is unknown because `prisma migrate status` did not complete successfully.

## Required safe rehearsal

1. Use a disposable PostgreSQL database, never production.
2. Set direct and pooled URLs only in the shell/session; do not print them.
3. Run `prisma migrate status`, then `prisma migrate deploy`.
4. Verify constraints/indexes with read-only queries.
5. Run isolated fixture tests and verify targeted cleanup.
6. Back up production and repeat status checks before a separately approved
   production deployment.

## Rollback policy

ERP migrations are additive. Roll back application code first. Do not drop
tables containing accounting, inventory, payroll, or audit records; issue a
forward corrective migration after review.
# Production migration authority

As of 2026-10-23, production schema changes are executed through reviewed
Supabase migrations. Prisma remains the runtime ORM and schema contract, but
`prisma:migrate:deploy` is deliberately blocked to prevent duplicate execution.

The inventory migration `20261023120000_inventory_reservations_batches_accountability`
was applied through Supabase MCP to production and is intentionally absent from
`public._prisma_migrations`. Do not mark it applied in Prisma or replay it.

