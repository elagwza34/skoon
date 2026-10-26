# Cash Custody — RLS Policy Draft

**Status:** Draft for review. NOT executed.

---

## Access Summary

| Table | Policy | Who can do what |
|-------|--------|-----------------|
| `cash_drawers` | `read` | Authenticated staff in own branch only |
| `cash_drawers` | `insert` | Owner + Manager (for creating drawers) |
| `cash_custody_assignments` | `read` | Owner, Manager, Cashier (own shift/drawer) |
| `cash_custody_assignments` | `insert` | Owner, Manager (with open shift) |
| `cash_custody_assignments` | `update`/`delete` | Owner, Manager, or assigned Cashier (release) |
| `cash_custody_events` | `read` | Owner, Manager, Cashier (read audit trail) |
| `cash_custody_events` | `insert` | Owner, Manager (server-only write) |

---

## RLS Policies (Draft)

Apply to each table, in order of precedence:

```sql
-- Enable RLS
ALTER TABLE cash_drawers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_custody_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_custody_events ENABLE ROW LEVEL SECURITY;

-- 1. Public / anonymous — deny by default (implicit)
-- No permissive policies for `anon`.

-- 2. Read own branch
CREATE POLICY "cash_drawers_read_own_branch"
  ON cash_drawers
  FOR SELECT TO authenticated
  USING (branch_id = current_setting('app.current_branch_id')::BIGINT);

-- 3. Manager/Owner read
CREATE POLICY "cash_custody_read_owner_manager"
  ON cash_custody_assignments
  FOR SELECT TO authenticated
  USING (
    branch_id = current_setting('app.current_branch_id')::BIGINT
    AND (
      current_setting('app.is_owner')::boolean
      OR current_setting('app.role') IN ('manager')
    )
  );

-- 4. Insert / assign cash custody
CREATE POLICY "cash_custody_assignments_insert"
  ON cash_custody_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    branch_id = current_setting('app.current_branch_id')::BIGINT
    AND (
      current_setting('app.is_owner')::boolean
      OR (
        current_setting('app.role') IN ('manager','cashier')
        AND current_setting('app.has_open_shift')::boolean
      )
    )
  );

-- 5. Release / close custody
CREATE POLICY "cash_custody_assignments_release"
  ON cash_custody_assignments
  FOR UPDATE TO authenticated
  USING (
    branch_id = current_setting('app.current_branch_id')::BIGINT
    AND (
      current_setting('app.is_owner')::boolean
      OR (
        current_setting('app.role') IN ('manager','cashier')
        AND current_setting('app.has_open_shift')::boolean
      )
    )
  );

-- 6. CashCustodyEvent — insert only by trusted server
CREATE POLICY "cash_custody_events_insert"
  ON cash_custody_events
  FOR INSERT TO authenticated
  WITH CHECK (
    branch_id = current_setting('app.current_branch_id')::BIGINT
    AND current_setting('app.is_system')::boolean
  );

-- 7. Deny cross-branch access everywhere
CREATE POLICY "deny_cross_branch"
  ON ALL TABLES TO authenticated
  USING (branch_id = current_setting('app.current_branch_id')::BIGINT);
```

---

## Notes

- `app.current_branch_id`, `app.is_owner`, `app.role`, `app.has_open_shift`, `app.is_system` are server-side claims set by the application (not client-controlled).
- This policy draft deliberately uses `READ`, `INSERT`, `UPDATE`, with `deny` for unlisted actions.
- These policies are **not** part of production deployment. To be applied by a DBA after review.

---
