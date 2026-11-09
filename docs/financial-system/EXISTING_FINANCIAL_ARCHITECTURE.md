# SOKOON — Existing Financial Architecture

**Source:** Read-only inspection of `D:\Projects-code\Sokoon` (prisma schema, lib services, API routes, tests, docs).
**No production DB accessed. No migrations run.**

---

## 1. Stack and conventions

- Next.js 15 App Router, TypeScript, Prisma 6, Supabase Auth/PostgreSQL.
- Prisma schema is the single source of truth (`prisma/schema.prisma`).
- Conventions documented in schema header: BIGINT PKs, NUMERIC(10,2) money, soft deletes, branch scoping, VARCHAR enums validated in app layer.
- Money computed server-side; client never sends amount to be paid.
- Cent-based integer arithmetic via `finance-metrics.ts` (`toCents`, `centsToAmount`, `summarizePayments`).
- Advisory locks (`pg_advisory_xact_lock`) keyed by shift id / cashier+branch / advance id / fixed-float-baseline / branch.
- Lock order: advisory lock → shift row FOR UPDATE → order row FOR UPDATE.
- `financial-shift-lock.ts` enforces a single lock namespace (`shift-financial:<id>`) with 5s `lock_timeout`.

---

## 2. Financial data model (schema models)

### 2.1 Core financial models

**`Shift`** — one open till session per employee per branch.
- `branchId`, `cashierId` (Uuid, who opened), `openBy` (display name)
- `openingCash`, `expectedCash`, `closingCash`, `cashDifference` (Decimal 10,2)
- `status` ('open'/'closed'), `openedAt`, `closedAt?`
- `handoverTo?`, `handoverNotes?`, `handoverCompletedAt?`
- Relations: `orders`, `payments`, `financialMovements`, `cashHandoversFrom`

**`Payment`** — one per settled order.
- `orderId`, `branchId`, `method` (cash/mobile_wallet/instapay/card/online/electronic_wallet/card_pos)
- `amount` (outstanding applied), `amountDue`, `changeAmount` (tendered − outstanding)
- `status`, `transactionRef?`, `gateway?`, `gatewayResponse?`
- `paidById?`, `confirmedById?`, `confirmedAt?`, `confirmationNote?`
- `shiftId?` (SetNull on shift delete)

**`FinancialMovement`** — immutable cash ledger between named accounts.
- `type` (Varchar 40), `status` ('posted' default), `amount`
- `sourceAccount`, `destinationAccount` (Varchar 30 — named accounts, not FKs)
- `sourceShiftId?`, `destinationUserId?`, `actorId?`, `reason`
- `reversalOfId?` (unique, self-referential), `advanceId?`, `metadata?`
- Corrections = new reversing row with `reversalOfId`.

**`FinancialOperation`** — idempotency record for monetary ops.
- `operationType`, `idempotencyKey`, `fingerprint`, `result` (Json)
- Unique on `[branchId, actorId, operationType, idempotencyKey]`

**`CashHandover`** — cash handover between cashiers.
- `fromCashierId`, `toCashierId?`, `amount`, `countedAmount?`, `difference?`
- `status` (PENDING/ACCEPTED/DISPUTED/RESOLVED), `notes?`, `disputeReason?`
- `resolvedById?`, `resolvedAt?`, `movementId?` (unique, links to FinancialMovement)
- `acceptedAt?`

**`Refund`** — refund lifecycle.
- `orderId`, `paymentId`, `amount`, `method`
- `status` (REQUESTED→APPROVED→PENDING_EXECUTION→COMPLETED/FAILED/CANCELLED)
- `requestedById`, `requestedAt`, `approvedById?`, `approvedAt?`, `executedById?`, `executedAt?`
- `externalReference?`, `evidenceNote?`, `evidenceUrl?`, `idempotencyKey`
- Unique on `[paymentId, idempotencyKey]`

**`EmployeeAccountability`** / **`PayrollDeduction`** / **`AccountabilityWaiver`**
- Waste/shortage accountability per employee; manager-approved deductions only.

### 2.2 Missing models (spec-required but absent)

`MainSafe`, `FixedFloat`, `EmployeeAdvance`, `Expense`, `AdvanceSettlement`, `FinancialDay`, `DayClosing`, `Shortage`, `Surplus`, `ShortageEvidence`, `ExpenseReversal`.

Safe, float, and advance state is currently carried by `FinancialMovement` rows with typed `sourceAccount`/`destinationAccount` values (`FIXED_FLOAT`, `CASHIER_ADVANCE`, `CASHIER_TILL`, `MAIN_SAFE`, `OPENING_RECONCILIATION`).

---

## 3. Key service functions

### 3.1 Shifts (`src/lib/staff-shifts.ts`)

