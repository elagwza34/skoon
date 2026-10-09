-- ============================================================================
-- Skoon — Staff operational RLS policies (review-only; NOT executed in this phase)
-- ============================================================================
--
-- SCOPE OF THIS FILE
-- These policies let a SIGNED-IN, ACTIVE staff member read/write operational
-- rows for THEIR OWN branch only. Owner (NULL branch_id) sees all branches via
-- `can_access_branch()`. Everything not explicitly permitted here stays denied.
--
-- IMPORTANT ASSUMPTIONS (documented, to be confirmed before execution):
--  * `public.users.role_id` -> `roles.slug` is the single source of truth for the
--    caller's role. There is NO client-controlled role source (helpers read the
--    DB, never JWT claims). See 00-helpers.sql.
--  * A branch-scoped staff row has `branch_id` set; the Owner has `branch_id`
--    NULL. `can_access_branch(target)` encodes this.
--  * Writes that MUST be server-authoritative (payment finalization, discount
--    application, inventory posting, settings/roles/users/permissions changes,
--    audit inserts) are intentionally NOT granted to the client here - they go
--    through trusted server code (Prisma DIRECT_URL or service-role). Only the
--    flows needed for the waiter/kitchen/cashier POS to function against the
--    DB are opened, and narrowly.
--
-- If a policy here feels too broad for a reviewer, narrow it - the default is
-- deny, and it is always safer to move a flow to a trusted server endpoint.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ORDERS - the core operational table. Branch-scoped. Client may insert/update
-- within its branch; delete is NEVER granted (soft archive instead).
-- ---------------------------------------------------------------------------
create policy "staff read own-branch orders"
  on public.orders for select
  to authenticated
  using (public.can_access_branch(branch_id));

-- A waiter may create an order for their own branch. The row must be attributed
-- to the caller (created_by = auth.uid()) so orders can't be spoofed to another
-- staff member, and the branch must be one the caller can access.
create policy "staff insert own-branch order"
  on public.orders for insert
  to authenticated
  with check (
    public.can_access_branch(branch_id)
    and created_by = auth.uid()
  );

-- Status/timeline updates within the caller's branch. Allowed transitions are
-- enforced by application logic AND the 21-* guard; this policy scopes to branch.
create policy "staff update own-branch order"
  on public.orders for update
  to authenticated
  using (public.can_access_branch(branch_id))
  with check (public.can_access_branch(branch_id));

-- No client DELETE on orders (ever). Archival is a server concern. (No policy => denied.)

-- ---------------------------------------------------------------------------
-- ORDER SUB-TABLES — no direct branch_id; scoped via the parent order's branch.
-- EXISTS keeps this a single round-trip and avoids a recursive RLS read on
-- orders (orders policies are simple column checks, so no recursion risk).
-- ---------------------------------------------------------------------------
create policy "staff read own-branch order items"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.can_access_branch(o.branch_id)
    )
  );

-- Items are only ever created alongside their order by the same staff member,
-- for a branch the caller may access. Kept in lock-step with the orders insert.
create policy "staff insert own-branch order items"
  on public.order_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.can_access_branch(o.branch_id)
        and o.created_by = auth.uid()
    )
  );

-- Voiding a line (is_voided) is an in-branch staff action; full delete denied.
create policy "staff update own-branch order items"
  on public.order_items for update
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.can_access_branch(o.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.can_access_branch(o.branch_id)
    )
  );

-- Addons / options on an item inherit the item's order branch.
create policy "staff read own-branch order item addons"
  on public.order_item_addons for select
  to authenticated
  using (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.can_access_branch(o.branch_id)
    )
  );

create policy "staff insert own-branch order item addons"
  on public.order_item_addons for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.can_access_branch(o.branch_id)
        and o.created_by = auth.uid()
    )
  );

create policy "staff read own-branch order item options"
  on public.order_item_options for select
  to authenticated
  using (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_options.order_item_id
        and public.can_access_branch(o.branch_id)
    )
  );

