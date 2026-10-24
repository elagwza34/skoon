-- Deployment preflight (run manually and resolve rows through the approved
-- operational process; this migration never deletes or alters historical data):
-- SELECT branch_id, cashier_id, COUNT(*) AS open_shift_count
-- FROM shifts
-- WHERE status = 'open' AND cashier_id IS NOT NULL
-- GROUP BY branch_id, cashier_id
-- HAVING COUNT(*) > 1;
--
-- The application already serializes opens with a transaction-scoped advisory
-- lock. This durable partial unique index protects the same invariant from any
-- future writer. NULL cashier_id rows are deliberately excluded: the invariant
-- is per employee, and legacy unassigned shifts require separate review.
CREATE UNIQUE INDEX "shifts_one_open_per_employee_branch_idx"
  ON "shifts" ("branch_id", "cashier_id")
  WHERE "status" = 'open' AND "cashier_id" IS NOT NULL;
