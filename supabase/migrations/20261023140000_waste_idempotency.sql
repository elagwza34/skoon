-- Additive only. Do not apply without reviewed Supabase deployment.
CREATE TABLE "waste_operations" (
  "id" BIGSERIAL PRIMARY KEY,
  "branch_id" BIGINT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "operation_type" VARCHAR(40) NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "fingerprint" VARCHAR(128) NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waste_operations_branch_actor_type_key" UNIQUE ("branch_id", "actor_id", "operation_type", "idempotency_key")
);
CREATE INDEX "waste_operations_branch_created_idx" ON "waste_operations"("branch_id", "created_at");
ALTER TABLE "waste_operations" ENABLE ROW LEVEL SECURITY;
