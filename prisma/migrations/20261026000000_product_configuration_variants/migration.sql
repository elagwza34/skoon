-- PROPOSED ONLY: not executed by this change.
-- Review on an isolated PostgreSQL/Supabase-compatible database before any
-- deployment. This migration is additive and does not backfill or delete data.

CREATE TABLE "product_attributes" (
  "id" BIGSERIAL PRIMARY KEY, "branch_id" BIGINT NOT NULL,
  "name" VARCHAR(100) NOT NULL, "description" VARCHAR(500),
  "sort_order" INTEGER NOT NULL DEFAULT 0, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "archived_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_attributes_branch_name_key" UNIQUE ("branch_id", "name"),
  CONSTRAINT "product_attributes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "product_attribute_values" (
  "id" BIGSERIAL PRIMARY KEY, "attribute_id" BIGINT NOT NULL,
  "label" VARCHAR(100) NOT NULL, "numerator" DECIMAL(30,0), "denominator" DECIMAL(30,0),
  "sort_order" INTEGER NOT NULL DEFAULT 0, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "archived_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_attribute_values_attribute_label_key" UNIQUE ("attribute_id", "label"),
  CONSTRAINT "product_attribute_values_exact_quantity_check" CHECK (("numerator" IS NULL AND "denominator" IS NULL) OR ("numerator" > 0 AND "denominator" > 0)),
  CONSTRAINT "product_attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "product_attributes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "measurement_units" (
  "id" BIGSERIAL PRIMARY KEY, "branch_id" BIGINT NOT NULL,
  "name" VARCHAR(100) NOT NULL, "symbol" VARCHAR(20) NOT NULL, "dimension" VARCHAR(30) NOT NULL,
  "base_unit_id" BIGINT, "conversion_numerator" DECIMAL(30,0), "conversion_denominator" DECIMAL(30,0),
  "is_active" BOOLEAN NOT NULL DEFAULT true, "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "measurement_units_branch_name_key" UNIQUE ("branch_id", "name"),
  CONSTRAINT "measurement_units_branch_symbol_key" UNIQUE ("branch_id", "symbol"),
  CONSTRAINT "measurement_units_conversion_check" CHECK (("base_unit_id" IS NULL AND "conversion_numerator" IS NULL AND "conversion_denominator" IS NULL) OR ("base_unit_id" IS NOT NULL AND "conversion_numerator" > 0 AND "conversion_denominator" > 0)),
  CONSTRAINT "measurement_units_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "measurement_units_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "measurement_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "product_attribute_assignments" (
  "id" BIGSERIAL PRIMARY KEY, "product_id" BIGINT NOT NULL, "attribute_id" BIGINT NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT false, "min_selections" SMALLINT NOT NULL DEFAULT 0,
  "max_selections" SMALLINT NOT NULL DEFAULT 1, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_attribute_assignments_product_attribute_key" UNIQUE ("product_id", "attribute_id"),
  CONSTRAINT "product_attribute_assignments_bounds_check" CHECK ("min_selections" >= 0 AND "max_selections" >= "min_selections"),
  CONSTRAINT "product_attribute_assignments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_attribute_assignments_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "product_attributes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "product_attribute_assignment_values" (
  "assignment_id" BIGINT NOT NULL, "value_id" BIGINT NOT NULL,
  PRIMARY KEY ("assignment_id", "value_id"),
  CONSTRAINT "product_attribute_assignment_values_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "product_attribute_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_attribute_assignment_values_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "product_attribute_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "product_variants" (
  "id" BIGSERIAL PRIMARY KEY, "product_id" BIGINT NOT NULL, "measurement_unit_id" BIGINT,
  "combination_key" VARCHAR(500) NOT NULL, "sku" VARCHAR(100), "price" DECIMAL(10,2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "is_available" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0, "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_variants_product_combination_key" UNIQUE ("product_id", "combination_key"),
  CONSTRAINT "product_variants_product_sku_key" UNIQUE ("product_id", "sku"),
  CONSTRAINT "product_variants_price_positive" CHECK ("price" >= 0),
  CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_variants_measurement_unit_id_fkey" FOREIGN KEY ("measurement_unit_id") REFERENCES "measurement_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "product_variant_values" (
  "variant_id" BIGINT NOT NULL, "value_id" BIGINT NOT NULL, PRIMARY KEY ("variant_id", "value_id"),
  CONSTRAINT "product_variant_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_variant_values_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "product_attribute_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "variant_inventory_mappings" (
  "id" BIGSERIAL PRIMARY KEY, "variant_id" BIGINT NOT NULL, "inventory_item_id" BIGINT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "variant_inventory_mappings_variant_item_key" UNIQUE ("variant_id", "inventory_item_id"),
  CONSTRAINT "variant_inventory_mappings_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "variant_inventory_mappings_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "variant_inventory_mappings_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "products" ADD COLUMN "measurement_unit_id" BIGINT;
ALTER TABLE "inventory_items" ADD COLUMN "measurement_unit_id" BIGINT;
ALTER TABLE "order_items" ADD COLUMN "product_variant_id" BIGINT;
ALTER TABLE "order_items" ADD COLUMN "product_variant_snapshot" JSONB;

ALTER TABLE "products" ADD CONSTRAINT "products_measurement_unit_id_fkey" FOREIGN KEY ("measurement_unit_id") REFERENCES "measurement_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_measurement_unit_id_fkey" FOREIGN KEY ("measurement_unit_id") REFERENCES "measurement_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "product_attributes_branch_id_is_active_sort_order_idx" ON "product_attributes"("branch_id", "is_active", "sort_order");
CREATE INDEX "product_attribute_values_attribute_id_is_active_sort_order_idx" ON "product_attribute_values"("attribute_id", "is_active", "sort_order");
CREATE INDEX "measurement_units_branch_id_dimension_is_active_idx" ON "measurement_units"("branch_id", "dimension", "is_active");
CREATE INDEX "product_attribute_assignments_attribute_id_idx" ON "product_attribute_assignments"("attribute_id");
CREATE INDEX "product_attribute_assignment_values_value_id_idx" ON "product_attribute_assignment_values"("value_id");
CREATE INDEX "product_variants_product_id_is_active_is_available_idx" ON "product_variants"("product_id", "is_active", "is_available");
CREATE INDEX "product_variant_values_value_id_idx" ON "product_variant_values"("value_id");
CREATE INDEX "variant_inventory_mappings_inventory_item_id_idx" ON "variant_inventory_mappings"("inventory_item_id");
CREATE INDEX "products_measurement_unit_id_idx" ON "products"("measurement_unit_id");
CREATE INDEX "inventory_items_measurement_unit_id_idx" ON "inventory_items"("measurement_unit_id");
CREATE INDEX "order_items_product_variant_id_idx" ON "order_items"("product_variant_id");

-- These public-schema tables must have reviewed RLS policies before any direct
-- Data API exposure. The server application currently uses a trusted backend.
ALTER TABLE "product_attributes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_attribute_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "measurement_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_attribute_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_attribute_assignment_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variant_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "variant_inventory_mappings" ENABLE ROW LEVEL SECURITY;
