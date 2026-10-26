# Cash Custody — Authorization & Accounting Invariants

**Status:** Draft for review. NOT executed.

---

## 1. Authorization Invariants

### 1.1 Server-side-only verification

Every cash custody operation must verify directly from server-side state:

- Role (from `public.users` row — not JWT claims)
- Branch scope (from session `branchId`)
- Open shift (if the role requires one: `requiresOperationalShift(role)`)
- Active cash custody (if the role requires it: cashier+)

**Rule:** Never rely on client-supplied values. Do not use role hierarchy (`hasAtLeast`) as the sole gate for cash operations.

---

### 1.2 Role Matrix

| Operation | Owner | Manager | Cashier | Waiter/Kitchen |
|-----------|-------|---------|---------|----------------|
| Open shift | ✅ | ✅ | ✅ | ✅ |
| Close own shift | ✅ | ✅ | ✅ | ✅ |
| Assign cash custody | ✅ | ✅ (must have open shift) | ✅ (with open shift) | ❌ |
| Release / reconcile custody | ✅ | ✅ | ✅ (current custodian) | ❌ |
| Cash payment | ✅ | ✅ (if active custody) | ✅ (cashier+ + active custody) | ❌ |
| Refund | ✅ | ✅ (if active custody) | ✅ (cashier+ + active custody) | ❌ |

---

### 1.3 Critical Rules

- `hasAtLeast(role, CASHIER)` is used for cashier-level operations, but it is not sufficient alone.
- The endpoint must also verify:
  1. Active shift for the role (if role requires it),
  2. Active cash custody (if role requires it),
  3. Branch scope (own branch for non-owner),
  4. The drawer is assigned to the caller (or an active custody record exists).

---

## 2. Accounting Invariants

### 2.1 Shift Cash Buckets

| Field | Type | Meaning |
|-------|------|---------|
| `opening_cash` | `DECIMAL(10,2)` | Float at shift open |
| `expected_cash` | `DECIMAL(10,2)` | Expected cash at close |
| `closing_cash` | `DECIMAL(10,2)` | Counted cash at close |
| `cash_difference` | `DECIMAL(10,2)` | `closing_cash − expected_cash` |

### 2.2 Recalculation

`expected_cash` is live computed as:

```text
expected = opening + cash received − cash refunded
```

Where `cash received` and `cash refunded` are the cash payments and returns linked to this shift.

---

### 2.3 Reconciliation Rules

- Nonzero `cashDifference` is **not** silently erased.
- A shift may be closed only after reconciliation.
- Reconciliation records the actual counted cash; it is stored in an immutable audit record.
- A `cashDifference` of zero is the normal case; a nonzero difference must be acknowledged and either corrected or reported.

---

### 2.4 Financial Movement Links

- `FinancialMovement` references `sourceShiftId` (FK to `shifts`).
- `CashCustodyAssignment` and `CashCustodyEvent` reference `shiftId`.
- A cash payment finalised by a cashier must be linked to the active cash custody shift.

---

## 3. Concurrency & Idempotency

- **Shift lock:** `pg_advisory_xact_lock((cashierId, branchId))` for opening; `pg_advisory_xact_lock(shiftId)` for close.
- **Driver lock:** `pg_advisory_xact_lock(shiftId)` for cash movements.
- **Idempotency:** `FinancialOperation` (existing) remains the idempotent record for payments/refunds.
- **Partial unique index** on `cash_custody_assignments(branch_id, cash_drawer_id)` where `status='active'` prevents duplicate active custodians per drawer.

---

## 4. Example: Cash Payment Path

```
client → server (POST /api/staff/orders/[id]/pay)
├─ 1) verify role (cashier+)
├─ 2) verify open shift (cashier+)
├─ 3) verify active cash custody (cashier+)
├─ 4) verify branch scope
├─ 5) lock shift via pg_advisory_xact_lock(shiftId)
├─ 6) lock order via SELECT ... FOR UPDATE
├─ 7) compute amount server-side from order total
├─ 8) insert Payment (cash), update Order
├─ 9) insert FinancialOperation (idempotency)
└─ 10) return result
```

---

## 5. Example: Shift Close with Active Custody

```
client → server (POST /api/staff/shifts/[id]/close)
├─ 1) verify session
├─ 2) verify own shift
├─ 3) lock shift via pg_advisory_xact_lock(shiftId)
├─ 4) if active CashCustodyAssignment exists:
│    ├─ verify cashier_id matches session
│    ├─ require closingCash (physical count)
│    ├─ compute expected = opening + cash received − cash refunded
│    ├─ cashDifference = closing − expected
│    ├─ record cashDifference (nonzero is not silently erased)
│    └─ store reconciliation event
└─ 5) update shift (status='closed')
```
