# Manager Dashboard implementation report — 2026-10-23

## Implemented

- `src/lib/manager-operations.ts`: branch-scoped, read-only current-operation aggregation using persisted orders, tables, open shifts and completed payments.
- `src/components/dashboard/manager-operations-center.tsx`: Arabic RTL urgent action center, department overview and quick links.
- `/dashboard` renders the operations center only for Owner/Manager. It contains no fabricated service-request, complaint, payment-issue, or cash-variance values because those alerts do not have a single persisted source in the current schema.
- Added `ServiceRequest` persistence and `20261023162000_manager_service_requests.sql`. It supports QR waiter calls, bill, water, utensils, assistance and complaints; state transitions; atomic waiter claim; Manager prioritization/reassignment; audit rows; and bell notifications.

## Safety

The dashboard does not alter orders, payments, shifts, inventory, or financial movements. Revenue is derived from completed payments through the existing finance metric service. All queries honor the trusted session's branch scope.

## Service requests hardening

- QR requests resolve only the trusted table token. A transaction-scoped advisory lock serializes duplicate and complaint-rate decisions for each table.
- A per-table transaction advisory lock serializes the read/check/create decision. The migration intentionally has no partial unique index: such an index would permanently block a later legitimate request when an older request remains open. The application therefore applies the 60-second per-type cooldown and the three-complaints-per-ten-minutes limit inside that serialized transaction. Atomic waiter claiming remains an `UPDATE ... WHERE status = 'pending'` operation.
- Waiter and Manager boards use the same branch-scoped read endpoint. The Manager dashboard shows persisted pending, complaint, escalated, and overdue counts only after the table exists; before that it explicitly reports that activation is pending, rather than inventing zeros.
- The dedicated PostgreSQL suite uses unique branches, tables, users, shifts, requests, notifications and audit rows, then removes only those fixture records in `finally`.

## Service-request migration deployment

- Applied through Supabase MCP only to the approved development project `bkgxjutnfkslpgshufhb` (`skoon`) as `20261023162000_manager_service_requests`.
- Read-only verification confirmed the table, primary key, six foreign keys, the type/status checks, both declared indexes, RLS, and denial of `anon`/`authenticated` table privileges. `postgres` owns the table and retains server runtime access.
- The partial unique index was deliberately removed before deployment because it would permanently block a later legitimate request while an old request remained open. Duplicate cooldown and complaint throttling are serialized by a per-table transaction advisory lock in the trusted server writer.
- A dedicated PostgreSQL service-request fixture suite still needs to be written before concurrent QR creation, waiter claim/reassignment races, RLS, and end-to-end Customer → Waiter → Manager behavior can be marked verified.

## Verification

- Prisma validation: passed.
- TypeScript typecheck: passed.
- Offline tests: passed (95/95).
- PostgreSQL service-request integration test: passed (1/1; 0 failed; 0 skipped) against the explicitly authorized development project using isolated fixtures and cleanup.

## PostgreSQL service-request verification â€” 2026-10-23

- Initial execution exposed a real authorization defect: an assigned waiter was denied the `in_progress` transition. `actOnServiceRequest` now permits the assigned waiter, while continuing to reject an unassigned waiter; Manager/Owner retain their supervisory path.
- The earlier missing summary was an execution-capture issue, not a database lock: read-only `pg_stat_activity` showed only idle, committed sessions; the active Node processes were unrelated Hostinger MCP servers. The suite now has a 60-second per-test bound, an explicit `prisma.$disconnect()` in a nested `finally`, and a spec reporter.
- Definitive final run: `npm run test:service-requests` exited `0`; 1 test passed, 0 failed, 0 skipped, in 34.90 seconds.
- Post-run read-only cleanup verification found zero fixture-pattern rows in `branches`, `cafe_tables`, `users`, `shifts`, `service_requests`, `audit_logs`, and `notifications`.
- The fixture test covers QR cooldown, concurrent duplicate rejection, complaint limiting, independent tables, concurrent waiter claiming, reassignment, assigned/unassigned waiter transitions, missing-open-shift denial, Owner shift exemption, resolution, and branch-scoped reads.

## Remaining work

Implement persisted service-request/complaint/escalation records only after a reviewed additive migration; add configured discount/refund and price-approval limits; complete pending scheduling/leave migrations and their PostgreSQL tests. No deployment claim is made for those items.
