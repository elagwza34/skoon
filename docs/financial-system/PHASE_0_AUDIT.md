# SOKOON — Phase 0 Financial Audit

**Repo:** `D:\Projects-code\Sokoon`
**Branch:** `main` (clean, up to date with `origin/main`)
**HEAD:** `650391c fix(cashier): allow print/preview before settlement without amount`
**Audit type:** Read-only. No code modified, no DB access, no migrations run.
**Auditor role:** Principal Financial Systems Architect / Senior Next.js Engineer / Postgres-Prisma Specialist / Financial Controls Auditor

---

## 1. Repository and working-tree state

- Working tree: clean. Nothing to commit.
- Git remote `origin/main` is synchronized.
- Prisma schema: `prisma/schema.prisma` (99 KB). Comment states: "single source of truth", "BIGINT PKs · NUMERIC(10,2) money · soft deletes · branch scoping · VARCHAR enums". Production migrations run through reviewed Supabase migrations; `prisma migrate deploy` must NOT be run.
- Existing financial API surface is substantial: `/api/staff/shifts`, `/api/staff/orders/[id]/pay`, `/api/staff/invoices`, `/api/staff/invoices/[id]`, `/api/staff/main-safe`, `/api/staff/fixed-float`, `/api/staff/refunds`, `/api/staff/reconcile`, `/api/staff/pos/orders`.
- Existing financial docs already present: `docs/FINANCIAL-ACCEPTANCE-TESTS.md`, `docs/SKOON_REFUND_ACCOUNTING_ARCHITECTURE.md`, `docs/audits/BUSINESS_LOGIC_AUDIT.md`, `docs/audits/CRITICAL_REMEDIATION_BATCH_2.md`, `docs/audits/CRITICAL_REMEDIATION_BATCH_3.md`, `docs/audits/WAITER_CASHIER_SERVING_COMPREHENSIVE_AUDIT.md`.
- Tests: `tests/offline.test.ts` (159 KB, 418 tests), `tests/financial-postgres.test.ts` (opt-in DB-backed fixed-float), `tests/cash-handover-*.test.ts`, `tests/cash-refund-*.test.ts`, `tests/shift-concurrency-postgres.test.ts`, `tests/cashier-postgres.test.ts`.

---

## 2. Financial data model (from `prisma/schema.prisma`)

### 2.1 Models that exist and carry financial state

| Model | Key financial fields | Role |
|-------|---------------------|------|
| `Shift` | `openingCash`, `expectedCash`, `closingCash`, `cashDifference`, `handoverTo`, `handoverNotes`, `cashierId`, `status` | One open till session per employee per branch. Expected = opening + cash received − cash refunded (computed live for open, frozen at close). |
| `Payment` | `amount`, `amountDue`, `changeAmount`, `status`, `method`, `shiftId`, `confirmedById`, `confirmedAt`, `transactionRef` | One per settled order. `amount` = outstanding applied; `receivedAmount` returned in API result but not a DB column. |
| `FinancialMovement` | `type`, `status`, `amount`, `sourceAccount`, `destinationAccount`, `reversalOfId`, `advanceId`, `sourceShiftId`, `metadata` | Immutable cash-ledger entries between named accounts. Corrections via reversing entry. |
| `FinancialOperation` | `operationType`, `idempotencyKey`, `fingerprint`, `result` | Durable retry-safe response record for monetary ops. |
| `CashHandover` | `fromCashierId`, `toCashierId`, `amount`, `countedAmount`, `status` (PENDING/ACCEPTED/DISPUTED/RESOLVED), `movementId` | Cash handover between cashiers with recipient confirmation. |
| `Refund` | `amount`, `method`, `status` (REQUESTED→APPROVED→PENDING_EXECUTION→COMPLETED/FAILED/CANCELLED), `requestedById`, `approvedById`, `executedById`, `externalReference`, `idempotencyKey` | Refund lifecycle. |
| `EmployeeAccountability` | `employeeId`, `amount`, `waivedAmount`, `deductedAmount`, `reviewStatus` | Waste/shortage accountability per employee. |
| `PayrollDeduction` | `accountabilityId`, `amount`, `payrollPeriod`, `approvedById` | Manager-approved payroll settlement only. |
| `AccountabilityWaiver` | `accountabilityId`, `amount`, `managerId` | Waiver records. |
| `Discount` / `DiscountRedemption` | `type`, `value`, `isActive` | Discount catalog + redemption linking. |
| `AppSetting` | `key`, `value`, `branchId` | Branch-scoped settings (potential financial-day boundary config). |
| `AuditLog` | `action`, `entityType`, `entityId`, `oldValues`, `newValues` | Append-only audit trail. |
| `Order` | `total`, `paymentStatus`, `shiftId`, `responsibleWaiterId`, `itemsSubtotal`, `discountAmount`, `taxAmount` | Order links to shift and payments. |

