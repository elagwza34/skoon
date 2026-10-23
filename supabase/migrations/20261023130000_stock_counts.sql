-- Additive source migration only. Do not apply without reviewed Supabase deployment.
CREATE TABLE "stock_counts" (
  "id" BIGSERIAL PRIMARY KEY, "branch_id" BIGINT NOT NULL, "responsible_id" UUID NOT NULL,
  "type" VARCHAR(20) NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "submitted_at" TIMESTAMP(3),
  "posted_at" TIMESTAMP(3), "posted_by" UUID, "cancelled_at" TIMESTAMP(3),
  "cancel_reason" VARCHAR(255), "idempotency_key" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_counts_type_valid" CHECK ("type" IN ('weekly','monthly','ad_hoc')),
  CONSTRAINT "stock_counts_status_valid" CHECK ("status" IN ('draft','counting','submitted','posted','cancelled')),
  CONSTRAINT "stock_counts_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_counts_responsible_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_counts_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE TABLE "stock_count_lines" (
  "id" BIGSERIAL PRIMARY KEY, "stock_count_id" BIGINT NOT NULL, "inventory_item_id" BIGINT NOT NULL, "inventory_batch_id" BIGINT,
  "expected_quantity" DECIMAL(12,3) NOT NULL, "counted_quantity" DECIMAL(12,3), "variance_quantity" DECIMAL(12,3),
  "fifo_cost_total" DECIMAL(12,2), "valuation_metadata" JSONB, "posted_transaction_id" BIGINT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_count_lines_expected_nonnegative" CHECK ("expected_quantity" >= 0),
  CONSTRAINT "stock_count_lines_counted_nonnegative" CHECK ("counted_quantity" IS NULL OR "counted_quantity" >= 0),
  CONSTRAINT "stock_count_lines_count_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE,
  CONSTRAINT "stock_count_lines_item_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_count_lines_batch_fkey" FOREIGN KEY ("inventory_batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_count_lines_transaction_fkey" FOREIGN KEY ("posted_transaction_id") REFERENCES "inventory_transactions"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "stock_counts_branch_idempotency_key_unique" ON "stock_counts"("branch_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX "stock_count_lines_scope_unique" ON "stock_count_lines"("stock_count_id", "inventory_item_id", COALESCE("inventory_batch_id", 0));
CREATE INDEX "stock_counts_branch_status_created_idx" ON "stock_counts"("branch_id", "status", "created_at");
CREATE INDEX "stock_counts_responsible_status_idx" ON "stock_counts"("responsible_id", "status");
CREATE INDEX "stock_count_lines_item_idx" ON "stock_count_lines"("inventory_item_id");
CREATE INDEX "stock_count_lines_batch_idx" ON "stock_count_lines"("inventory_batch_id");
ALTER TABLE "stock_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_count_lines" ENABLE ROW LEVEL SECURITY;
