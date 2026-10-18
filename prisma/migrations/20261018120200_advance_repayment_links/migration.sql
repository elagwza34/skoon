ALTER TABLE "financial_movements" ADD COLUMN "advance_id" BIGINT;
CREATE INDEX "financial_movements_advance_id_idx" ON "financial_movements"("advance_id");
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "financial_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
