-- Shift Management System (MVP P0)
-- One open till session per branch + optional shiftId linkage on orders/payments.

-- CreateTable
CREATE TABLE "shifts" (
    "id" BIGSERIAL NOT NULL,
    "branch_id" BIGINT NOT NULL,
    "open_by" TEXT NOT NULL,
    "cashier_id" UUID,
    "opening_cash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expected_cash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closing_cash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cash_difference" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "shift_id" BIGINT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "shift_id" BIGINT;

-- CreateIndex
CREATE INDEX "shifts_branch_id_status_idx" ON "shifts"("branch_id", "status");

-- CreateIndex
CREATE INDEX "shifts_cashier_id_idx" ON "shifts"("cashier_id");

-- CreateIndex
CREATE INDEX "orders_shift_id_idx" ON "orders"("shift_id");

-- CreateIndex
CREATE INDEX "payments_shift_id_idx" ON "payments"("shift_id");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
