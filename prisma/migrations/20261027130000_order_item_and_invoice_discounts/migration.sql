-- LOCAL PROPOSAL ONLY. Forward-only additive discount metadata; never
-- recalculates or changes historical invoice/payment totals.
ALTER TABLE "orders"
  ADD COLUMN "item_discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_eligible_base" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "order_items"
  ADD COLUMN "discount_type" VARCHAR(20),
  ADD COLUMN "discount_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "eligible_for_invoice_discount" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_detail_amounts_valid" CHECK ("item_discount_amount" >= 0 AND "discount_eligible_base" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_discount_valid" CHECK (("discount_type" IS NULL OR "discount_type" IN ('percentage','amount')) AND "discount_value" >= 0 AND "discount_amount" >= 0);
