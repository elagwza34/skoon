-- HR scheduling/attendance foundation. LOCAL ONLY: requires explicit approval.
CREATE TABLE "work_schedules" (
  "id" BIGSERIAL PRIMARY KEY, "employee_id" UUID NOT NULL, "branch_id" BIGINT NOT NULL,
  "effective_from" DATE NOT NULL, "effective_until" DATE, "timezone" VARCHAR(50) NOT NULL DEFAULT 'Africa/Cairo',
  "grace_minutes" INTEGER NOT NULL DEFAULT 0, "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_schedules_dates_valid" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from"),
  CONSTRAINT "work_schedules_grace_valid" CHECK ("grace_minutes" >= 0),
  CONSTRAINT "work_schedules_status_valid" CHECK ("status" IN ('active','superseded','cancelled')),
  FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE TABLE "work_schedule_days" (
  "id" BIGSERIAL PRIMARY KEY, "schedule_id" BIGINT NOT NULL, "weekday" SMALLINT NOT NULL,
  "rest_day" BOOLEAN NOT NULL DEFAULT false, "starts_at" VARCHAR(5), "ends_at" VARCHAR(5),
  CONSTRAINT "work_schedule_days_weekday_valid" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "work_schedule_days_shape_valid" CHECK (("rest_day" AND "starts_at" IS NULL AND "ends_at" IS NULL) OR (NOT "rest_day" AND "starts_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "ends_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
  UNIQUE ("schedule_id", "weekday"), FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE CASCADE
);
CREATE TABLE "attendance_corrections" (
  "id" BIGSERIAL PRIMARY KEY, "branch_id" BIGINT NOT NULL, "employee_id" UUID NOT NULL, "shift_id" BIGINT,
  "proposed_by" UUID NOT NULL, "approved_by" UUID, "status" VARCHAR(20) NOT NULL DEFAULT 'pending', "reason" VARCHAR(500) NOT NULL,
  "proposed_opened_at" TIMESTAMP(3), "proposed_closed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decided_at" TIMESTAMP(3),
  CONSTRAINT "attendance_corrections_status_valid" CHECK ("status" IN ('pending','recommended','approved','rejected','cancelled')),
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT, FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT, FOREIGN KEY ("proposed_by") REFERENCES "users"("id") ON DELETE RESTRICT, FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "work_schedules_employee_effective_idx" ON "work_schedules" ("employee_id","effective_from");
CREATE INDEX "work_schedules_branch_status_idx" ON "work_schedules" ("branch_id","status");
CREATE INDEX "attendance_corrections_employee_status_idx" ON "attendance_corrections" ("employee_id","status","created_at");
CREATE INDEX "attendance_corrections_branch_status_idx" ON "attendance_corrections" ("branch_id","status");
ALTER TABLE "work_schedules" ENABLE ROW LEVEL SECURITY; ALTER TABLE "work_schedule_days" ENABLE ROW LEVEL SECURITY; ALTER TABLE "attendance_corrections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "work_schedules", "work_schedule_days", "attendance_corrections" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "work_schedules_id_seq", "work_schedule_days_id_seq", "attendance_corrections_id_seq" FROM PUBLIC, anon, authenticated;
