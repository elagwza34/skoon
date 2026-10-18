-- Immutable cash movements keep fixed float, tills, and the main safe separate.
CREATE TABLE "financial_movements" (
  "id" BIGSERIAL NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'posted',
  "amount" DECIMAL(10,2) NOT NULL,
  "source_account" VARCHAR(30) NOT NULL,
  "destination_account" VARCHAR(30) NOT NULL,
  "source_shift_id" BIGINT,
  "destination_user_id" UUID,
  "actor_id" UUID,
  "reason" VARCHAR(255) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_movements_source_shift_id_idx" ON "financial_movements"("source_shift_id");
CREATE INDEX "financial_movements_branch_id_type_occurred_at_idx" ON "financial_movements"("branch_id", "type", "occurred_at");
CREATE INDEX "financial_movements_destination_user_id_consumed_at_idx" ON "financial_movements"("destination_user_id", "consumed_at");
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_source_shift_id_fkey" FOREIGN KEY ("source_shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_destination_user_id_fkey" FOREIGN KEY ("destination_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
