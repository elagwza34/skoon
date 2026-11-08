# SOKOON — P0-2 Cash Refund & Shift Reconciliation Fix

Date: 2026-11-04. Base: `main@cfe1b23` plus the existing uncommitted Cash Handover fix and verification changes, preserved. **Status: BLOCKED** pending isolated PostgreSQL verification; this document does not declare P0 resolved.

## Confirmed root cause

`executeRefund` marked the new `Refund` record COMPLETED but wrote no physical cash movement or execution-shift attribution. `fetchShiftPayments` and shift reconciliation only recognized `Payment` rows and legacy `Payment.status=refunded`. New refunds keep the original Payment completed. As a result, executing a cash refund did not reduce live or closing expected cash.

Execution also checked stale `Shift.expectedCash - closingCash`, rather than opening plus actual collections minus withdrawals. That could reject a legitimate refund after new collections. The comment claiming the remaining refundable balance was checked “under lock” was incorrect: the source Payment and Refund were not locked. Execute/decide/cancel could race through read/check/update paths, and the early APPROVED check prevented a successful execution retry from reaching the durable response record.

## Actual flow inspected

| Flow | Existing source / finding |
|---|---|
| Cash collection | pay API → `finalizeOrderPayment`; common financial shift lock, order lock, completed Payment linked to collection shift; unchanged |
| Electronic collection | pay API → `confirmElectronicPayment`; explicit operator evidence, not bank settlement; unchanged |
| Refund lifecycle | pay API actions → request/decide/execute/cancel; `Refund` is canonical lifecycle record linked to original Payment/Order/branch |
| Physical disbursement | New posted `FinancialMovement.type=cash_refund`, CASHIER_TILL → CUSTOMER, sourceShiftId = executing till, actorId = executor; same transaction as COMPLETED |
| Electronic refund | Manager/Owner plus explicit external reference and evidence; COMPLETED Refund/Audit only, no till movement |
| Live/close expectation | Payment collections + legacy payment refund treatment + posted refund/withdrawal ledger totals, scoped by executing shift/branch |
| Cash handover | Uses actual declared closing cash, reconciled against corrected expectation; confirmation/state machine untouched |
| Fixed Float | Advances go FIXED_FLOAT → CASHIER_ADVANCE, not till sales; not added as available till cash. Existing debt-settlement close guard retained |
| Main Safe | Existing deposits/withdrawals use MAIN_SAFE directions; customer cash refunds do not affect safe totals |
| Financial reporting | Existing reports use Refund COMPLETED for some net revenue calculations; other summaries/VAT and refund dates remain inconsistent as previously audited. No report redesign in this fix |
| UI | No existing refund lifecycle UI caller discovered; refund actions remain API-driven. Existing shift/cashier views receive corrected expectedCash/cashOut without UI changes |

`refund-accounting.ts` contains an older lowercase-status policy that does not match the active uppercase Refund lifecycle; it was not adopted as a second source of physical cash truth. The old refund API action is disabled (410), so it does not create a second deduction for new executions.

## Previous and corrected equation

Previous:

`expected = opening + completed cash Payments - legacy refunded cash Payments - posted operational withdrawals`

Corrected:

`expected = previous equation - posted cash_refund till→customer movements attributed to this execution shift and branch`

Opening 0 + cash collection 100 − executed cash refund 30 = **70**, including when stored `Shift.expectedCash` is still 0. A full refund leaves 0; two partial refunds 30/20 leave 50. Electronic receipts cannot fund physical cash out. Pending/requested, approved-but-unexecuted, failed and cancelled refunds create no cash_refund movement. A later shift pays its own refund; the original collection shift remains unchanged.

`readShiftCashState` supplies the same calculation to the funding check and close. The board batches ledger totals by shift and applies `expectedCashAfterRefunds`, the same equation. Closed shifts continue returning their frozen expectedCash; no historical row is recalculated or updated. CashOut now includes executed refund ledger amounts alongside the pre-existing legacy payment refund amount.

