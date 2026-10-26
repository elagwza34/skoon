# Cash Custody — Rollback & Forward Recovery Strategy

**Status:** Draft for review. NOT executed.

---

## 1. Rollback Strategy

Because the migration is **additive only**, rollback is safe and fast:

1. **Disable the new endpoints** (e.g., via feature flag) so no new cash custody commands are issued.
2. The new tables remain in the database; no existing data is deleted.
3. If a full rollback is required, drop the new tables and indexes — but this is **not recommended** as data is kept.

### When Rollback Is Not Needed

- If no new cash custody operations occurred, the system operates exactly as before.
- No financial historical records are touched.

---

## 2. Forward Recovery

- New `CashCustodyEvent` records are append-only and retained for the retention period.
- If a process fails after migration, the affected transaction may be retried idempotently (using the `FinancialOperation` pattern).
- If a shift is closed without reconciliation, a follow-up step can be opened to reconcile and record the difference.

---

## 3. Rollback Procedure

1. Identify the last known working deployment version.
2. Drop the new tables and indexes (if required).
3. Switch traffic back to the previous deployment.
4. Verify existing money flows continue to work.
5. Investigate root cause; do not redeploy until fixed.

---

## 4. Forward-Recovery Plan

- If a shift closes without reconciliation, a separate follow-up step can open to reconcile and record the difference.
- If `cashDifference` is nonzero, it is recorded and reported — not erased.

---
