# Cash handover post-fix verification — 2026-11-04

Overall status: **BLOCKED**. Code and offline checks support the fix; real PostgreSQL concurrency and browser acceptance remain unverified. This does not close the P0 release gate.

## Scope and compatibility

Inspected the actual working-tree diff against `main@cfe1b23`, the untracked fix report `P0_CASH_HANDOVER_FIX.md`, services, API, components, models and both regression suites. Historical full-project audit documents remain unchanged.

Before this verification there was **no frontend caller** of the cash handover accept/dispute/resolve API. Existing `ShiftsBoard` and `CashierDashboard` only submitted sender declarations to `/api/staff/shifts/[id]/close`; they did not supply recipient confirmation. The new pending-handover opening guard therefore had no UI recovery path.

Added one shared panel to both screens. Recipient input starts empty, never defaults to the sender declaration, and a separate unchecked confirmation is required. Changing count or reason clears confirmation. Blank, invalid, negative, excessive and sub-cent counts fail client validation. An explicit zero is valid. Every mutation sends `confirmed:true`, branch, handover ID and an explicit `countedAmount`, or `resolvedAmount` for resolution, using the real originating shift in the URL. The request builder is tested against the strict server schema. HTTP failures never display success, a local in-flight guard prevents duplicate clicks, and financial requests are never automatically retried.

All application callers:

| Caller | Contract |
|---|---|
| `cash-handover-panel.tsx` | Sole browser caller of queue GET and accept/dispute/resolve POST; mounted in shifts and cashier dashboards |
| `shifts/[id]/handover/route.ts` | Sole backend caller of the three transition services; authenticates, strictly parses and forwards confirmation, amount, branch and source shift |
| `ShiftsBoard`, `CashierDashboard` | Existing sender-close callers retained; shared panel supplies recipient/resolver actions |
| Offline/PostgreSQL suites | Direct service callers; valid contexts explicitly confirm; negative cases intentionally omit/alter required data |

Queue GET uses `/shifts/0/handover`: the existing GET contract is branch-scoped and does not consume the path ID. Mutating POST always uses `row.fromShiftId`. Takeaway serving and waiter responsibility handovers are separate workflows and were excluded after inspection.

API/UI compatibility: **PASS at static and executable request-contract level**. Browser interaction, focus, responsive rendering and authenticated end-to-end delivery are **NOT TESTED**.

## Financial integrity findings

- Role, financial permission and branch checks precede mutations. Only the designated active cashier may confirm/reject. Manager/Owner resolution additionally rejects either original party, even if subsequently promoted; Owner must select an authorized branch.
- All transitions acquire a branch-scoped handover row `FOR UPDATE`, re-read state, then conditionally update expected status/evidence fields. Source shift, sender, recipient and linked movement are checked.
- Equal count accepts and posts only the explicitly confirmed count. Unequal count creates `DISPUTED` evidence and **no movement**, including when the sender amount differs. Rejection is a non-posting dispute.
- Resolution requires a reason and exactly the preserved recipient count. The UI shows that amount without an editable settlement field; the server independently enforces equality. Original declaration, count, difference, notes and dispute evidence are retained.
- Posting, handover state/movement link and audit event share one transaction. Failure of audit rolls back state and movement in the offline transaction double; real rollback remains a PostgreSQL acceptance requirement.
- Same successful acceptance/resolution replays return the linked movement; conflicting repeats return 409. Row serialization plus `movementId` and conditional state guards prevent a second posting in the inspected code. This is **not yet proven under PostgreSQL concurrency**.
- Posting shares the recipient opening advisory lock, rejects an already open recipient drawer, and the next opening consumes all confirmed incoming movements once. Pending/disputed receipts block manual bypass. Cashier close checks outstanding personal advances without transferring their debt.
- Existing ledger/audit rows are not rewritten by transitions. No data correction, backfill, migration or historical reconciliation was performed. No schema change or migration SQL is required for this UI correction.

