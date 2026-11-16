# Financial audit remediation — 16 November 2026

The 33 confirmed findings in [REPORT.md](REPORT.md) have implementation changes and regression coverage. The original report and its reproducers document the pre-fix state; run the regression suites under `tests/` to verify the corrected state. The historical reproducers intentionally assert the old defects and are not the post-fix acceptance suite.

## Changes and coverage

| Findings | Implementation | Regression evidence |
|---|---|---|
| PAY-01 | Non-owner refund queries retain the authenticated branch regardless of client filters. | `financial-payments-fixes.test.ts` |
| PAY-02 | Electronic reference lock and duplicate check run inside the transaction. An additive partial unique index protects completed InstaPay/wallet references per branch and method. | Payment regressions and real PostgreSQL concurrent settlement/index rejection |
| PAY-03 | Payment collection has its own Cashier/Owner gate; refund decisions/execution reach their existing action-specific authorization. | Actual HTTP route transpiled with isolated dependencies |
| PAY-04 | Durable electronic payment replay precedes mutable order-state rejection and is checked again under the transaction lock. | Payment replay regression |
| PAY-05 | POS collects and submits the external reference, checks required input before order creation, and retains server validation. | Production payload/schema regression; typecheck/build |
| CASH-01 | Safe transfer uses MAIN_SAFE → FLOAT_TRANSFER → FIXED_FLOAT. The float reader also avoids counting the old paired withdrawal as a second addition. | Offline ledger and concurrent PostgreSQL transfer tests |
| CASH-02 | Owner additions use the funded safe-transfer path with a balance guard and request key. | Insufficient-funds regression |
| CASH-03 | Operating withdrawals include current cash-refund movements and restrict legacy refund reads to cash. | 100 receipt / 80 refund / rejected 100 withdrawal |
| CASH-04 | Owner-only reversal uses branch locks, verifies original funding, and rejects an unavailable float debit. Unverified legacy funding requires manual reconciliation. | Offline spent-fund/authority tests; real PostgreSQL spent and legacy reversal tests |
| CASH-05 | Balance/debt calculations read the full history; display history is sliced only after totals are computed. | More-than-300 movement regression; safe deposit plus 201 withdrawals |
| CASH-06 | Safe withdrawal/transfer accepts a stable request key, checks it again under the lock, persists both results, and fingerprints the reason. Fixed-float UI retains request identity on failure. | Retry/conflicting-reason tests and real concurrent transfer retry |
| CASH-07 | Cash handover recipients must be active branch cashiers, checked before and during close. | Kitchen recipient rejected before close; existing handover suite |
| CASH-08 | Fixed-float board uses net additions/withdrawals including reversals. | Board/reversal regression |
| CASH-09 | Selected waiter recipient is resolved, checked for branch/role and open shift, then assigned the open orders with responsibility history. The waiter dropdown uses waiter candidates. | Successful waiter-close handoff regression |
| HR-01 | HR JSON responses serialize BigInt IDs at the HTTP boundary; Prisma records and decimal/date serialization remain intact. | Nested IDs/decimal response test; all affected routes typecheck |
| HR-02 | Monthly segments use contractual minutes over the full calendar month, splitting at month and rate boundaries. | August 1–30 with two rates pays 5322.58, using August's 31-day schedule basis |
| HR-03 | `isPaid` is mapped explicitly into the calculator's `paid` field. | Paid/unpaid approved leave regressions |
| HR-04 | Paid holidays contribute scheduled entitlement; unknown paid classification blocks generation. | Paid and unknown holiday regressions |
| HR-05 | Bonuses and deductions are applied once to total period gross, after all segments. Excess deductions block for explicit revision/carry-forward instead of disappearing. | 36000 gross / 15000 deduction / 21000 net |
| HR-06 | Overtime is assigned to its work-date compensation segment. | Hourly raise and later overtime regression |
| HR-07 | Compensation segments must cover every day without gaps or overlaps. | Internal compensation gap rejected |
| HR-08 | Outstanding advances are retained in the payroll snapshot, without an invented automatic deduction or branch-wide blocker. Owner can record verified external repayment with receipt, cap, audit and durable operation; the payroll UI exposes repayment. | Debt preservation, capped/idempotent repayment and leading-zero-ID PostgreSQL race |
| HR-09 | Zero-net lines settle at approval without a fictitious payment. A zero-only run becomes paid and closes; period completion includes paid/closed runs under a shared period lock. | Offline approval/close test and real PostgreSQL run/period test |
| HR-10 | Configured unpaid breaks reduce payable attendance, once per scheduled day. | Eight hours minus one-hour break = 420 payable minutes |
| HR-11 | Generation and review/approval use the same run transaction lock. | Concurrent real PostgreSQL reviews, approval, and rejected late review |
| REP-01 | Invoice/export, payment and VAT totals no longer silently truncate at 150/300/1000 records. | 301-payment service regression; production queries verified |
| REP-02 | Owner summary includes completed Refund ledger amounts. | 30100 collected / 40 refunded / 30060 retained service fixture |
| REP-03 | VAT uses saved invoice tax and allocates it cumulatively over split/partial payments; completed refunds reverse their payment's allocated VAT at execution time. | Pure split/refund/window tests and service-level full refund |
| REP-04 | Refund cash aggregation filters `executedAt`. | Yesterday's request executed today appears today |
| REP-05 | Date filters/export use validated Cairo calendar boundaries, including DST; impossible dates are rejected. | Cairo midnight and invalid date tests |
| REP-06 | Invoice addition always validates required modifiers, fetches active/price fields, prices them, and persists option rows and readable snapshots. | Required omission rejected; valid option adds 10 to a 100 item |
| REP-07 | POS, public QR and appended items snapshot product tax rates in existing `optionsSnapshot.taxRate`. Common recalculation allocates invoice discounts and calculates tax from line snapshots. Existing lines retain saved invoice tax behavior. POS preview includes tax/discounts. | Mixed-rate/discount and legacy-rate tests; actual POS write boundary |
| REP-08 | Method totals subtract completed refunds by method; average collection uses the same net amount as total revenue. | 100 collection / 40 refund reconciles at 60 |

