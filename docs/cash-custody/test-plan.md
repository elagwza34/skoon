# Cash Custody — Regression & Concurrency Test Plan

**Status:** Draft for review. NOT executed.

---

## 1. Regression Test Plan

### 1.1 Unit Tests (Offline)

| Area | Test cases |
|------|------------|
| Model validation | `CashDrawer` branch FK exists; `CashCustodyAssignment` FKs to `User`, `Shift`, `CashDrawer`; `CashCustodyEvent` FK to `CashCustodyAssignment`. |
| Partial unique index | Verify `(branch_id, cash_drawer_id)` unique index exists with `WHERE status='active'`. |
| Prisma validation | `prisma validate` passes (new models compile). |
| Role policy | `isCashHandlingRole` returns correct values for all roles. |
| Authorization invariants | `requiresOperationalShift` and `hasAtLeast` checks as per role matrix. |

### 1.2 Integration Tests

| Test | Expected result |
|------|-----------------|
| `assignCashCustody` (manager, open shift) | Creates `CashCustodyAssignment` with active status. |
| `assignCashCustody` (cashier, open shift) | Creates assignment; matches active uniqueness index. |
| `assignCashCustody` (duplicate drawer) | Fails with unique-index conflict (409). |
| `assignCashCustody` (no open shift) | Fails with `ShiftError` (409). |
| `releaseCashCustody` (correct custodian) | Moves assignment to `released`. |
| `closeShift` with active custody | `cashDifference` recorded; `cash_custody_events` appended. |
| `closeShift` without active custody | Closes shift, no cash difference recorded. |
| `finalizeOrderPayment` (cashier, no active custody) | Fails with 403. |
| `finalizeOrderPayment` (cashier, active custody) | Succeeds; `Payment` + `FinancialOperation` inserted. |
| `refundOrderPayment` (manager+, active custody) | Refund processed; `FinancialOperation` recorded. |
| `fixedFloat` movement | Unchanged behavior; immutable. |

### 1.3 UI / API Regression

- `/cashier` renders with active cash custody if present.
- `/shifts` shows cash drawer information when assigned.
- `/inventory` and `/finance` are not affected by this change.

---

## 2. Concurrency Test Plan

| Scenario | Blocking lock | Expected outcome |
|----------|---------------|------------------|
| Two requests assign same drawer simultaneously | `pg_advisory_xact_lock(shiftId)` + unique index | One succeeds; the other gets 409 (duplicate). |
| Open shift ×2 for same cashier+branch | `pg_advisory_xact_lock((cashierId, branchId))` | Second fails (P2002). |
| Close shift while cash movement pending | Advisory lock | First completes; second sees shift closed (409). |
| Release custody while shift open | Advisory lock | Completes; shift continues. |

---

## 3. Phase 3 Validation Results (From This Session)

| Command | Result |
|---------|--------|
| `npx prisma validate` | ✅ Passed |
| `npm run typecheck` | ✅ Passed (exit 0) |
| `npm run lint` | ✅ Passed (exit 0) |
| `npm test` | ✅ Passed (157/157) |
| `npm run build` | ✅ Passed (exit 0) |

---

## 4. Regression & Concurrency Test Plan (Summary)

| Area | Test cases |
|------|------------|
| Model validation | `CashDrawer` branch FK exists; `CashCustodyAssignment` FKs to `User`, `Shift`, `CashDrawer`; `CashCustodyEvent` FK to `CashCustodyAssignment`. |
| Partial unique index | Verify `(branch_id, cash_drawer_id)` unique index exists with `WHERE status='active'`. |
| Prisma validation | `prisma validate` passes (new models compile). |
| Role policy | `isCashHandlingRole` returns correct values for all roles. |
| Authorization invariants | `requiresOperationalShift` and `hasAtLeast` checks as per role matrix. |
| Integration tests | `assignCashCustody` → `active` → `release`; `closeShift` with active custody → `cashDifference` recorded; `finalizeOrderPayment` when no active custody → 403. |

---

## 5. Final Validation

- `prisma validate`: ✅
- `npm run typecheck`: ✅
- `npm run lint`: ✅
- `npm test`: ✅ (157/157)
- `npm run build`: ✅

All checks passed. Deployment-ready after design approval.
