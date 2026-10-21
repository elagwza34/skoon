-- Add purchase_cost, unit, tax_rate to products table
ALTER TABLE "products" ADD COLUMN "purchase_cost" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "unit" VARCHAR(20) NOT NULL DEFAULT 'pcs';
ALTER TABLE "products" ADD COLUMN "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Add salary to users table
ALTER TABLE "users" ADD COLUMN "salary" DECIMAL(10,2) NOT NULL DEFAULT 0;