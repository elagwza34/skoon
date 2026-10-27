-- Forward-only reconciliation for the HR entities declared in prisma/schema.prisma
-- but not present in the verified deployed catalog.  This migration intentionally
-- creates only new tables and supporting indexes; it never changes existing
-- employee, contract, compensation, deduction, shift, order, or ledger data.
-- Apply during a controlled window. Fail rather than waiting behind a long lock.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE TABLE "work_schedules" (
  "id" BIGSERIAL PRIMARY KEY,
  "employee_id" UUID NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "timezone" VARCHAR(50) NOT NULL DEFAULT 'Africa/Cairo',
  "grace_minutes" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_schedules_effective_period_valid"
    CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from"),
  CONSTRAINT "work_schedules_grace_minutes_valid"
    CHECK ("grace_minutes" BETWEEN 0 AND 240),
  CONSTRAINT "work_schedules_employee_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "work_schedules_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "work_schedules_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "work_schedule_days" (
  "id" BIGSERIAL PRIMARY KEY,
  "schedule_id" BIGINT NOT NULL,
  "weekday" SMALLINT NOT NULL,
  "rest_day" BOOLEAN NOT NULL DEFAULT false,
  "starts_at" VARCHAR(5),
  "ends_at" VARCHAR(5),
  CONSTRAINT "work_schedule_days_weekday_valid" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "work_schedule_days_time_pair_valid" CHECK (
    ("rest_day" AND "starts_at" IS NULL AND "ends_at" IS NULL)
    OR (NOT "rest_day" AND "starts_at" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND "ends_at" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
  ),
  CONSTRAINT "work_schedule_days_schedule_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE CASCADE,
  CONSTRAINT "work_schedule_days_schedule_weekday_key" UNIQUE ("schedule_id", "weekday")
);

CREATE TABLE "attendance_corrections" (
  "id" BIGSERIAL PRIMARY KEY,
  "branch_id" BIGINT NOT NULL,
  "employee_id" UUID NOT NULL,
  "shift_id" BIGINT,
  "proposed_by" UUID NOT NULL,
  "approved_by" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "reason" VARCHAR(500) NOT NULL,
  "proposed_opened_at" TIMESTAMP(3),
  "proposed_closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3),
  CONSTRAINT "attendance_corrections_status_valid"
    CHECK ("status" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "attendance_corrections_proposed_interval_valid"
    CHECK ("proposed_opened_at" IS NULL OR "proposed_closed_at" IS NULL OR "proposed_closed_at" > "proposed_opened_at"),
  CONSTRAINT "attendance_corrections_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_corrections_employee_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_corrections_shift_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_corrections_proposed_by_fkey"
    FOREIGN KEY ("proposed_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_corrections_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "leave_requests" (
  "id" BIGSERIAL PRIMARY KEY,
  "branch_id" BIGINT NOT NULL,
  "employee_id" UUID NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "starts_on" DATE NOT NULL,
  "ends_on" DATE NOT NULL,
  "days" DECIMAL(6,2) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "reviewer_id" UUID,
  "decision_note" VARCHAR(500),
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_requests_status_valid"
    CHECK ("status" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "leave_requests_date_range_valid" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "leave_requests_days_positive" CHECK ("days" > 0),
  CONSTRAINT "leave_requests_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "leave_requests_employee_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "leave_requests_reviewer_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "official_holidays" (
  "id" BIGSERIAL PRIMARY KEY,
  "branch_id" BIGINT,
  "name" VARCHAR(150) NOT NULL,
  "starts_on" DATE NOT NULL,
  "ends_on" DATE NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "official_holidays_date_range_valid" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "official_holidays_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "official_holidays_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX "work_schedules_employee_effective_from_idx" ON "work_schedules" ("employee_id", "effective_from");
CREATE INDEX "work_schedules_branch_status_idx" ON "work_schedules" ("branch_id", "status");
CREATE INDEX "attendance_corrections_employee_status_created_at_idx" ON "attendance_corrections" ("employee_id", "status", "created_at");
CREATE INDEX "attendance_corrections_branch_status_idx" ON "attendance_corrections" ("branch_id", "status");
CREATE INDEX "attendance_corrections_shift_id_idx" ON "attendance_corrections" ("shift_id");
CREATE INDEX "leave_requests_employee_status_starts_on_idx" ON "leave_requests" ("employee_id", "status", "starts_on");
CREATE INDEX "leave_requests_branch_status_starts_on_idx" ON "leave_requests" ("branch_id", "status", "starts_on");
CREATE INDEX "official_holidays_branch_starts_on_idx" ON "official_holidays" ("branch_id", "starts_on");

ALTER TABLE "work_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_schedule_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "official_holidays" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "work_schedules", "work_schedule_days", "attendance_corrections", "leave_requests", "official_holidays"
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "work_schedules_id_seq", "work_schedule_days_id_seq", "attendance_corrections_id_seq", "leave_requests_id_seq", "official_holidays_id_seq"
  FROM PUBLIC, anon, authenticated;

RESET statement_timeout;
RESET lock_timeout;