### 2.2 Models that do NOT exist (spec-required, missing)

| Required model | Status | Evidence |
|----------------|--------|----------|
| `MainSafe` | Missing | `/api/staff/main-safe/route.ts` exists and calls `staff-float.ts` functions (`getMainSafeSummary`, `withdrawFromMainSafe`, `transferMainSafeToFixedFloat`), but no `MainSafe` Prisma model. Safe state is inferred from `FinancialMovement` types. |
| `FixedFloat` | Missing | `/api/staff/fixed-float/route.ts` exists; `staff-float.ts` computes baseline/additions/withdrawals from `FinancialMovement` rows with `type` values like `fixed_float_baseline`. No `FixedFloat` model. |
| `EmployeeAdvance` | Missing | Advances are `FinancialMovement` rows of type `fixed_float_advance`/`fixed_float_return`/`fixed_float_settlement`. No dedicated advance model. |
| `Expense` | Missing | No expense model or route found. |
| `AdvanceSettlement` | Missing | Settlements are `fixed_float_settlement` movements. No dedicated settlement model. |
| `FinancialDay` | Missing | No financial-day model, no day boundary, no closing snapshot. |
| `DayClosing` | Missing | Not present. |
| `Shortage` / `Surplus` | Missing | Shift has `cashDifference` but no dedicated shortage/surplus records, no shortage-evidence workflow. |
| `ShortageEvidence` | Missing | Not present. |

---

## 3. Core financial services (read-only findings)

### 3.1 `src/lib/staff-shifts.ts` (50 KB)
- `openShift(session, input)`: Any non-owner employee. Cash-handling roles (`CASHIER` only — Manager intentionally excluded) must declare `openingCash`. Advisory lock per `cashierId+branchId`. Consumes unconsumed `cashier_handover` `FinancialMovement` rows as opening float.
- `closeShift(session, shiftId, input)`: Shift owner only. Cash-handling roles must provide `closingCash`. Calls `assertCashierAdvancesSettled` (cashier advances must be settled before close). Records `handoverTo`/`handoverNotes`. Freezes `expectedCash` at close. Owner (403) cannot close shifts.
- `expectedCashFrom(openingCash, payments)`: `opening + net cash movement` where net = completed cash in − refunded cash out.
- `cashDifferenceOf(closingCash, expectedCash)`: positive = excess, negative = shortage.
- `crossedLocalMidnight(openedAt, closedAt, timezone)`: branch-local calendar day change detection.
- `CASH_HANDLING_ROLES = [ROLE.CASHIER]` only. Manager is non-cash unless explicit out-of-band custody assignment exists.

### 3.2 `src/lib/staff-float.ts` (36 KB)
- `sharedFloatTotals(rows)`: Computes `available`, `baseline`, `additions`, `withdrawals` from `FinancialMovement` rows by `sourceAccount`/`destinationAccount` direction (+ when FIXED_FLOAT is destination, − when source). Requires `fixed_float_baseline` row else `requiresReconciliation=true`.
- `getSharedFloatSummary(session, branchId)`: Owner or branch staff. Lists advance details, unallocated returns, outstanding per cashier.
- `recordSharedFloatAdvance(session, input)`: Cashier only. Requires open shift + baseline established. `fixed_float_advance` movement `FIXED_FLOAT → CASHIER_ADVANCE`. Idempotent via `FinancialOperation`.
- `returnSharedFloatAdvance(session, input)`: Cashier only. `fixed_float_return` `CASHIER_ADVANCE → FIXED_FLOAT`. Cannot exceed outstanding.
- `settleSharedFloatAdvance(session, advanceId, input)`: Manager+ (hasAtLeast). Works after shift closes. `fixed_float_settlement`.
- `establishFixedFloatBaseline(session, input)`: Manager+ (hasAtLeast, NOT Owner-only). One baseline per branch. Rejects if legacy shared-float movements exist without manual reconciliation.
- `getFixedFloatBoard(session)`: Manager+ only.
- `getMainSafeSummary`, `withdrawFromMainSafe`, `transferMainSafeToFixedFloat`: Main-safe operations via FinancialMovement types.

