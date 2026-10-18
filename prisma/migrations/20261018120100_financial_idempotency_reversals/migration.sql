ALTER TABLE "financial_movements" ADD COLUMN "reversal_of_id" BIGINT;
CREATE UNIQUE INDEX "financial_movements_reversal_of_id_key" ON "financial_movements"("reversal_of_id");
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "financial_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "financial_operations" (
  "id" BIGSERIAL NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "actor_id" UUID NOT NULL,
  "operation_type" VARCHAR(40) NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "fingerprint" VARCHAR(128) NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financial_operations_branch_id_actor_id_operation_type_idempotency_key_key" ON "financial_operations"("branch_id", "actor_id", "operation_type", "idempotency_key");
ALTER TABLE "financial_operations" ADD CONSTRAINT "financial_operations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