## Exact modifications in this task

| File | Functions / change |
|---|---|
| `src/lib/staff-payments-write.ts` | `refundRequestSchema`: reject sub-cent requests. `lockRefundPayment` / `lockRefund`: branch-scoped source locks. `requestRefund`: reserve balance after Payment lock. `decideRefund` / `cancelRefund`: Payment→Refund lock and conditional transition. `executeRefund`: executing shift lock first, revalidation, live funding check, durable replay, electronic evidence, atomic ledger/state/audit |
| `src/lib/staff-shifts.ts` | `readShiftCashState`, `expectedCashAfterRefunds`: canonical cash equation; `fetchShiftPayments`: optional branch scope; `toShiftView`, `getShiftsBoard`: live refunds/cashOut; `closeShift`: same calculation and refund amount in close audit |
| `src/app/api/staff/orders/[id]/pay/route.ts` | Forward header/body idempotency key to execution; absent request key becomes undefined instead of invalid null |
| `tests/cash-refund-offline.test.ts` | 22 service/ledger/contract cases using explicit in-memory transaction doubles |
| `tests/cash-refund-postgres.test.ts` | Opt-in isolated PostgreSQL suite, 9 subtests with multiple lifecycle cases; authored, NOT RUN |
| `package.json` | Include refund offline suite in npm test; add explicit opt-in PostgreSQL command |
| `docs/audits/P0_CASH_REFUND_RECONCILIATION_FIX.md` | This report |

Dependency on the existing handover fix was reported before editing: `closeShift` must consume the corrected shared cash equation. No handover authorization, recipient confirmation, independent resolution, state machine, UI panel or prior test files were changed by this task. Existing uncommitted changes and historical audit snapshots remain in place.

## Ledger, lifecycle and concurrency

No parallel refund balance column or second ledger was added. Existing FinancialMovement columns provide shift FK, actor, branch, amount, timestamp and immutable metadata (`refundId`, paymentId, orderId). Refund keeps lifecycle ownership; its committed cash movement supplies the physical cash attribution. Audit links the execution to movement/shift and records before/after till expectation using the same execution timestamp.

Cash write lock order: **common financial shift advisory lock → shift row → source Payment row → Refund row**. Request/decision/cancellation take Payment→Refund without subsequently seeking a shift lock. The executing cashier/branch/open status are revalidated after the shift lock; source payment status/method/order/branch and remaining completed refund balance are checked after source locking. A decision/cancellation cannot overwrite COMPLETED after winning or losing the race. The common shift lock makes close either include a committed refund or reject disbursement after close.

Durable execution response is checked before stale status/open-shift checks and again under locks. Same key/fingerprint returns the original result, including after shift close. Conflicting fingerprints reject. Without a key or with a different key, a completed Refund rejects; it never posts again. Existing ledger evidence on an inconsistent APPROVED record rejects for documented review rather than posting a second outflow. Payment/refund/ledger/audit/durable result commit or roll back together. No automatic financial retry or external bank operation was introduced.

