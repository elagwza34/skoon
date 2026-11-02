-- Add payment confirmation metadata and Refund lifecycle table.
-- All changes are additive: no existing columns are dropped or renamed.

-- Payment confirmation fields (electronic payment attestation).
ALTER TABLE "payments" ADD COLUMN "confirmed_by_id" UUID;
ALTER TABLE "payments" ADD COLUMN "confirmed_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "confirmation_note" VARCHAR(500);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_confirmed_by_id_fkey"
  FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Refund lifecycle table.
CREATE TABLE "refunds" (
  "id" BIGSERIAL NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "order_id" BIGINT NOT NULL,
  "payment_id" BIGINT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "method" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  "reason" VARCHAR(500) NOT NULL,
  "requested_by" UUID NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_by" UUID,
  "approved_at" TIMESTAMP(3),
  "executed_by" UUID,
  "executed_at" TIMESTAMP(3),
  "external_reference" VARCHAR(100),
  "evidence_note" VARCHAR(1000),
  "evidence_url" VARCHAR(500),
  "idempotency_key" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refunds_payment_id_idempotency_key_key"
  ON "refunds"("payment_id", "idempotency_key");

CREATE INDEX "refunds_branch_id_status_created_at_idx"
  ON "refunds"("branch_id", "status", "created_at");

CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_executed_by_fkey"
  FOREIGN KEY ("executed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
