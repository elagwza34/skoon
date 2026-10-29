-- Evolve the existing product option tables into reusable, branch-scoped
-- modifier groups while preserving all historical order-item references.
ALTER TABLE "product_options"
  ADD COLUMN "branch_id" BIGINT,
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

UPDATE "product_options" AS option
SET "branch_id" = product."branch_id"
FROM "products" AS product
WHERE option."product_id" = product."id";

ALTER TABLE "product_options"
  ALTER COLUMN "branch_id" SET NOT NULL,
  ALTER COLUMN "product_id" DROP NOT NULL;

ALTER TABLE "product_option_values"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "product_option_assignments" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "product_option_id" BIGINT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_option_assignments_product_id_product_option_id_key" UNIQUE ("product_id", "product_option_id"),
  CONSTRAINT "product_option_assignments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_option_assignments_product_option_id_fkey" FOREIGN KEY ("product_option_id") REFERENCES "product_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "product_option_assignments" ("product_id", "product_option_id", "sort_order", "updated_at")
SELECT "product_id", "id", "sort_order", CURRENT_TIMESTAMP
FROM "product_options"
WHERE "product_id" IS NOT NULL
ON CONFLICT ("product_id", "product_option_id") DO NOTHING;

CREATE INDEX "product_options_branch_id_is_active_sort_order_idx" ON "product_options"("branch_id", "is_active", "sort_order");
CREATE INDEX "product_option_assignments_product_option_id_idx" ON "product_option_assignments"("product_option_id");
CREATE INDEX "product_option_assignments_product_id_sort_order_idx" ON "product_option_assignments"("product_id", "sort_order");

ALTER TABLE "product_options"
  ADD CONSTRAINT "product_options_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_options" DROP CONSTRAINT "product_options_product_id_fkey";
ALTER TABLE "product_options"
  ADD CONSTRAINT "product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
