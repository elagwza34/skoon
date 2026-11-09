# SOKOON — Requirements Gap Matrix

**Source:** Phase 0 audit of `D:\Projects-code\Sokoon`.
**Classification key:**
- **Implemented & verified** — exists in code and covered by tests.
- **Partially implemented** — exists but incomplete or contradicts spec.
- **Missing** — no implementation.
- **Conflicting** — implementation contradicts approved business rule.
- **Blocked** — pending business/migration decision.

---

## A. Shared Cashier Drawer and Shift Lifecycle

| ID | Requirement | Classification | Evidence / notes |
|----|-------------|----------------|------------------|
| A1 | Shared drawer continuity; expected balance carry-forward | Partially implemented | `cashier_handover` `FinancialMovement` consumed as opening float in `openShift` (`staff-shifts.ts`). No explicit carry-forward field; no automatic reconciliation if no handover. |
| A2 | Mandatory opening physical count | Partially implemented | `openingCash` required for cashier roles (`openShiftSchema`). No shortage-evidence blocking workflow; no explanation required; no recording against preceding shift. |
| A3 | Opening shortage evidence workflow | Missing | No `Shortage`/`ShortageEvidence` models. `cashDifference` exists on Shift but no blocking/review/settlement workflow. |
| A4 | Opening surplus pending-review | Missing | No dedicated surplus records; `cashDifference` positive = excess but no pending-review marking. |
| A5 | Shift boundary retention | Partially implemented | `Shift` has openedAt/closedAt/opening/closing/expected/difference/handover fields. No financial-day assignment; shift may span multiple days but day boundary not recorded. |

---

## B. Main Safe

| ID | Requirement | Classification | Evidence / notes |
|----|-------------|----------------|------------------|
| B1 | Main Safe separate balance | Missing | `/api/staff/main-safe/route.ts` exists but no `MainSafe` Prisma model. State inferred from `FinancialMovement` types. |
| B2 | Drawer-to-safe deposits pending | Missing | Route has only `withdraw` and `transfer_to_fixed_float`. No drawer→safe deposit initiation with Owner confirmation. |
| B3 | Main Safe withdrawals by category | Partially implemented | `withdrawFromMainSafe(session, amount, reason)` accepts free-text `reason`; no enforced category enum (operating expense / owner withdrawal / transfer to drawer / transfer to float / advance). |
| B4 | Main Safe reconciliation | Missing | No Owner-only count/finalize workflow; no shortage/surplus pending-review for safe. |

---

## C. Fixed Float

| ID | Requirement | Classification | Evidence / notes |
|----|-------------|----------------|------------------|
| C1 | Fixed Float separate baseline | Partially implemented | `fixed_float_baseline` movement type; one per branch enforced in `establishFixedFloatBaseline`. State computed from `FinancialMovement` rows (no `FixedFloat` model). |
| C2 | Owner-only baseline changes | Conflicting | `establishFixedFloatBaseline` uses `hasAtLeast(ROLE.MANAGER)`. Spec B1/C1/C4 require Owner-only. |
| C3 | Fixed Float transfers as explicit movements | Partially implemented | Via `FinancialMovement` types (`fixed_float_addition`, `fixed_float_withdrawal`, reversals). |
| C4 | No duplication across drawer/in-transit/safe | Partially implemented | Direction-based computation in `sharedFloatTotals` avoids double counting; reversals applied once. |

---

## D. Cashier Expenses

| ID | Requirement | Classification | Evidence / notes |
|----|-------------|----------------|------------------|
| D1 | Categorized cashier expenses | Missing | No `Expense` model or route. |
| D2 | Immediate authorized cash deduction | Missing | No expense implementation. |
| D3 | Amount, category, reason, employee, shift, timestamp, funding source | Missing | No expense implementation. |
| D4 | No arbitrary ceiling but role/shift/balance validation | Missing | Not applicable (no expense model). |
| D5 | Expenses separate from advances | Missing | Not applicable. |
| D6 | Reversal/correction for incorrect expense | Missing | No expense reversal implementation. |

---

## E. Cash Advances and Employee Accountability

| ID | Requirement | Classification | Evidence / notes |
|----|-------------|----------------|------------------|
| E1 | Multiple simultaneous advances | Partially implemented | Multiple `fixed_float_advance` rows possible; outstanding computed via linked returns/settlements. |
| E2 | Advances survive shift closure | Conflicting | `closeShift` calls `assertCashierAdvancesSettled` which BLOCKS close if cashier has unsettled advances. Spec says advances must survive close and not transfer to next cashier. |
| E3 | Partial settlements | Partially implemented | `fixed_float_settlement` with idempotency; outstanding = original − returns − settlements; cannot exceed outstanding. |
| E4 | Returns to original source | Partially implemented | `fixed_float_return` → FIXED_FLOAT. Drawer returns would need current-drawer logic (not implemented). Main Safe returns need Owner confirmation (not implemented). |
| E5 | Settlement after shift closure | Partially implemented | `settleSharedFloatAdvance` (Manager+) works after close; no fictitious shift required. Owner approval equivalent is Manager+ (may need Owner-only per spec E5). |
| E6 | Rejected expenses remain outstanding | Partially implemented | Rejected settlements do not reduce outstanding (verified in `settleSharedFloatAdvance` logic). |

