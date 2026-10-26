# Cash Custody — Migration Compatibility & Rollback

**Status:** Draft for review. NOT executed.

---

## 1. Compatibility

### 1.1 Additive Only

| Object added | Impact on existing data |
|--------------|------------------------|
| `cash_drawers` | None — new table |
| `cash_custody_assignments` | None — new table |
| `cash_custody_events` | None — new table |
| New indexes | None — does not affect existing indexes |
| New RLS policies | None — no existing rows affected |

### 1.2 Zero-Risk to Existing Money Flows

- No existing `Payment`, `FinancialMovement`, `FinancialOperation`, `Shift`, or `Order` row is modified.
- The migration is **additive** only.
- No existing `financial_movements` or `audit_logs` records are touched.

---

## 2. Migration Compatibility Plan

| Step | Action | Notes |
|------|--------|-------|
| 1 | Create `cash_drawers`, `cash_custody_assignments`, `cash_custody_events` | Additive only |
| 2 | Add indexes (`branch_id`, `is_active`, `shift_id`, `status`, unique index, etc.) | All additive |
| 3 | Apply RLS policies (review-only for now) | Notify database admin |
| 4 | Validate schema with `prisma validate` | Ensure new models match Prisma |
| 5 | Integration test on isolated PostgreSQL | Verify partial unique index |
| 6 | Production deployment | With rollback plan ready |

---

## 3. Rollback & Forward-Recovery Strategy

### 3.1 Rollback (No Downtime Required)

Because the migration is additive only:

1. The new tables remain but any new features are disabled until the next phase.
2. Existing money flows are unaffected.
3. To completely remove the new functionality, the new tables and indexes can be dropped later (data remains intact, but no new audit records are written).

### 3.2 Forward Recovery

- New `CashCustodyEvent` records are append-only and retained for the retention period.
- If a process fails after migration, the affected transaction can be retried idempotently (using `FinancialOperation` pattern).
- If a shift is closed without a reconciliation, a separate follow-up step can be opened to reconcile and record the difference.

---

## 4. Backward Compatibility

- Applications written against the current schema **continue to work** unchanged.
- New tables are additive; no existing table is dropped or altered.
- Response contracts for existing endpoints are unchanged.

---

## 5. Forward Recovery

- If the deployment fails, use the standard deployment rollback procedure.
- No data loss: all historical financial records remain intact.
- The only state change is the addition of new tables (which can be ignored or dropped).

---

## 6. Rollback Procedure (Detailed)

1. Identify the deployment version to roll back to.
2. Run the reverse SQL script (drop new tables and functions) — if needed.
3. Switch traffic back to the previous deployment.
4. Verify that existing money flows continue to work.
5. Investigate the root cause; do not re-deploy until fixed.

---

## 7. Caveats

- This migration draft is **not executed**. It must be validated in a staging environment first.
- The partial unique index `cash_custody_assignments_custodian_active_idx` must be verified for PostgreSQL compatibility (available since v11+).

---
