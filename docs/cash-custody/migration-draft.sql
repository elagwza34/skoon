-- Cash Custody — Additive PostgreSQL Migration Draft
-- Status: Draft for review. NOT executed.
-- Purpose: Add cash custody capability to the existing schema.

BEGIN;

-- 1. CashDrawers
CREATE TABLE cash_drawers (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL,
    name VARCHAR(60) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cash_drawers_branch_id_fkey
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX cash_drawers_branch_idx ON cash_drawers(branch_id);
CREATE INDEX cash_drawers_is_active_idx ON cash_drawers(is_active);

-- 2. CashCustodyAssignment
CREATE TABLE cash_custody_assignments (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL,
    cashier_id UUID NOT NULL,
    shift_id BIGINT NOT NULL,
    drawer_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    assigned_by_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cash_custody_assignments_branch_id_fkey
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT cash_custody_assignments_cashier_id_fkey
        FOREIGN KEY (cashier_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT cash_custody_assignments_shift_id_fkey
        FOREIGN KEY (shift_id) REFERENCES shifts(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT cash_custody_assignments_drawer_id_fkey
        FOREIGN KEY (drawer_id) REFERENCES cash_drawers(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX cash_custody_assignments_shift_id_idx ON cash_custody_assignments(shift_id);
CREATE INDEX cash_custody_assignments_status_idx ON cash_custody_assignments(status);
CREATE UNIQUE INDEX cash_custody_assignments_custodian_unique
    ON cash_custody_assignments(branch_id, cashier_id, shift_id);

-- One active custodian per drawer — partial unique index
CREATE UNIQUE INDEX cash_custody_assignments_custodian_active_idx
    ON cash_custody_assignments(branch_id, cash_drawer_id)
    WHERE status = 'active';

-- 3. CashCustodyEvent
CREATE TABLE cash_custody_events (
    id BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    type VARCHAR(40) NOT NULL,
    detail VARCHAR(255),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cash_custody_events_assignment_id_fkey
        FOREIGN KEY (assignment_id) REFERENCES cash_custody_assignments(id)
        ON DELETE CASCADE
);
CREATE INDEX cash_custody_events_assignment_id_idx ON cash_custody_events(assignment_id);
CREATE INDEX cash_custody_events_type_idx ON cash_custody_events(type);

COMMIT;
