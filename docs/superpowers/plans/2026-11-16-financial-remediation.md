# Financial remediation implementation plan

> **For agentic workers:** Use executing-plans for coordination and dispatching-parallel-agents for independent domains. Steps below track implementation and verification.

**Goal:** Fix all 33 confirmed findings in the financial audit, verify regressions, commit and push the authorized changes.

**Architecture:** Preserve the current Next.js/Prisma architecture and existing UI work. Use transaction-scoped locks and durable operation records for financial writes; use exact minor units and persisted tax snapshots for accounting. Split independent custody, payment and payroll fixes across workers; coordinator owns reports, invoices, tax and integration.

**Tech stack:** TypeScript, Next.js 15, Prisma 6, PostgreSQL, Node test runner.

**Spec:** `docs/audits/financial-2026-11-16/REPORT.md`; the user's instruction authorizes implementing its recommendations and committing/pushing them.

## Global constraints

- Preserve pre-existing local changes; include the earlier authorized UI fixes in a separate commit before the financial commit.
- Work in the existing checkout, where the audited local application state is present.
- No production database writes or destructive history rewrites. Ship reviewed additive migration files where needed.
- Keep amounts in integer minor units; protect branch scope and durable retries.
- Existing audit proofs are historical evidence, not passing regression tests after remediation.

## Review focus

- Concurrent requests and retries must not post duplicate money or regress workflow state.
- Refunds must affect execution-day cash totals without double-counting legacy payment flips.
- Mixed rates, discounts, partial payments and refunds must conserve allocated cents.
- Historical rows without new snapshots must retain their recorded tax behavior.
- Payroll segmentation must conserve salary, deductions and date-specific overtime.

## Tasks

- [x] PAY-01–05: reproduce expected safe behavior in `tests/financial-payments-fixes.test.ts`; fix payment scope, reference locking/constraint, manager route, replay and POS reference collection. Run red then green.
- [x] CASH-01–09: reproduce expected safe behavior in `tests/financial-cash-fixes.test.ts`; fix float accounting, backed additions, refund-aware withdrawals, reversals, unbounded balances, request keys, recipients and waiter handoff. Run red then green.
- [x] HR-01–11: reproduce expected behavior in `tests/financial-payroll-fixes.test.ts`; fix API serialization, proration, time classification, adjustment allocation, overtime, coverage, advances, zero lines, breaks and status transitions. Run red then green.
- [x] REP-01–08: add report/invoice/tax regressions; remove silent history limits, use active refund execution ledger, reconcile methods/averages, convert calendar dates to local boundaries, validate/price invoice modifiers, snapshot and calculate product tax.
- [x] Integrate all regression suites into `npm test`; run the full suite, typecheck, lint, Prisma validation and production build.
- [x] Review changes and migration safety; document results, remaining deployment steps and any unverified live behavior.
- [ ] Commit authorized UI work separately, then financial fixes and regression evidence. Push without force and verify remote HEAD.

## Integration record

UI remediation saved separately as `65279c1`. Financial fixes and evidence are prepared for the authorized final commit and push to `origin/main`; the actual resulting commit and remote verification are reported in the final response. All application tests, schema validation, lint, typecheck and final build passed; local PostgreSQL acceptance passed 6/6. No production database migration was run.
