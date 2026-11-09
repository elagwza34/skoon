# SOKOON — Gate 1: Financial Design (Read-Only)

**Source:** Phase 0 audit of `D:\Projects-code\Sokoon`.
**Status:** Design only. No schema, migration, or application code changed. No production DB accessed.
**Approval required:** Before any Gate 2 implementation, the decisions below must be confirmed.

---

## 1. Purpose

Resolve the contradictions found in Phase 0 and document the minimal compatible architecture for the remaining financial capabilities (Main Safe, Fixed Float baseline authority, advances-at-close, expenses, Financial Day, shortage/surplus, electronic/refunds audit, reporting).

---

## 2. Contradictions found in Phase 0

| # | Contradiction | Current code | Approved business rule | Decision needed |
|---|---------------|--------------|------------------------|-----------------|
| C-1 | Fixed-float baseline authority | `establishFixedFloatBaseline` uses `hasAtLeast(ROLE.MANAGER)` (Manager can set baseline) | Spec B1/C1/C4: **Owner-only** authority for safe/baseline | Change gate to Owner-only (`isOwner`). Document decision. |
| C-2 | Cashier close blocked by unsettled advances | `closeShift` calls `assertCashierAdvancesSettled` → blocks close if cashier has unsettled advances | Spec E2: advances **survive** shift closure; must not block close or transfer to next cashier | Decide: remove block (allow close with advances intact) or document as stricter operational policy. |
| C-3 | Floating-point invoice totals | `recalculateInvoiceTotals` uses JS `Math.round`/`Number.EPSILON` | Rule 16: exact decimal/integer-minor-unit arithmetic; no JS floats for money | Replace with cent-integer arithmetic (`toCents`/`centsToAmount`). |
| C-4 | No Main Safe model | `/api/staff/main-safe/route.ts` exists but state inferred from `FinancialMovement` types; no `MainSafe` Prisma model | Spec B1–B4: Main Safe is a separate balance with Owner-only operations | Add dedicated `MainSafe` model OR document `FinancialMovement` account-type convention as authoritative. |
| C-5 | No Financial Day model | No `FinancialDay`/`DayClosing`/`Shortage`/`Surplus`/`ShortageEvidence`/`Expense` models | Spec G1–G5, A3–A4, D | Add additive models. |
| C-6 | Manager establishes baseline but spec says Owner | `establishFixedFloatBaseline` (C-1 duplicate) | Spec C4: Owner-only baseline changes | Same as C-1. |

---

## 3. Recommended resolutions (for approval)

### 3.1 C-1 / C-4: Fixed-float baseline → Owner-only
**Recommendation:** Change `establishFixedFloatBaseline` role gate from `hasAtLeast(ROLE.MANAGER)` to `isOwner(session.role)`. Keep `getFixedFloatBoard` and `getSharedFloatSummary` readable by Manager+ (view-only), but baseline *establishment* is Owner-only per spec.

### 3.2 C-2: Advances survive shift close
**Recommendation:** Remove the `assertCashierAdvancesSettled` block from `closeShift`. Outstanding advances remain attributable to the original cashier and are tracked via `fixed_float_advance`/`fixed_float_return`/`fixed_float_settlement`. The cashier can still request settlement after close via `settleSharedFloatAdvance` (Manager+ per spec E5; consider Owner-only per spec E5).

### 3.3 C-3: Floating-point invoice totals
**Recommendation:** Rewrite `recalculateInvoiceTotals` in `src/lib/staff-invoices.ts` to use cent-integer arithmetic via `toCents`/`centsToAmount` from `finance-metrics.ts`. Preserve the public function signature and rounding behavior (nearest cent), but eliminate `Number`/`Math` float operations on monetary values.

### 3.4 C-5: Missing models → additive schema
**Recommendation:** Add additive Prisma models (no existing columns dropped/renamed):
- `MainSafe` (balance, lastCountedAt, countedById)
- `FixedFloat` (baselineAmount, availableBalance, requiresReconciliation, baselineConfirmedById)
- `EmployeeAdvance` (advanceId PK, employeeId, sourceLocation, originalAmount, purpose, outstanding, status)
- `AdvanceSettlement` (advanceId, amount, type [return/expense/waiver], approvedById, settledAt)
- `Expense` (amount, category, reason, employeeId, shiftId, fundingSource, receiptUrl?)
- `FinancialDay` (branchId, date, status [open/closed/reopened], closedById, closedAt, snapshot)
- `DayClosing` (financialDayId, version, closedById, closedAt, snapshot JSON)
- `Shortage` (shiftId, cashierId, amount, reason, status [open/approved/waived/settled], settledById)
- `Surplus` (shiftId, cashierId, amount, reason, status [pending/approved])
- `ShortageEvidence` (shortageId, evidenceUrl, submittedById, submittedAt)

Keep `FinancialMovement` as the ledger mechanism (sourceAccount/destinationAccount named accounts). New models reference movements where needed for double-entry traceability.

### 3.5 C-6: Drawer-to-safe deposit
**Recommendation:** Add `POST /api/staff/main-safe` action `deposit_from_drawer` (cashier initiates → pending), `POST /api/staff/main-safe/confirm-deposit` (Owner confirms after physical count). Pending transfer stored as `FinancialMovement` with `status='pending'` and a `pendingTransferId`/`metadata` link; not counted in safe balance until Owner confirmation.

---

## 4. Minimal compatible architecture (Gate 2 scope)

