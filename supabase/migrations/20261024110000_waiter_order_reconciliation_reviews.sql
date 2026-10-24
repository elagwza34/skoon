-- LOCAL ONLY — requires explicit approval before execution.
-- Additive review/audit foundation for legacy waiter responsibility. This
-- migration records review metadata only; it never backfills or assigns orders.

CREATE TABLE "waiter_order_reconciliation_reviews" (
  "id" BIGSERIAL PRIMARY KEY,
  "order_id" BIGINT NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "approver_id" UUID,
  "proposed_waiter_id" UUID,
  "decision" VARCHAR(40),
  "reason" TEXT,
  "review_status" VARCHAR(30) NOT NULL DEFAULT 'pending_review',
  "previous_state" JSONB NOT NULL,
  "approved_at" TIMESTAMP(3),
  "execution_status" VARCHAR(30) NOT NULL DEFAULT 'not_executed',
  "executed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waiter_reconciliation_reviews_decision_valid"
    CHECK ("decision" IS NULL OR "decision" IN ('assign_waiter', 'keep_unassigned', 'review_later', 'resolve_through_existing_workflow')),
  CONSTRAINT "waiter_reconciliation_reviews_status_valid"
    CHECK ("review_status" IN ('pending_review', 'proposed', 'approved', 'rejected', 'needs_more_info')),
  CONSTRAINT "waiter_reconciliation_reviews_execution_valid"
    CHECK ("execution_status" IN ('not_executed', 'executing', 'executed', 'superseded', 'failed')),
  CONSTRAINT "waiter_reconciliation_reviews_proposal_valid"
    CHECK (("review_status" = 'pending_review' AND "decision" IS NULL)
      OR ("review_status" <> 'pending_review' AND "decision" IS NOT NULL AND length(btrim("reason")) >= 3)),
  CONSTRAINT "waiter_reconciliation_reviews_waiter_valid"
    CHECK (("decision" = 'assign_waiter' AND "proposed_waiter_id" IS NOT NULL)
      OR ("decision" IS DISTINCT FROM 'assign_waiter' AND "proposed_waiter_id" IS NULL)),
  CONSTRAINT "waiter_reconciliation_reviews_execution_timestamp_valid"
    CHECK ("execution_status" <> 'executed' OR "executed_at" IS NOT NULL),
  CONSTRAINT "waiter_reconciliation_reviews_order_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_reconciliation_reviews_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_reconciliation_reviews_reviewer_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_reconciliation_reviews_approver_fkey"
    FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "waiter_reconciliation_reviews_waiter_fkey"
    FOREIGN KEY ("proposed_waiter_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "waiter_reconciliation_reviews_branch_status_created_idx"
  ON "waiter_order_reconciliation_reviews" ("branch_id", "review_status", "created_at");
CREATE INDEX "waiter_reconciliation_reviews_order_created_idx"
  ON "waiter_order_reconciliation_reviews" ("order_id", "created_at");
CREATE INDEX "waiter_reconciliation_reviews_waiter_status_idx"
  ON "waiter_order_reconciliation_reviews" ("proposed_waiter_id", "review_status");
-- An order cannot have two independently actionable reviews. Rejected reviews
-- are retained as immutable history and permit a subsequent fresh proposal.
CREATE UNIQUE INDEX "waiter_reconciliation_reviews_one_active_order_idx"
  ON "waiter_order_reconciliation_reviews" ("order_id")
  WHERE "review_status" IN ('pending_review', 'proposed', 'approved', 'needs_more_info')
    AND "execution_status" IN ('not_executed', 'executing');

CREATE TABLE "waiter_order_reconciliation_audit" (
  "id" BIGSERIAL PRIMARY KEY,
  "review_id" BIGINT NOT NULL,
  "order_id" BIGINT NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "actor_id" UUID NOT NULL,
  "event_type" VARCHAR(40) NOT NULL,
  "decision" VARCHAR(40),
  "reason" TEXT,
  "previous_state" JSONB NOT NULL,
  "review_status" VARCHAR(30) NOT NULL,
  "execution_status" VARCHAR(30) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waiter_reconciliation_audit_event_valid"
    CHECK ("event_type" IN ('proposed', 'approved', 'rejected', 'needs_more_info', 'execution_started', 'executed', 'execution_failed', 'superseded')),
  CONSTRAINT "waiter_reconciliation_audit_decision_valid"
    CHECK ("decision" IS NULL OR "decision" IN ('assign_waiter', 'keep_unassigned', 'review_later', 'resolve_through_existing_workflow')),
  CONSTRAINT "waiter_reconciliation_audit_status_valid"
    CHECK ("review_status" IN ('pending_review', 'proposed', 'approved', 'rejected', 'needs_more_info')),
  CONSTRAINT "waiter_reconciliation_audit_execution_valid"
    CHECK ("execution_status" IN ('not_executed', 'executing', 'executed', 'superseded', 'failed')),
  CONSTRAINT "waiter_reconciliation_audit_review_fkey"
    FOREIGN KEY ("review_id") REFERENCES "waiter_order_reconciliation_reviews"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_reconciliation_audit_order_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_reconciliation_audit_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_reconciliation_audit_actor_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "waiter_reconciliation_audit_review_created_idx"
  ON "waiter_order_reconciliation_audit" ("review_id", "created_at");
CREATE INDEX "waiter_reconciliation_audit_order_created_idx"
  ON "waiter_order_reconciliation_audit" ("order_id", "created_at");
CREATE INDEX "waiter_reconciliation_audit_branch_created_idx"
  ON "waiter_order_reconciliation_audit" ("branch_id", "created_at");

-- Trusted server handlers access these records through Prisma. They are not
-- exposed through the Data API to anon or authenticated browser roles.
ALTER TABLE "waiter_order_reconciliation_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "waiter_order_reconciliation_audit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "waiter_order_reconciliation_reviews", "waiter_order_reconciliation_audit" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "waiter_order_reconciliation_reviews_id_seq", "waiter_order_reconciliation_audit_id_seq" FROM PUBLIC, anon, authenticated;