create policy "staff insert own-branch order item options"
  on public.order_item_options for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_options.order_item_id
        and public.can_access_branch(o.branch_id)
        and o.created_by = auth.uid()
    )
  );

-- Status history is append-only and attributed to the caller (changed_by = uid).
create policy "staff read own-branch order status history"
  on public.order_status_history for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id
        and public.can_access_branch(o.branch_id)
    )
  );

create policy "staff append own-branch order status history"
  on public.order_status_history for insert
  to authenticated
  with check (
    changed_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id
        and public.can_access_branch(o.branch_id)
    )
  );

-- No client update/delete on status history (immutable timeline). Denied by omission.

-- ---------------------------------------------------------------------------
-- PAYMENTS — branch_id present. READ for own-branch staff; the cashier needs
-- to see payment state. WRITE (finalize/refund) stays SERVER-ONLY: money must
-- never be inserted/mutated from the client. Only branch-scoped read granted.
-- ---------------------------------------------------------------------------
create policy "staff read own-branch payments"
  on public.payments for select
  to authenticated
  using (public.can_access_branch(branch_id));
-- No client insert/update/delete on payments. Denied by omission (server-only).

-- ---------------------------------------------------------------------------
-- CAFE TABLES — branch_id present. Staff read own-branch tables (incl. inactive
-- so POS can show all tables); manager+ may update table status/layout in-branch.
-- No client delete.
-- ---------------------------------------------------------------------------
create policy "staff read own-branch cafe tables"
  on public.cafe_tables for select
  to authenticated
  using (public.can_access_branch(branch_id));

create policy "manager update own-branch cafe tables"
  on public.cafe_tables for update
  to authenticated
  using (public.is_manager_or_above() and public.can_access_branch(branch_id))
  with check (public.is_manager_or_above() and public.can_access_branch(branch_id));

-- ---------------------------------------------------------------------------
-- MENU MANAGEMENT — categories & products have branch_id. Staff read own-branch
-- (superset of the public active-only view). Manager+ may write menu in-branch.
-- Public (anon) read of ACTIVE rows is granted in 10-rls-enable-and-public.sql.
-- ---------------------------------------------------------------------------
create policy "staff read own-branch categories"
  on public.categories for select
  to authenticated
  using (public.can_access_branch(branch_id));

create policy "manager write own-branch categories"
  on public.categories for all
  to authenticated
  using (public.is_manager_or_above() and public.can_access_branch(branch_id))
  with check (public.is_manager_or_above() and public.can_access_branch(branch_id));

create policy "staff read own-branch products"
  on public.products for select
  to authenticated
  using (public.can_access_branch(branch_id));

create policy "manager write own-branch products"
  on public.products for all
  to authenticated
  using (public.is_manager_or_above() and public.can_access_branch(branch_id))
  with check (public.is_manager_or_above() and public.can_access_branch(branch_id));

-- ---------------------------------------------------------------------------
-- USERS — self profile. A staff member may READ their own row (id = auth.uid())
-- and managers may read staff in their branch. NO client role/branch edits:
-- role assignment and activation are trusted-server-only (Owner provisioning,
-- staff management) to prevent privilege escalation from the client.
-- ---------------------------------------------------------------------------
create policy "user read own profile"
  on public.users for select
  to authenticated
  using (id = auth.uid());

create policy "manager read own-branch users"
  on public.users for select
  to authenticated
  using (public.is_manager_or_above() and public.can_access_branch(branch_id));
-- No client insert/update/delete on users (role & activation are server-authoritative).

-- ============================================================================
-- STILL SERVER-ONLY (no client policy anywhere => denied by default):
--   roles, permissions, role_permission, discounts, discount_redemptions,
--   inventory_items, recipes, recipe_items, inventory_transactions,
--   app_settings, audit_logs, order finalization/payment writes, user role changes.
-- These are managed exclusively through trusted server code (Prisma DIRECT_URL
-- or service-role) in a later, separately-approved phase.
-- ============================================================================