### 3.3 `src/lib/staff-payments-write.ts` (43 KB)
- `PAYMENT_METHODS = ['cash','mobile_wallet','instapay','card','online','electronic_wallet','card_pos']`.
- `finalizeOrderPayment(session, orderId, input)`: Cashier/Owner only. Requires open shift for operational roles. Computes `outstanding = total − completed payments` server-side. Creates `Payment` with `amount=outstanding`, `amountDue=outstanding`, `changeAmount=received−outstanding`. Row lock on order. Idempotency via `FinancialOperation`.
- `confirmElectronicPayment(session, orderId, input)`: Cashier/Owner only. Requires `electronicPaymentConfirmed=true`, `externalTransactionReference`. Rejects duplicate external reference per branch/method. Confirms `confirmedById`, `confirmedAt`.

### 3.4 `src/lib/staff-invoices.ts` (22 KB)
- `editOpenInvoice(session, orderId, input)`: Owner/Cashier only. Supports `add`, `quantity`, `line_discount`, `financials` (general discount). `editSchema` is a Zod discriminated union.
- `getCashierInvoices(session, range)`: Computes `paid` = sum of completed `Payment.amount`. `paymentStatus = 'paid'` if `paid >= total − 0.005`.
- `recalculateInvoiceTotals(...)`: Uses JavaScript floating-point (`Math.round`, `Number.EPSILON`) — **violates rule 16** (no float arithmetic for money).
- `isInvoiceSettled(total, paid)`: `paid >= total - 0.005`.

### 3.5 `src/lib/receipt-settlement.ts`
- `receiptInvoiceForSettlement(orderId, invoice)`: Returns null unless `invoice.paid > 0`. Receipt rendering requires persisted paid invoice.
- `receiptSettlementBreakdown(...)`: Presentation-only, never recalculates.

### 3.6 `src/lib/refund-accounting.ts`
- `RECOGNIZED_REFUND_STATUSES = ['recorded','externally_confirmed']`; `RESERVING_REFUND_STATUSES = ['requested', ...]`.
- `remainingRefundableCents`, `remainingReservableRefundCents`, `assertRefundAmount`, `assertRefundReservation`.
- `refundAffectsTill(source, status)`: Only `cashier_till` + recognized status affects till.

### 3.7 `src/lib/financial-shift-lock.ts`
- `lockShiftFinancialState(tx, shiftId)`: `pg_advisory_xact_lock(hashtext('shift-financial:' + shiftId))` with 5s lock_timeout. Lock order: advisory lock → shift row FOR UPDATE → order row FOR UPDATE.

### 3.8 `src/lib/staff-finance.ts`
- `getOwnerFinanceWorkspace(session, filters)`: Owner-only consolidated view: invoices, payments, shifts, float, VAT, branches. Summary: collected, refunded, netCollected, openInvoices, paidInvoices, outstanding.

### 3.9 `src/lib/finance-metrics.ts`
- `summarizePayments`, `toCents`, `centsToAmount`: Cent-based integer arithmetic helpers.

### 3.10 `src/lib/vat-report.ts`
- VAT report generation (referenced by staff-finance).

---

## 4. Authoritative sources of truth