## Tests and isolation

`npm test`: **275 passed, 0 failed/skipped** (258 existing, 16 handover service-double tests, 1 new browser request-contract test). Separate staff-provision offline suite: **9 passed**. These 284 successful tests use no live database and do not establish PostgreSQL isolation.

TypeScript `--noEmit --incremental false`: PASS. ESLint `--max-warnings=0`: PASS. Production `next build`: PASS, exit 0. Build used an unreachable loopback database and invalid Supabase placeholder endpoint/keys to prevent production connections; its generated artifacts are validation-only and must not be deployed. Next emitted the existing warning that its ESLint plugin was not detected. `git diff --check`: PASS; new untracked implementation/test/report files were also checked for whitespace errors.

Inspected all **11 PostgreSQL subtests**: sender/recipient flow, unauthorized attempts, discrepancy, independent resolution, duplicate confirmation, concurrent confirmation, confirmation/dispute race, branch/source isolation, old ledger/audit preservation, concurrent next openings, outstanding advances. Strengthened the existing resolution subtest with two concurrent identical resolutions and assertions for one movement and one resolution audit. The suite was **NOT EXECUTED in this verification**.

Isolation guard requires a dedicated explicit URL, explicit `isolated-local-test-only` acknowledgement, loopback hostname, exact `/skoon_handover_test` database, postgres protocol, and only optional `schema=public`. It never loads dotenv, seeds or migrates, and sets the Prisma test datasource explicitly. Fixtures use unique generated branches; cleanup targets only their IDs. Existing role rows are prerequisites. A loopback URL alone cannot prove the database is not a tunnel to production; independent provisioning/ownership verification is still required. No verified isolated database was available, so no connection or fixture operation was attempted.

Further PostgreSQL coverage should include controlled/barrier interleavings of open versus accept and close versus incoming receipt, audit-failure rollback, and opposing independent resolvers. Promise scheduling is useful coverage but does not force every lock interleaving.

## Scope preservation and residual risks

No POS, inventory, payment, refund, tax, table, Fixed Float service, schema or migration files changed. The prior fix **does change shift custody boundaries**: explicit closing count, advance settlement check, pending receipt opening block and consumption of all confirmed receipts. These are intentional handover changes, not a claim that shift behavior is entirely unchanged. Existing sale/refund/withdrawal arithmetic and midnight deposit policy were retained. The known refund-to-expected-cash defect remains outside this fix.

Legacy disputes with no count may receive their first recipient count; the old reason remains preserved while the new reason is audited. A retry supplying a different reason from that retained legacy reason can return 409 rather than replay success; it cannot post a movement or overwrite evidence. Historical malformed links/obsolete recipients fail closed and require separately authorized reconciliation. Physical cash counting is a human attestation; software cannot prove cash was physically counted. Existing CSRF/origin policy was not expanded in this focused verification.

## Exact files changed in this verification

- `src/components/shifts/cash-handover-panel.tsx` — new shared confirmation and dispute/settlement UI.
- `src/lib/cash-handover-request.ts` — new browser-safe explicit-count request builder.
- `src/components/shifts/shifts-board.tsx` — mount panel, accept verified actor ID.
- `src/app/(app)/shifts/page.tsx` — pass session actor ID.
- `src/components/cashier/cashier-dashboard.tsx` — mount shared panel.
- `tests/cash-handover-offline.test.ts` — add executable request/schema compatibility case.
- `tests/cash-handover-postgres.test.ts` — strengthen resolution concurrency assertions; not executed.
- `docs/audits/CASH_HANDOVER_POST_FIX_VERIFICATION.md` — this report.

Prior fix changes retained: `package.json`, `src/lib/staff-shifts.ts`, `src/app/api/staff/shifts/[id]/handover/route.ts`, both handover test files and `docs/audits/P0_CASH_HANDOVER_FIX.md`. No further backend service/API modification was needed in this verification.

No production access, migration, commit, push, deploy or merge occurred.