## Additional review fixes

Independent review identified three issues during implementation, all corrected and retested:

- Canonical numeric advance IDs are used for repayment locks and fingerprints: `1` and `01` share the same lock.
- Safe-funded addition records link to their withdrawal. Reversals cannot turn an unverified historical addition into a safe deposit.
- Zero-net approval completes the payroll period, with a shared period lock to serialize completion across runs and payments.

The reviewer rechecked those fixes and reported no critical regression within that review scope.

## Verification

- `npm test`: **436 passed, 0 failed, 0 skipped**.
- Local PostgreSQL 17 acceptance: **6 passed, 0 failed, 0 skipped**. This exercised actual services, transaction locks and the new unique index. The cluster was newly created for this task, bound to `127.0.0.1:55437`, and contains synthetic fixtures only.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero warnings.
- `npx prisma validate`: passed; Prisma emitted its existing deprecated configuration warning.
- `npm run build`: final integration build passed.
- `git diff --check`: passed after whitespace cleanup.

Local logs are retained alongside this report. The committed `verification.json` records final outcomes without including environment credentials.

### Re-run isolated PostgreSQL acceptance

Provision a fresh local database named `skoon_financial_test`, apply the Prisma schema and the new migration, then set these variables for that process only:

```powershell
$env:DATABASE_URL = 'postgresql://audit@127.0.0.1:55437/skoon_financial_test?connect_timeout=30&pool_timeout=30'
$env:DIRECT_URL = $env:DATABASE_URL
$env:SKOON_REMEDIATION_TEST_DATABASE_URL = $env:DATABASE_URL
$env:SKOON_REMEDIATION_TEST_ACK = 'fresh-local-scratch-only'
node --require ./tests/node-userinfo-workaround.cjs --import tsx --test tests/financial-remediation-postgres.test.ts
```

This opt-in suite adds synthetic fixtures to that scratch database. It refuses to run against an unconfigured or non-local database; it does not connect to production or drop/truncate existing databases.

## Deployment and historical data

No production migration or financial record update was performed. Deploy the additive `20261116160000_unique_completed_electronic_reference` migration through the project's approved deployment process. The index deliberately fails if duplicate completed references already exist: reconcile them explicitly, rather than deleting or rewriting financial history automatically.

The tax policy follows the existing invoice recalculation contract: tax is added to the discounted taxable base. New line rates are stored in existing JSON snapshots, so no new tax column is required. Historic settled invoices are not recalculated using today's product rates. Legacy payment-flip refunds still lack a reliable execution timestamp and are explicitly labelled in VAT output.

Old incorrect payroll runs, unbacked float additions, and bank/cash discrepancies require financial reconciliation before operational reliance. These changes prevent the code defects; they do not certify historical balances or alter approved historical records. The additional unconfirmed audit candidates remain outside the confirmed 33-finding scope.

PostgreSQL design references: [partial unique indexes](https://www.postgresql.org/docs/current/indexes-partial.html), [transaction advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).