| Balance | Authoritative source |
|---------|---------------------|
| Shift expected/closing cash | `Shift.expectedCash` / `Shift.closingCash` (frozen at close); live computation for open shifts |
| Payment applied amount | `Payment.amount` (outstanding settled); `Payment.changeAmount` = tendered − outstanding |
| Fixed float available | `FinancialMovement` rows with `sourceAccount`/`destinationAccount = 'FIXED_FLOAT'` (computed by `sharedFloatTotals`) |
| Cashier advance outstanding | `fixed_float_advance` minus `fixed_float_return`/`fixed_float_settlement` linked by `advanceId` |
| Invoice paid/remaining | `getCashierInvoices` sums completed `Payment.amount` per order |
| Financial movement ledger | `FinancialMovement` (append-only; reversals via new row with `reversalOfId`) |

**No duplicate balance calculations found** between shift and payment layers — shift expected cash is derived from payments linked to that shift.

---

## 5. Phase 0 requirements gap matrix

Each requirement from the approved business rules classified against current implementation.

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| A1 | Shared drawer continuity; expected balance carry-forward | Partial | `cashier_handover` `FinancialMovement` consumed as opening float in `openShift`. No explicit "carry forward" field. |
| A2 | Mandatory opening count | Partial | `openingCash` required for cashier; no shortage-evidence blocking workflow. |
| A3 | Opening shortage evidence workflow | Missing | No `Shortage`/`ShortageEvidence` models. `cashDifference` exists but no blocking/review workflow. |
| A4 | Opening surplus pending-review | Missing | No dedicated surplus records. |
| A5 | Shift boundary retention | Partial | `Shift` has openedAt/closedAt/opening/closing/expected/difference/handover fields. No financial-day assignment. |
| B1 | Main Safe separate balance | Missing | Route exists; no `MainSafe` model. State inferred from movement types. |
| B2 | Drawer-to-safe deposits pending | Missing | Route only has `withdraw` and `transfer_to_fixed_float`. No drawer→safe deposit initiation. |
| B3 | Main Safe withdrawals by category | Partial | `withdrawFromMainSafe` accepts `reason` but no enforced category enum. |
| B4 | Main Safe reconciliation | Missing | No Owner-only count/finalize workflow. |
| C1 | Fixed Float separate baseline | Partial | `fixed_float_baseline` movement type; one per branch enforced. |
| C2 | Fixed Float baseline changes | Contradiction | `establishFixedFloatBaseline` uses `hasAtLeast(ROLE.MANAGER)` — spec says Owner-only. |
| C3 | Fixed Float transfers as explicit movements | Partial | Via `FinancialMovement` types. |
| C4 | C1/C4 Owner-only baseline | Contradiction | See C2. |
| D | Cashier expenses | Missing | No `Expense` model/route. |
| E1 | Multiple advances per employee | Partial | Via multiple `fixed_float_advance` rows. |
| E2 | Advances survive shift closure | Partial | `assertCashierAdvancesSettled` actually BLOCKS close if advances outstanding (contradicts E2 which says advances must survive close). |
| E3 | Partial settlements | Partial | `fixed_float_settlement` with idempotency. Outstanding computed. |
| E4 | Returns to original source | Partial | `fixed_float_return` → FIXED_FLOAT. |
| E5 | Settlement after shift closure | Partial | `settleSharedFloatAdvance` works after close (Manager+). |
| E6 | Rejected expenses | Partial | Rejected settlements don't reduce outstanding (verified in code). |
| F | Electronic payments | Partial | `confirmElectronicPayment` with attestation + external ref. Electronic balances separate from cash. |
| F | Refunds | Partial | `Refund` model with lifecycle; `refund-accounting.ts` helpers. |
| G1 | Independent financial day | Missing | No `FinancialDay` model. |
| G2 | Pending items carry-forward | Missing | No day-close model. |
| G3 | Late transactions | Missing | No day model. |
| G4 | Reopening closed days | Missing | No day-close model. |
| G5 | Historical integrity | Partial | `FinancialMovement` append-only; `AuditLog` exists. |
| H | Roles/RBAC | Partial | `authz.ts`, `route-access.ts`, `require-page-access.ts` exist. Manager cash policy exists. |

---

## 6. Critical risks and contradictions

