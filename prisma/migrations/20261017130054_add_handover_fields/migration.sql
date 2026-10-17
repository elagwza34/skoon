-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "handover_completed_at" TIMESTAMP(3),
ADD COLUMN     "handover_notes" VARCHAR(1000),
ADD COLUMN     "handover_to" VARCHAR(100);
