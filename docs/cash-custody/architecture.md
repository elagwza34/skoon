# Cash Custody Architecture — Shift-Bound Cash Custody System

**Status:** Draft for review (design only). Not executed. No migrations, deployments, or production changes.
**Author:** Design Review

---

## Purpose and Scope

Physical cash custody is shift-bound and evidence-based. This design adds:
- `CashDrawer` — a physical cash container within a branch.
- `CashCustodyAssignment` — links an employee, an operational shift (if required), and a cash drawer.
- `CashCustodyEvent` — immutable audit trail for assignment, acceptance, release, reconciliation, and handover.

**Not in scope for this draft:** backend API implementation, UI integration, or any change to existing financial behavior.

---

## Confirmed Design Decisions

| Decision | Detail |
|----------|--------|
| CashDrawer | Physical cash container within a branch. `branch_id`, `display_name`, `is_active`. |
| CashCustodyAssignment | Links employee, operational shift (if required), and CashDrawer. |
| CashCustodyEvent | Immutable audit trail: assignment, acceptance, release, reconciliation, handover. |
| One active custodian per drawer | Enforced by a partial unique index on `CashCustodyAssignment`. |
| Manager | Operational shift required; no cash custody by default. |
| Cashier | Operational shift and active cash custody required for cash transactions. |
| Owner | Exempt from operational shift; nonetheless must keep financial accountability. |
| Waiter/Kitchen | Operational shift only; no mandatory cash custody. |
| All financial authorization | Verified server-side, independently of role hierarchy. |
| Any non-zero cash difference | Recorded as a difference; not silently erased. |

---

## Architecture Overview

```
Branch ── CashDrawers ── PostgreSQL
   │
   ├─ CashCustodyAssignment ─ links Employee + Operational Shift + CashDrawer
   ├─ CashCustodyEvent      ─ immutable audit trail
   └─ Shift ── Payment ── FinancialMovement
```

`Shift` owns cash math. `CashCustodyAssignment` records who holds the drawer. `CashCustodyEvent` records every custody transition.

---

## Role/Cash Policy (Redone)

| Role | Operational shift required | Mandatory cash handling | Cash custody default |
|------|----------------------------|--------------------------|----------------------|
| Owner | ❌ Exempt | ❌ None | ❌ None |
| Manager | ✅ Required | ❌ None (optional only when explicitly assigned) | ❌ None |
| Cashier | ✅ Required | ✅ Required | ✅ Custodian when assigned or on duty |
| Waiter | ✅ Required | ❌ None | ❌ None |
| Kitchen | ✅ Required | ❌ None | ❌ None |

---

## Key Design Corrections (compared to previous draft)

1. **CashDrawer FK:** new model `CashDrawer` has FK `branch_id` → `branches`.
2. **CashCustodyAssignment FKs:** `cashier_id` → `users.id`, `shift_id` → `shifts.id`, `cashier` → FK to `User`, `branch` → FK to `CafeBranch`, `cashier` → FK to `User`.
3. **Partial unique index:** `(branchId, cashDrawerId)` where `status='active'` — one active custodian per drawer/branch. A partial index is created on `cash_drawers` to ensure at most one `CashCustodyAssignment` exists per drawer.
4. `CashCustodyEvent` has `assignmentId` → FK to `CashCustodyAssignment`.
5. **No duplicate fields**: each model has a single owner-facing unique identifier; no extra columns added.
6. **Owner shift policy**: Owner is exempt from shift requirement, but still subject to financial accountability (no automatic shift exemption).
7. **Concurrency**: `pg_advisory_xact_lock` (shift), partial index, `FOR UPDATE` on critical rows.
8. **Reconciliation**: nonzero `cashDifference` is recorded and cannot be silenced; it must be explicitly approved or corrected.

---

## Database Constraints

- `cash_custody_assignments`: partial unique index `(branchId, cashDrawerId)` where `status='active'`.
- `cash_custody_assignments`: unique index `(branchId, cashierId, shiftId)`.
- `cash_custody_events`: FK to `cash_custody_assignments(assignmentId)`.
- `cash_drawers`: FK to `branches(branchId)`, no `cash_drawer_id` duplication.

---

## RLS & Authorization

- Deny by default.
- Roles: `owner`, `manager`, `cashier`, `waiter`, `kitchen`.
- `owner`/`manager`: read + create/assign.
- `cashier`: read own branch's drawers; assign + release only for own shift or with explicit manager authorisation.
- Events read-only for staff; audit log immutable.

---

## Rollout & Testing

Peer-review → staging → integration tests → QA sign-off → deploy to production with rollback plan.

*Document controlled in D:\Sokoon\docs\cash-custody.*