### 4.1 Principle: additive only
All schema changes are additive (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`). No existing columns dropped or renamed. Consistent with existing migration style (e.g., `20261102000000_add_refunds_and_payment_confirmation`).

### 4.2 Money arithmetic
- All monetary values stored as `DECIMAL(10,2)` in DB.
- Application layer uses cent-integer arithmetic (`toCents`/`centsToAmount`).
- No `Number`/`Math` operations on monetary values in financial services.
- Existing `sharedFloatTotals`, `expectedCashFrom`, `cashDifferenceOf`, `refund-accounting.ts` already use cent integers; `recalculateInvoiceTotals` is the one violator (fix in C-3).

### 4.3 Concurrency
- Reuse existing `pg_advisory_xact_lock` namespaces:
  - `shift-financial:<shiftId>` (shift close/open)
  - `shared-float:<branchId>` (fixed float)
  - `fixed-float-baseline:<branchId>` (baseline)
  - `advance-repayment:<advanceId>` (advance settlement)
- Lock order preserved: advisory lock → row FOR UPDATE.
- New models follow same pattern.

### 4.4 Authorization (server-side only)
| Operation | Required role | Gate |
|-----------|--------------|------|
| Establish fixed-float baseline | Owner | `isOwner` |
| Main Safe withdraw / confirm deposit / count | Owner | `isOwner` |
| Main Safe view report | Manager+ | `hasAtLeast(MANAGER)` |
| Shift open/close (cashier) | Cashier | `isCashHandlingRole` + `orders.payment` permission |
| Shift open/close (non-cash) | Waiter/Kitchen/Manager-without-custody | `requiresOperationalShift` |
| Advance take/return | Cashier | `ROLE.CASHIER` + open shift |
| Advance settlement | Manager+ (spec: consider Owner-only) | `hasAtLeast(MANAGER)` or `isOwner` |
| Expense record | Cashier | `ROLE.CASHIER` + open shift + available balance |
| Financial day close/reopen | Owner | `isOwner` |
| Invoice edit (discount) | Owner/Cashier | `ROLE.OWNER` or `ROLE.CASHIER` |

### 4.5 What is NOT changing (preserved)
- Shift open/close advisory locks and row locks.
- Payment finalization (server-computed outstanding, idempotency, order row lock).
- Electronic payment confirmation (attestation + external reference + duplicate ref rejection).
- Fixed float baseline/addition/withdrawal/advance/return/settlement via `FinancialMovement`.
- Cash handover PENDING→ACCEPTED/DISPUTED/RESOLVED lifecycle.
- Refund lifecycle REQUESTED→APPROVED→PENDING_EXECUTION→COMPLETED/FAILED/CANCELLED.
- Invoice editing (add/quantity/line_discount/financials) for Owner/Cashier.
- Audit logging on all financial mutations.
- Owner-only finance workspace and VAT report.
- Waiter/Kitchen/QR ordering/inventory workflows (untouched).

---

## 5. Migration plan (additive, dry-run required)

Proposed migration sequence (each a separate timestamped directory under `prisma/migrations/`):

1. `2026XXXX_add_main_safe_model` — `CREATE TABLE main_safe (...)`
2. `2026XXXX_add_fixed_float_model` — `CREATE TABLE fixed_float (...)`
3. `2026XXXX_add_employee_advance_and_settlement` — `CREATE TABLE employee_advance, advance_settlement (...)`
4. `2026XXXX_add_expense_model` — `CREATE TABLE expense (...)`
5. `2026XXXX_add_financial_day` — `CREATE TABLE financial_day, day_closing (...)`
6. `2026XXXX_add_shortage_surplus` — `CREATE TABLE shortage, surplus, shortage_evidence (...)`
7. `2026XXXX_fix_financial_invariants` — indexes, check constraints (nonnegative balances where applicable)

Each migration: additive only, no `DROP COLUMN`, no `RENAME COLUMN`, no `DELETE` of existing rows. Dry-run on an isolated test database before any production application.

---

## 6. Approvals required before Gate 2 implementation

| # | Decision | Options | Recommended | Decider |
|---|----------|---------|-------------|---------|
| D-1 | Fixed-float baseline authority | Owner-only vs. Manager+ | Owner-only (spec C4) | Business |
| D-2 | Cashier close with unsettled advances | Block (current) vs. allow (spec E2) | Allow close; advances survive (spec E2) | Business |
| D-3 | Advance settlement authority | Manager+ vs. Owner-only | Manager+ (current, less disruptive) vs. Owner-only (spec E5) | Business |
| D-4 | Schema strategy | Additive dedicated models vs. extend `FinancialMovement` types | Additive dedicated models (clearer boundaries) | Architect + Business |
| D-5 | Isolated test database | Provision URL for integration tests | Required before Phase 8 tests | Ops/Infra |
| D-6 | Any production migration | Apply vs. hold | Hold until all above decisions confirmed | Business |

---

## 7. Gate 1 exit criteria

- [ ] All contradictions (C-1…C-6) documented with recommended resolutions.
- [ ] Minimal compatible architecture defined (additive only, cent-integer money, existing lock namespaces, server-side authz).
- [ ] Migration plan drafted (additive, dry-run on isolated DB).
- [ ] Approvals D-1…D-6 obtained from business/architect/ops.

---

**Gate 1 is complete as a design document.** No code, schema, or migration has been modified. Awaiting approvals D-1…D-6 before proceeding to Gate 2 (Phase 1 schema implementation).

*End of Gate 1 design.*