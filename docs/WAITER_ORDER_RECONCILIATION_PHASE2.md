# Waiter legacy-order reconciliation — Phase 2 (local implementation)

Date: 2026-10-24
Scope: legacy `orders` with `responsible_waiter_id IS NULL` in project `bkgxjutnfkslpgshufhb`.

## What is implemented locally

- An Owner/Manager-only dashboard review surface lists unassigned orders without customer fields or mutation controls.
- It groups cases as `operational`, `ambiguous`, or `historical`, and filters by classification, source, and payment state.
- The detail panel supports four **browser-only, non-persistent** proposals: assign waiter, keep unassigned, review later, and resolve through the approved operational workflow.
- A proposal requires a 3–500 character reason. An assignment proposal also requires a branch-local, active Waiter with an open shift from the server read model.
- Historical/paid/cancelled/completed orders are protected from proposal creation.
- No API route, server action, fetch request, database write, approval button, or order mutation exists in this phase. Refreshing the browser discards previews by design.

## Current data status

The last verified read-only snapshot was 35 unassigned orders: 6 operational, 9 ambiguous, and 20 historical/settled. No assignment was made.

The required fresh reclassification was **BLOCKED** during this implementation because the Supabase MCP approval endpoint reported a usage-limit error before the query executed. These counts are historical evidence only; re-run the read-only report before any deployment or review decision.

## Proposed persistent contract — not applied

`supabase/migrations/20261024110000_waiter_order_reconciliation_reviews.sql` is a local, additive migration only. It introduces:

| Record | Purpose |
| --- | --- |
| `waiter_order_reconciliation_reviews` | A snapshot-based review and approval record. Approval remains `not_executed`. |
| `waiter_order_reconciliation_audit` | Append-only event history for proposed, approved, rejected, invalidated, and separately executed actions. |

The review record preserves order, branch, reviewer, optional approver, proposed waiter, decision, reason, immutable pre-decision snapshot, timestamps, review status, and execution status. A partial unique index prevents two actionable reviews for one order. Database checks require a decision/reason outside the pending state and a waiter only for `assign_waiter`.

RLS is enabled; `PUBLIC`, `anon`, and `authenticated` have no direct table or sequence access. Future trusted server handlers must verify Owner/Manager role and Manager branch scope before each transaction.

## Required workflow once separately approved

1. Create `pending_review` using a transactional read of the order and its full current-state snapshot.
2. Move only through `pending_review → proposed → approved|rejected|needs_more_info` with audit insert in the same transaction.
3. On approval, compare `updated_at`, branch, state, payment state, source, and responsibility with the snapshot. Mark stale reviews `superseded`; never execute them.
4. Execution is a separate explicitly authorized transaction: lock the order, revalidate eligibility and destination waiter/shift, create `OrderResponsibilityHistory`, update only `responsible_waiter_id`, and append audit history atomically.
5. The execution path must reject a paid/cancelled/completed order, a cross-branch waiter, a closed-shift waiter, duplicate execution, and a responsibility changed after review.

No automatic copying of `created_by` is allowed. `created_by` remains historical authorship, not current operational responsibility.

## Offline verification

The new policy tests cover role eligibility, same-branch/open-shift waiter validation, required reasons, historical-order protection, stale snapshot invalidation, invalid repeated approval transitions, and the invariant that approval does not execute an order mutation. They are offline only.

### Local command results (2026-10-24)

| Command | Result |
| --- | --- |
| `npx prisma validate` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 101 passed, 0 failed/skipped |
| `npm run lint` | PASS |
| `git diff --check` | PASS (only pre-existing CRLF warnings) |
| `npm run build` | FAIL — `next/font` could not fetch Cairo from Google Fonts; reported `EACCES`, exit code 1. No build success is claimed. |

## Blockers before a production GO

1. Refresh the read-only legacy-order review when Supabase MCP access is available, then obtain documented Owner/Manager decisions for every active/ambiguous order.
2. Prove the deployed Prisma database role has required table/sequence privileges; MCP administrator privileges are not sufficient evidence.
3. Use a disposable isolated PostgreSQL environment for integration tests: concurrent review creation, stale-order invalidation, branch scope, approval races, assignment execution, and no payment/inventory changes.
4. Resolve the existing Waiter migration-history drift under separately approved metadata-only repair. Do not replay the already-present Waiter migration.
5. Obtain explicit approval before applying this new reconciliation migration or enabling persistent review/execution APIs.

## Status

**NO-GO for persistent reconciliation or release.** The UI is a safe planning/review aid only; persistence, approval, assignment execution, and PostgreSQL behavior are deliberately not enabled or verified.
