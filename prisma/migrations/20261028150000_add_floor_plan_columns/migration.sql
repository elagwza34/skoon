-- Migration: add-floor-plan-columns-to-cafe-tables
-- Date: 2026-10-28
-- Description: Add floor plan columns to cafe_tables (additive)
-- Safety: No data changes, additive only, no destructive operations.

-- Add floor plan columns to cafe_tables
ALTER TABLE "cafe_tables"
  ADD COLUMN "floor_plan_zone" VARCHAR(80),
  ADD COLUMN "floor_plan_x" DECIMAL(7,2),
  ADD COLUMN "floor_plan_y" DECIMAL(7,2),
  ADD COLUMN "floor_plan_rotation" SMALLINT NOT NULL DEFAULT 0;