1. **Manager can establish fixed-float baseline** (`staff-float.ts:establishFixedFloatBaseline` uses `hasAtLeast(ROLE.MANAGER)`), but spec B1/C1/C4 say Owner-only authority for safe/baseline. Contradiction.
2. **Cashier shift close blocked by outstanding advances** (`assertCashierAdvancesSettled` in `closeShift`), but spec E2 says advances must survive shift closure and not become next cashier's liability. Contradiction — close is blocked instead of allowing close with advances intact.
3. **No Main Safe model** despite `/api/staff/main-safe/route.ts` existing. Safe balance is inferred from `FinancialMovement` types, not a dedicated balance table.
4. **No Financial Day model** — spec G1–G5 (day close, reopen, corrections, snapshots) not implemented.
5. **No Expense model** — spec D (cashier expenses) not implemented.
6. **`recalculateInvoiceTotals` uses JavaScript floating-point** (`staff-invoices.ts`) — violates rule 16 (exact decimal/integer-minor-unit arithmetic).
7. **Invoice PATCH route previously returned 405** for all edits (fixed in `872cb3d` by wiring to `editOpenInvoice`).
8. **No drawer-to-safe deposit initiation** — only `withdraw` and `transfer_to_fixed_float` on main-safe route. Spec B2 requires cashier-initiated drawer→safe deposit with Owner confirmation.
9. **No shortage/surplus blocking workflow** at shift open — spec A3 requires blocking opening until shortage evidence submitted.
10. **Electronic payment duplicate reference check** is per branch+method — reasonable, but electronic payments do not touch physical till (`refundAffectsTill` returns false for non-cashier_till).

---

## 7. Preserved existing functionality (do not break)

- Shift open/close with advisory locks and row locks.
- Payment finalization with server-computed outstanding, idempotency, order row lock.
- Electronic payment confirmation with attestation + external reference + duplicate reference rejection.
- Fixed float baseline/addition/withdrawal/advance/return/settlement via `FinancialMovement` types.
- Cash handover PENDING→ACCEPTED/DISPUTED/RESOLVED lifecycle.
- Refund lifecycle REQUESTED→APPROVED→PENDING_EXECUTION→COMPLETED/FAILED/CANCELLED.
- Invoice editing (add/quantity/line_discount/financials) for Owner/Cashier.
- Audit logging on all financial mutations.
- Owner-only finance workspace and VAT report.
- Waiter/Kitchen/QR ordering/inventory workflows untouched.

---

## 8. Recommended implementation sequence

1. **Phase 1 — Schema**: Add missing models (`MainSafe`, `FixedFloat`, `EmployeeAdvance`, `Expense`, `AdvanceSettlement`, `FinancialDay`, `DayClosing`, `Shortage`, `Surplus`, `ShortageEvidence`) or decide to keep `FinancialMovement`-type approach with documented account names. Add migration plan (dry-run, isolated DB).
2. **Phase 2 — Shared drawer/shift**: Implement shortage-evidence blocking, surplus pending-review, automatic carry-forward, Owner-shift exemptions preserved.
3. **Phase 3 — Main Safe**: Add drawer→safe deposit initiation, Owner confirmation, pending-transfer accounting, withdrawal categories.
4. **Phase 4 — Expenses/Fixed Float/Advances**: Categorized expenses, partial settlements, returns to source, Owner-only baseline change (fix Manager contradiction).
5. **Phase 5 — Financial Day**: Independent day lifecycle, Owner-only close/reopen, versioned snapshots, late transactions.
6. **Phase 6 — Electronic/refunds audit**: Verify existing implementation against spec; no duplication.
7. **Phase 7 — Reporting**: 20 required reports.
8. **Phase 8 — Testing**: Unit + integration on isolated DB; concurrency; race conditions.
9. **Phase 9 — Release**: Final report, GO/NO-GO.

---

## 9. Required approvals before implementation

- Migration approach: additive schema changes only (no destructive SQL). Explicit approval required for any migration.
- Manager vs Owner authority for fixed-float baseline (resolve contradiction C2).
- Whether to add dedicated models vs. extend `FinancialMovement` account-type approach.
- Isolated test database URL for integration tests (never production).
- Whether cashier close should be blocked by outstanding advances (spec E2 says no; current code blocks).

---

*End of Phase 0 audit. Next: Phase 1 design and minimal compatible schema changes.*