---

## F. Electronic Payments and Refunds

| ID | Requirement | Classification | Evidence / notes |
|----|-------------|----------------|------------------|
| F1 | Electronic payment manual confirmation | Implemented & verified | `confirmElectronicPayment` requires `electronicPaymentConfirmed=true` + `externalTransactionReference`; sets `confirmedById/confirmedAt`. |
| F2 | Record method, amount, confirmer, timestamp, ref, order, shift, audit | Partially implemented | `Payment` has method/amount/confirmedById/confirmedAt/transactionRef/shiftId; `AuditLog` on finalize. |
| F3 | Electronic balances separate from physical cash | Implemented & verified | `refundAffectsTill` returns false for non-`cashier_till`; electronic payments do not add to drawer. |
| F4 | Refund authorization + execution proof | Partially implemented | `Refund` lifecycle REQUESTED→APPROVED→PENDING_EXECUTION→COMPLETED; `executedById/executedAt/externalReference/evidenceNote`. |
| F5 | Refund idempotent and auditable | Partially implemented | `idempotencyKey` unique on `[paymentId, idempotencyKey]`; `refund-accounting.ts` helpers. |
| F6 | No duplication of Phase 2-A payment/refund service | Implemented & verified | Single refund implementation; no parallel service found. |

---

## G. Financial Day Closing

| ID | Requirement | Classification | Evidence / notes |
|----|-------------|----------------|------------------|
| G1 | Independent financial day | Missing | No `FinancialDay` model; no business-day boundary config. |
| G2 | Owner-only close; pending items carry-forward | Missing | No day-close model. |
| G3 | Late transactions posted to current open day | Missing | No day model. |
| G4 | Owner-only reopen; corrections only; versioned snapshots | Missing | No day-close snapshot model. |
| G5 | Historical integrity; immutable closed-day reports | Partially implemented | `FinancialMovement` append-only; `AuditLog` exists. No day-level snapshot immutability. |

---

## H. Roles and Authorization

| ID | Requirement | Classification | Evidence / notes |
|----|-------------|----------------|------------------|
| H1 | Owner: safe, deposits, counts, baseline, approvals, day close/reopen, reports | Partially implemented | Owner has finance workspace, VAT, shift exemptions. Main Safe route uses Manager+ gate (contradiction with Owner-only safe authority). |
| H2 | Manager: view reports, review discrepancies, NO cash disbursal/safe/baseline/day | Partially implemented | Manager can view reports; can establish fixed-float baseline (contradiction); cash policy says Manager not cash-handling by default. |
| H3 | Cashier: open/close shift, receipts, electronic confirm, expenses, safe deposit initiation, advances, returns, close shift | Partially implemented | Cashier can open/close, finalize payments, confirm electronic, advances/returns. Expenses missing. Safe deposit initiation missing. |
| H4 | Waiter/Kitchen: no financial custody | Implemented & verified | Waiter/Kitchen excluded from payment/shift financial ops; `requiresOperationalShift` gates. |

---

## Cross-cutting invariants

| Invariant | Classification | Evidence |
|-----------|----------------|----------|
| Nonnegative available cash | Partially implemented | `sharedFloatTotals` can go negative if withdrawals exceed additions (no DB constraint). |
| No double counting | Partially implemented | Direction-based `sharedFloatTotals`; reversals once. No DB constraint. |
| No duplicate posting | Partially implemented | `FinancialOperation` unique on idempotency key; `Refund` unique on `[paymentId, idempotencyKey]`. |
| No unbalanced internal transfers | Missing | `FinancialMovement` source/destination are strings; no constraint that both sides exist. |
| No duplicate settlement | Partially implemented | `fixed_float_settlement` idempotency; cannot exceed outstanding. |
| No unauthorized role escalation | Partially implemented | Server-side `authz.ts` + `route-access.ts` + `require-page-access.ts`. |
| No historical movement mutation | Implemented & verified | `FinancialMovement` append-only; reversals are new rows. |
| No silent changes to closed shift reconciliations | Partially implemented | `expectedCash` frozen at close; `cashDifference` stored. No day-level immutability. |
| No cross-branch balance contamination | Partially implemented | `branchId` on all financial models; `staffCanAccessBranch` checks. |
| No inconsistent currency handling | Partially implemented | All amounts `NUMERIC(10,2)`; no currency field (assumed single currency EGP). |
| Exact decimal arithmetic | Conflicting | `recalculateInvoiceTotals` uses JS floating-point (`staff-invoices.ts`). Most other paths use cent integers. |

---

## 9. Blocked work (pending decision)

1. **Migration strategy**: Additive schema only vs. extend `FinancialMovement` account-type approach. Decision needed before Phase 1.
2. **Manager vs Owner for fixed-float baseline**: Spec says Owner-only; code uses Manager+. Decision needed.
3. **Cashier close with outstanding advances**: Code blocks; spec E2 says advances survive close. Decision needed on whether to remove block or change spec interpretation.
4. **Isolated test database URL** for integration tests (never production).

---

*End of REQUIREMENTS_GAP_MATRIX.md.*