| Function | Behavior |
|----------|----------|
| `openShift` | Non-owner only. Cashier requires `openingCash`. Advisory lock per cashier+branch. Consumes unconsumed `cashier_handover` movements as opening float. Audit logs `shift.open`. |
| `closeShift` | Shift owner only. Cashier requires `closingCash` + `orders.payment` permission. Calls `assertCashierAdvancesSettled` (blocks close if cashier has unsettled advances). Freezes `expectedCash`. Audit logs `shift.close`. |
| `getOpenShift` | Pre-transaction lookup to obtain shift id for lock key. |
| `readShiftCashState` / `toShiftView` | Live expected cash for open shifts; frozen for closed. |
| `expectedCashFrom` | `opening + net cash movement` (completed cash in − refunded cash out). |
| `cashDifferenceOf` | `counted − expected` (positive = excess, negative = shortage). |
| `crossedLocalMidnight` | Branch-local calendar day change. |
| `CASH_HANDLING_ROLES` | `[ROLE.CASHIER]` only. Manager excluded (non-cash unless explicit custody assignment). |

### 3.2 Fixed float / main safe / advances (`src/lib/staff-float.ts`)

| Function | Behavior | Role gate |
|----------|----------|-----------|
| `sharedFloatTotals` | Pure: available = Σ(destination=FIXED_FLOAT) − Σ(source=FIXED_FLOAT). Baseline from `fixed_float_baseline` rows. | — |
| `getSharedFloatSummary` | Balance, additions, withdrawals, advances per cashier, unallocated returns, outstanding. | Owner or branch staff |
| `recordSharedFloatAdvance` | `fixed_float_advance` FIXED_FLOAT→CASHIER_ADVANCE. Requires open shift + baseline. Idempotent. | Cashier only |
| `returnSharedFloatAdvance` | `fixed_float_return` CASHIER_ADVANCE→FIXED_FLOAT. Cannot exceed outstanding. | Cashier only |
| `settleSharedFloatAdvance` | `fixed_float_settlement`. Works after shift close. Idempotent. | Manager+ (`hasAtLeast`) |
| `establishFixedFloatBaseline` | One `fixed_float_baseline` per branch. Rejects if legacy movements exist without manual reconciliation. | Manager+ (contradicts Owner-only spec) |
| `getFixedFloatBoard` | Movement history board. | Manager+ |
| `getMainSafeSummary` / `withdrawFromMainSafe` / `transferMainSafeToFixedFloat` | Main-safe balance/history; withdraw; safe→float transfer. | Manager+ on GET; Manager+ on POST withdraw/transfer |

### 3.3 Payments (`src/lib/staff-payments-write.ts`)

| Function | Behavior |
|----------|----------|
| `finalizeOrderPayment` | Cashier/Owner. Server computes `outstanding = total − completed payments`. Creates Payment `amount=amountDue=outstanding`, `changeAmount=received−outstanding`. Order row lock. Idempotency via `FinancialOperation`. |
| `confirmElectronicPayment` | Cashier/Owner. Requires `electronicPaymentConfirmed=true`, `externalTransactionReference`. Rejects duplicate external ref per branch+method. Sets `confirmedById/confirmedAt`. |
| `PaymentResult` | `amount` (applied), `receivedAmount` (tendered), `changeAmount`, `paymentStatus`. |

### 3.4 Invoices (`src/lib/staff-invoices.ts`)

| Function | Behavior |
|----------|----------|
| `editOpenInvoice` | Owner/Cashier. `add`/`quantity`/`line_discount`/`financials` (general discount). Zod discriminated union schema. Idempotency key required for add/quantity. |
| `getCashierInvoices` | Sums completed `Payment.amount` per order as `paid`. `paymentStatus='paid'` if `paid >= total − 0.005`. |
| `recalculateInvoiceTotals` | **Uses JavaScript floating-point** (`Math.round`, `Number.EPSILON`). Violates exact-arithmetic rule. |
| `isInvoiceSettled` | `paid >= total - 0.005`. |

### 3.5 Receipts (`src/lib/receipt-settlement.ts`)
- `receiptInvoiceForSettlement`: null unless `invoice.paid > 0`.
- `receiptSettlementBreakdown`: presentation-only, no recalculation.

### 3.6 Refunds (`src/lib/refund-accounting.ts`)
- `RECOGNIZED_REFUND_STATUSES = ['recorded','externally_confirmed']`
- `remainingRefundableCents`, `assertRefundAmount`, `assertRefundReservation`
- `refundAffectsTill`: only `cashier_till` + recognized status affects till.

### 3.7 Locking (`src/lib/financial-shift-lock.ts`)
- `lockShiftFinancialState(tx, shiftId)`: `pg_advisory_xact_lock(hashtext('shift-financial:'+shiftId))`, 5s timeout.
- `LockedOpenShift` interface: id, branchId, cashierId, status.

### 3.8 Finance workspace (`src/lib/staff-finance.ts`)
- `getOwnerFinanceWorkspace`: Owner-only. Aggregates invoices, payments, shifts, float, VAT, branches. Summary: collected, refunded, netCollected, completedPayments, openInvoices, paidInvoices, outstanding.

---