PostgreSQL row locking behavior was checked against the [PostgreSQL 17 explicit-locking documentation](https://www.postgresql.org/docs/17/explicit-locking.html). This supports the design, not a claim of runtime acceptance.

## Regression evidence

| Requested case | Evidence authored / safe execution |
|---|---|
| Full cash refund | Offline service: 100 → 0; PostgreSQL collection→request→approve→execute authored |
| Partial refund | Offline 100 → 70; PostgreSQL authored |
| Two partial refunds | Offline 100 → 50 with separate IDs/movements; PostgreSQL authored |
| Electronic refund | Evidence required, no till movement; offline pass; PostgreSQL authored |
| Pending/requested | No movement/till change; offline pass; PostgreSQL authored |
| Approved unexecuted | No movement/till change; offline pass; PostgreSQL authored |
| Cancelled | Execution rejected, no movement; offline pass; PostgreSQL authored |
| Later shift | Original collection shift unchanged, execution shift charged; offline pass; PostgreSQL authored |
| Another authorized cashier | Executor on Refund and ledger; offline pass; PostgreSQL authored |
| Duplicate request | Same durable result, one movement, including retry after close; offline pass; PostgreSQL authored |
| Concurrent executions | Transaction-double scheduling passes; real PostgreSQL test authored, NOT RUN |
| Close/execution race | Closed-under-lock double test passes; real race suite authored, NOT RUN |
| Cross-branch | Rejection without writes in double; PostgreSQL authored |
| Exceed remaining | Execute/request caps and reservations under source lock; double pass; PostgreSQL authored |
| Handover after refund | Actual close service freezes 70 with zero variance and PENDING handover 70; offline pass; PostgreSQL authored |
| Existing ledger | Old rows unchanged; inconsistent existing refund evidence fails closed; offline pass; PostgreSQL authored |

Additional offline cases: withdrawals reduce available funding, mixed electronic receipts are excluded, wrong shift/branch and non-posted movements are excluded, and audit failure rolls back execution in the transaction double. Test doubles intentionally do not establish actual lock behavior or PostgreSQL rollback/isolation.

Validation results: npm test **297 passed, 0 failed/skipped**, including 22 new refund cases, 17 existing handover cases and 258 other offline cases. TypeScript `--noEmit --incremental false`, ESLint `--max-warnings=0`, Prisma validation, production build and `git diff --check`: **PASS, exit 0**. New untracked refund tests/report also passed a whitespace/conflict-marker check. Build and Prisma validation used an unreachable loopback database; build used invalid Supabase placeholder URL/keys, so its artifacts are validation-only, not for deployment. Existing warnings: package.json Prisma configuration deprecation, and Next ESLint plugin not detected. PostgreSQL suite was **not invoked**, even in skip mode, because no independently verified isolated database was available.

The integration guard requires a dedicated explicit `SKOON_REFUND_TEST_DATABASE_URL`, explicit `isolated-local-test-only` ACK, loopback host, exact `skoon_refund_test` database, postgres protocol and only optional `schema=public`. It never loads dotenv or falls back to production credentials and never seeds/migrates. Existing application schema/roles are required. Fixtures and cleanup are scoped to newly generated test branch IDs; notifications are scoped through fixture orders. A loopback URL/name alone does not prove isolation from a production tunnel: independent provisioning verification is still required before opting in. No database connection or test fixture was created in this task.

## Historical data, migrations and remaining blockers

**No migration or backfill required by this implementation; none executed or proposed as a prerequisite.** Prisma already has all ledger fields, indexed sourceShiftId and JSON metadata; SQL histories show string movement types/account names, not an enum requiring extension. Applied-schema drift remains unverified because production was not accessed. A missing table/column/constraint must be resolved through a separately approved schema review, not automatic migrations.

Previously COMPLETED cash Refunds without a corresponding ledger execution event cannot be safely attributed from the original Payment.shiftId. They are **not retroactively deducted or backfilled**; existing closed snapshots and financial history remain untouched. An operator must separately reconcile any affected historical/open drawer before unrestricted use. This fix protects new execution through the revised writer and cannot certify earlier records.

Remaining release blockers: real PostgreSQL concurrency/rollback acceptance (including controlled lock interleavings), browser/API acceptance, historical attribution review, and existing schema drift. The PostgreSQL race test checks consistent outcomes but does not force every possible interleaving. Refund UI completion and cross-report/VAT/date normalization are outside scope. Existing bounded financial movement lists (e.g. Fixed Float's latest-300 view) remain a known reporting limitation; cash_refund account directions do not themselves change Fixed Float/Main Safe balances, but more ledger rows can accelerate that existing truncation risk. Existing operational Manager-versus-physical-cash custody policy was not redesigned.

No production access, data mutation, migration, historical rewrite, commit, push, merge or deployment occurred. **Final status remains BLOCKED, not P0 resolved, regardless of passing offline checks.**
