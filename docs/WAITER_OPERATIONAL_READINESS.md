# Waiter operational readiness — Phase 1

Date: 2026-10-24
Scope: read-only production readiness work only
Target: `bkgxjutnfkslpgshufhb` (`skoon`, eu-west-1, PostgreSQL 17.11)

## Decision

**NO-GO.** No deployment, migration replay, migration-history repair, data reconciliation, or PostgreSQL mutation test was performed.

## 1. Historical-order review

### Read-only mechanism implemented locally

The existing Owner/Manager `/dashboard` now includes a **read-only Waiter responsibility review panel**.

- Server query: `src/lib/staff-waiter-readiness.ts`.
- UI: `src/components/dashboard/waiter-operational-readiness-panel.tsx`.
- Policy: `src/lib/waiter-readiness-policy.ts`.
- The query is limited to Owner globally or Manager’s own branch, returns no customer name, phone, notes, user IDs, payment values, or inventory data, and has no mutation endpoint or action controls.
- It evaluates persisted order status, payment status, source, linked-shift status, table label, and whether an original creator is recorded. It returns a human proposal, never a waiter assignment.

The dashboard mechanism is local code only and has not been deployed. It adds no database writes.

### Current read-only database result

| Category | Count | Proposal |
| --- | ---: | --- |
| Operationally active | 6 | Owner/Manager must select a current responsible waiter or close/cancel through the established workflow. |
| Ambiguous | 9 | Owner/Manager must inspect each order and decide whether to assign, approve, reject, continue, or cancel. |
| Historical or settled | 20 | Keep historical; never auto-assign. |
| Total without `responsible_waiter_id` | 35 | No automatic reconciliation is authorized. |

The 15 nonterminal orders are shown individually in the local read-only panel with proposals. The classification is not an instruction to mutate records and does not overwrite `created_by`.

## 2. Runtime-role verification

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Remote project identity | PASS | Supabase MCP returned `bkgxjutnfkslpgshufhb`, `skoon`, `ACTIVE_HEALTHY`, PostgreSQL 17.11. |
| Waiter schema objects | PASS | The three operational tables exist. |
| Waiter migration-history record | FAIL | Current remote history still lacks `20261024100000`. |
| Local `DATABASE_URL` metadata | PASS (configuration only) | PostgreSQL transaction pooler on port 6543; username is in the `postgres` family; no SSL query parameter is present. No secret was printed. |
| Local `DIRECT_URL` metadata | PASS (configuration only) | PostgreSQL session pooler on port 5432; username is in the `postgres` family; SSL query parameter is present. No secret was printed. |
| Deployed runtime configuration | UNVERIFIED | No committed deployment configuration was found in the repository. Local `.env` is not evidence of deployed values. |
| `current_user` / `session_user` through Prisma | BLOCKED | Local outbound PostgreSQL connectivity has previously failed before authentication; an administrator MCP query is not equivalent to the deployed Prisma connection. |
| Catalog privileges | PASS for `postgres` and `service_role` only | Both have table and sequence access and `BYPASSRLS`; `anon` and `authenticated` have no direct grants. This does not identify Prisma’s runtime role. |

### Minimum safe runtime verification

From the actual deployment environment, with a read-only connection and without logging its URL, run one parameter-free query that returns only:

```sql
select current_user, session_user,
  has_table_privilege(current_user, 'public.order_responsibility_history', 'SELECT,INSERT,UPDATE') as responsibility_access,
  has_table_privilege(current_user, 'public.order_table_transfers', 'SELECT,INSERT,UPDATE') as transfer_access,
  has_table_privilege(current_user, 'public.waiter_shift_handovers', 'SELECT,INSERT,UPDATE') as handover_access,
  has_sequence_privilege(current_user, 'public.waiter_shift_handovers_id_seq', 'USAGE') as handover_sequence_access;
```

Then run `SELECT 1 FROM` each operational table with `LIMIT 0`. Any missing privilege is a release blocker; do not solve it with a broad grant or by disabling RLS.

## 3. PostgreSQL integration-test readiness

**BLOCKED — no isolated target exists.** Supabase reports zero development branches. The existing `with-authorized-test-env.cjs` guard permits only the same project reference, so it is not suitable for this production-read-only phase. No integration suite was executed.

Existing PostgreSQL suites cover financial, cashier, HR, inventory, and service requests. There is no dedicated Waiter operations PostgreSQL suite yet. Before release, create an isolated project or approved disposable branch and prepare a `tests/waiter-postgres.test.ts` suite that creates uniquely prefixed fixtures and deletes only those fixtures in `finally` cleanup.

| Required scenario | Required assertion |
| --- | --- |
| Concurrent QR claims | Exactly one claim commits; one responsibility-history row; losing transaction returns conflict. |
| QR approval/rejection | Only responsible, authorized waiter may decide; kitchen sees approved orders only. |
| Current responsibility / manager reassignment | Original creator stays unchanged; responsibility history is append-only and branch-scoped. |
| Handover accept/reject | Recipient acceptance atomically moves eligible responsibilities; rejection changes none. |
| Shift close gate | Open shift cannot close while active responsibility remains; closes when none remains. |
| Table transfer | Same-branch, unpaid active order moves once; occupied destination and concurrent competing transfer fail. |
| Emergency serving | Only READY quantity, mandatory reason, actor/timestamp audit, and no second inventory deduction. |
| Branch and role scope | Cross-branch, unassigned waiter, and closed-shift actions are denied; Owner exemption is verified. |
| Cashier/kitchen regression | No invoice total, payment, cash ledger, reservation, consumption, or waste duplication. |

## 4. Static verification

| Command | Exit code | Result |
| --- | ---: | --- |
| `npx.cmd prisma validate` | 0 | PASS — Prisma schema valid. Prisma issued its existing Prisma 7 configuration deprecation warning. |
| `npm.cmd run typecheck` | 0 | PASS |
| `npm.cmd run lint` | 0 | PASS |
| `npm.cmd test` | 0 | PASS — 99 passed, 0 failed, 0 skipped. Includes the new pure legacy-review classification test. |
| `npm.cmd run build` | 0 | PASS — route generation and build completed. |
| `git diff --check` | 0 | PASS — only existing CRLF conversion warnings. |

Build warnings: the Next ESLint plugin was not detected in the ESLint configuration, and `metadataBase` is unset (fallback `http://localhost:3000`). Neither warning blocked the build; both should be addressed separately before a public deployment.

## 5. Outstanding blockers and approvals needed

| Blocker | Owner action required |
| --- | --- |
| Remote schema/history drift | Explicit approval for a reviewed metadata-only reconciliation after recovery verification; never replay the SQL migration. |
| 15 nonterminal unassigned orders | Owner/Manager must make and audit an individual decision per order. No bulk backfill is approved. |
| Prisma runtime role | Provide a safe deployment-environment read-only verification path or execute the listed read-only query there. |
| PostgreSQL behavioral tests | Approve/use a disposable isolated database or Supabase branch; do not reuse this production-read-only target. |
| Local read-only panel | Approve application release only after the above blockers and test evidence are complete. |

## Recommended next actions

1. Keep the production database unchanged.
2. Obtain the actual deployment-runtime privilege evidence.
3. Create or nominate an isolated testing target, then run the waiter concurrency and regression suite with deterministic cleanup.
4. Review the 15 nonterminal order proposals in the Owner/Manager dashboard and execute decisions only through separately approved, audited operational actions.
5. Reconcile the remote migration history only after schema equivalence, ordering, recovery, and explicit Owner approval are reconfirmed.
6. Re-run this readiness report after evidence is available. Only then can the release decision move to GO.