## 3.9 API route inventory (financial)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/staff/shifts` | GET/POST | List/open shifts |
| `/api/staff/shifts/[id]/close` | POST | Close shift |
| `/api/staff/shifts/[id]/handover` | POST | Cashier handover request |
| `/api/staff/orders/[id]/pay` | POST | Finalize payment |
| `/api/staff/invoices` | GET | List invoices (cashier view) |
| `/api/staff/invoices/[id]` | PATCH (was 405, now wired to editOpenInvoice) / DELETE | Edit invoice / soft-archive |
| `/api/staff/main-safe` | GET/POST | Main-safe balance/history; withdraw; safe→float |
| `/api/staff/fixed-float` | GET | Fixed float board |
| `/api/staff/refunds` | POST | Request refund |
| `/api/staff/reconcile` | GET | Reconciliation |
| `/api/staff/pos/orders` | POST | POS dine-in order create |
| `/api/public/orders` | POST | Public order creation |

---

## 4. Money flow trace

1. **Order created** (`/api/staff/pos/orders` or waiter POS): `Order` row with `total`, `paymentStatus` unpaid. Optional `shiftId` if cashier has open shift.
2. **Payment finalized** (`/api/staff/orders/[id]/pay`): `finalizeOrderPayment` computes outstanding server-side, creates `Payment` (`amount=outstanding`), links to shift. Order `paymentStatus='paid'`.
3. **Shift expected cash**: Computed live from shift's completed cash payments − refunds. Frozen at close into `Shift.expectedCash`.
4. **Shift close**: Cashier enters `closingCash`. `cashDifference = closingCash − expectedCash`. `assertCashierAdvancesSettled` blocks if cashier has unsettled advances. Handover recipient optional.
5. **Cash handover**: `CashHandover` PENDING → recipient ACCEPTED → `FinancialMovement` `cashier_handover` posted → consumed as next opening float.
6. **Fixed float advance**: Cashier takes `fixed_float_advance` from FIXED_FLOAT to CASHIER_ADVANCE. Outstanding tracked via linked `fixed_float_return`/`fixed_float_settlement`.
7. **Refund**: `Refund` REQUESTED → APPROVED → PENDING_EXECUTION → COMPLETED. Only recognized statuses reduce refundable balance.
8. **Electronic payment**: `confirmElectronicPayment` with cashier attestation + external reference. Does not touch physical till.

---

## 5. Authorization model

- `src/lib/authz.ts`: `ROLE` (owner/manager/cashier/waiter/kitchen), `hasAtLeast`, `requiresOperationalShift`, `isOwner`, `isCashHandlingRole` (in staff-shifts).
- `src/lib/session.ts`: `StaffSession`, `staffCanAccessBranch`.
- `src/lib/route-access.ts`: `canSeeRoute`, permission-for-path mapping.
- `src/lib/require-page-access.ts`: Server-side page enforcement in `(app)` layout.
- `src/middleware.ts`: Fail-closed.

Role financial capabilities:
- **Owner**: Full financial access, shift exemptions, finance workspace, VAT.
- **Manager**: View reports, fixed-float board (currently can establish baseline — contradiction), advance settlement (Manager+).
- **Cashier**: Open/close own shift, finalize payments, confirm electronic, record expenses (missing), advances/returns, handover.
- **Waiter/Kitchen**: No financial custody.

---

## 6. Audit trail

- `FinancialMovement` append-only; reversals via new row with `reversalOfId`.
- `FinancialOperation` idempotency records with fingerprint.
- `AuditLog` on all financial mutations (action, entityType, entityId, oldValues/newValues).
- `OrderResponsibilityHistory`, `OrderTableTransfer` immutable assignment ledgers.
- `WaiterOrderReconciliationAudit` append-only audit events for reconciliation.

---

## 7. Known limitations / contradictions (summary for gap matrix)

1. Manager can establish fixed-float baseline (spec: Owner-only).
2. Cashier close blocked by unsettled advances (spec: advances survive close).
3. No Main Safe / Fixed Float / Employee Advance / Expense / Financial Day models.
4. No shortage/surplus blocking workflow at shift open.
5. `recalculateInvoiceTotals` uses JS floating-point.
6. No drawer→safe deposit initiation.
7. No Financial Day close/reopen/snapshot versioning.
8. Invoice PATCH was 405 (fixed in commit `872cb3d`).

---

## 8. Tests

- `tests/offline.test.ts` — 418 tests, offline (no DB). Covers payments, shifts, refunds, floats, invoices, discounts, VAT, handover, concurrency.
- `tests/financial-postgres.test.ts` — opt-in DB-backed fixed-float invariants (baseline, advance, return, settlement, idempotency, concurrency, reversals).
- `tests/cash-handover-*.test.ts`, `tests/cash-refund-*.test.ts`, `tests/shift-concurrency-postgres.test.ts`, `tests/cashier-postgres.test.ts`.

---

*End of EXISTING_FINANCIAL_ARCHITECTURE.md.*