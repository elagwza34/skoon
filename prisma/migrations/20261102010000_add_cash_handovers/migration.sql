-- Cash handover table for recipient-confirmed cash transfers between cashiers.
-- All changes are additive: no existing columns are dropped or renamed.

CREATE TABLE "cash_handovers" (
  "id" BIGSERIAL NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "from_shift_id" BIGINT NOT NULL,
  "from_cashier_id" UUID NOT NULL,
  "to_cashier_id" UUID,
  "amount" DECIMAL(10,2) NOT NULL,
  "counted_amount" DECIMAL(10,2),
  "difference" DECIMAL(10,2),
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "notes" VARCHAR(1000),
  "dispute_reason" VARCHAR(1000),
  "resolved_by_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "movement_id" BIGINT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at" TIMESTAMP(3),
  CONSTRAINT "cash_handovers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_handovers_branch_id_status_idx" ON "cash_handovers"("branch_id", "status");
CREATE INDEX "cash_handovers_to_cashier_id_status_idx" ON "cash_handovers"("to_cashier_id", "status");
CREATE INDEX "cash_handovers_from_shift_id_idx" ON "cash_handovers"("from_shift_id");

ALTER TABLE "cash_handovers"
  ADD CONSTRAINT "cash_handovers_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_handovers"
  ADD CONSTRAINT "cash_handovers_from_shift_id_fkey"
  FOREIGN KEY ("from_shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_handovers"
  ADD CONSTRAINT "cash_handovers_from_cashier_id_fkey"
  FOREIGN KEY ("from_cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_handovers"
  ADD CONSTRAINT "cash_handovers_to_cashier_id_fkey"
  FOREIGN KEY ("to_cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_handovers"
  ADD CONSTRAINT "cash_handovers_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_handovers"
  ADD CONSTRAINT "cash_handovers_movement_id_fkey"
  FOREIGN KEY ("movement_id") REFERENCES "financial_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
