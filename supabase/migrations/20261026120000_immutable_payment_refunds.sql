-- Additive only. Do not apply until production recovery and migration-history
-- reconciliation are approved. Existing Payment rows remain immutable.
CREATE TABLE "payment_refunds" (
  "id" BIGSERIAL PRIMARY KEY,
  "branch_id" BIGINT NOT NULL,
  "order_id" BIGINT NOT NULL,
  "original_payment_id" BIGINT NOT NULL,
  "source_shift_id" BIGINT,
  "actor_id" UUID NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "refund_method" VARCHAR(20) NOT NULL,
  "funding_source" VARCHAR(20) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'requested',
  "reason" VARCHAR(255) NOT NULL,
  "external_reference" VARCHAR(100),
  "idempotency_key" VARCHAR(100) NOT NULL,
  "metadata" JSONB,
  "recorded_at" TIMESTAMP(3),
  "externally_confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_refunds_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "payment_refunds_status_valid" CHECK ("status" IN ('requested','recorded','externally_confirmed','failed','reversed')),
  CONSTRAINT "payment_refunds_funding_source_valid" CHECK ("funding_source" IN ('cashier_till','main_safe','external')),
  CONSTRAINT "payment_refunds_till_requires_shift" CHECK ("funding_source" <> 'cashier_till' OR "source_shift_id" IS NOT NULL),
  CONSTRAINT "payment_refunds_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_refunds_original_payment_id_fkey" FOREIGN KEY ("original_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_refunds_source_shift_id_fkey" FOREIGN KEY ("source_shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_refunds_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- PostgreSQL requires a matching unique key for a composite foreign key. These
-- redundant-with-PK keys make branch/order ownership enforceable by the DB,
-- rather than trusting only the refund writer's authorization checks.
CREATE UNIQUE INDEX "orders_id_branch_id_unique" ON "orders" ("id", "branch_id");
CREATE UNIQUE INDEX "payments_id_order_branch_unique" ON "payments" ("id", "order_id", "branch_id");
CREATE UNIQUE INDEX "shifts_id_branch_id_unique" ON "shifts" ("id", "branch_id");
ALTER TABLE "payment_refunds"
  DROP CONSTRAINT "payment_refunds_branch_id_fkey",
  DROP CONSTRAINT "payment_refunds_order_id_fkey",
  DROP CONSTRAINT "payment_refunds_original_payment_id_fkey",
  DROP CONSTRAINT "payment_refunds_source_shift_id_fkey",
  ADD CONSTRAINT "payment_refunds_order_branch_fkey"
    FOREIGN KEY ("order_id", "branch_id") REFERENCES "orders"("id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_refunds_original_payment_order_branch_fkey"
    FOREIGN KEY ("original_payment_id", "order_id", "branch_id") REFERENCES "payments"("id", "order_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_refunds_source_shift_branch_fkey"
    FOREIGN KEY ("source_shift_id", "branch_id") REFERENCES "shifts"("id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "payment_refunds_branch_actor_idempotency_key_unique" ON "payment_refunds" ("branch_id", "actor_id", "idempotency_key");
CREATE INDEX "payment_refunds_original_payment_status_idx" ON "payment_refunds" ("original_payment_id", "status");
CREATE INDEX "payment_refunds_branch_created_idx" ON "payment_refunds" ("branch_id", "created_at");
CREATE INDEX "payment_refunds_source_shift_status_idx" ON "payment_refunds" ("source_shift_id", "status");
ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "payment_refunds" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "payment_refunds_id_seq" FROM PUBLIC, anon, authenticated;
