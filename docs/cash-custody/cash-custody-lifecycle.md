# Cash Custody — Lifecycle State Machine

**Status:** Draft for review. NOT executed.

```text
[CREATED] ──accept──► [ACTIVE] ──release──► [RELEASED]
  │                         │                        │
  └──────────┬──────────────┘                        │
             └──reconciled──► [RECONCILED] ◄──────────┘
```

---

## States

| State | Description |
|-------|-------------|
| `CREATED` | Assignment recorded by authorized role. Not yet active. |
| `ACTIVE` | Acceptance recorded. Custodian holds the drawer. |
| `RELEASED` | Custodian released. No longer active. |
| `RECONCILED` | Reconciliation completed with recorded `cashDifference`. |

---

## Event Types (Append-Only)

| Event type | Description |
|------------|-------------|
| `assigned` | Assignment created (status='active') |
| `accepted` | Custodian accepts the assignment |
| `released` | Custodian releases the drawer |
| `reconciled` | Reconciliation completed; `cashDifference` recorded |

---

## Transition Rules

- `CREATED → ACTIVE`: requires `accepted` event by the assigned cashier, or manager approval.
- `ACTIVE → RELEASED`: release only by the assigned custodian or a manager; must hold `shiftId` open.
- `ACTIVE → RECONCILED`: reconciliation completes with recorded `cashDifference`.

---

## Notes

- Events are immutable: never update or delete.
- Releasing a custody releases the drawer; the shift remains open until closed separately.
- Reconciliation records the actual cash difference; nonzero difference is visible to audit trail.
