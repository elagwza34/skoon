-- ============================================================================
-- Skoon — Enable RLS on all application tables (review-only; NOT executed)
-- ============================================================================
--
-- DEFAULT-DENY: with RLS enabled and no permissive policy for a role/command,
-- Postgres denies it. We add permissive policies ONLY where public/staff read
-- or specific writes are intended.
--
-- NOTE ON WRITES: client (anon key) access to operational tables (orders,
-- payments, inventory, settings, audit, users, roles, permissions) is DENIED by
-- default here. All such writes go through a trusted server (Prisma direct, or
-- service-role) in a later phase. Customer QR ordering will need a narrowly
-- scoped INSERT policy added when that flow is approved — see README.
-- ============================================================================

-- --- Enable RLS on every application table -------------------------------
alter table public.branches                 enable row level security;
alter table public.roles                    enable row level security;
alter table public.permissions              enable row level security;
alter table public.role_permission          enable row level security;
alter table public.users                    enable row level security;
alter table public.cafe_tables              enable row level security;
alter table public.categories               enable row level security;
alter table public.products                 enable row level security;
alter table public.product_options          enable row level security;
alter table public.product_option_values    enable row level security;
alter table public.addons                   enable row level security;
alter table public.product_addon_map        enable row level security;
alter table public.orders                   enable row level security;
alter table public.order_items              enable row level security;
alter table public.order_item_addons        enable row level security;
alter table public.order_item_options       enable row level security;
alter table public.order_status_history     enable row level security;
alter table public.payments                 enable row level security;
alter table public.inventory_items          enable row level security;
alter table public.recipes                  enable row level security;
alter table public.recipe_items             enable row level security;
alter table public.inventory_transactions   enable row level security;
alter table public.discounts                enable row level security;
alter table public.discount_redemptions     enable row level security;
alter table public.app_settings             enable row level security;
alter table public.audit_logs               enable row level security;
alter table public.shifts                    enable row level security;

-- ============================================================================
-- PUBLIC READ — website / customer menu content (anonymous allowed, read-only)
-- ============================================================================
-- Rationale: a QR customer must read the active menu for their branch without
-- signing in. Only ACTIVE, non-deleted, currently-available rows are exposed.

-- branches: active branches readable (name/timezone needed to render the menu).
create policy "public read active branches"
  on public.branches for select
  to anon, authenticated
  using (is_active = true);

-- categories: active, non-deleted.
create policy "public read active categories"
  on public.categories for select
  to anon, authenticated
  using (is_active = true and deleted_at is null);

-- products: active, non-deleted, and currently orderable.
create policy "public read active available products"
  on public.products for select
  to anon, authenticated
  using (is_active = true and deleted_at is null and is_available = true);

-- product options & values: readable so the menu can render option groups.
create policy "public read product options"
  on public.product_options for select
  to anon, authenticated
  using (deleted_at is null);

create policy "public read product option values"
  on public.product_option_values for select
  to anon, authenticated
  using (deleted_at is null);

-- addons and the product↔addon map: readable for add-on selection UI.
create policy "public read active addons"
  on public.addons for select
  to anon, authenticated
  using (is_active = true);

create policy "public read product addon map"
  on public.product_addon_map for select
  to anon, authenticated
  using (true);

-- cafe_tables: a table's existence/active state is needed to validate a QR
-- scan. We expose only active, non-deleted rows; the public_token itself is
-- used by the app to look up the table and is treated as a capability secret
-- (not printed in listings). No direct public write.
create policy "public read active cafe tables"
  on public.cafe_tables for select
  to anon, authenticated
  using (is_active = true and deleted_at is null);

-- ============================================================================
-- NO PUBLIC / CLIENT ACCESS (explicit deny by omission — documented here).
-- The following tables have RLS enabled above with NO permissive client policy,
-- so anon and authenticated clients are DENIED all access by default:
--   roles, permissions, role_permission, users, orders, order_items,
--   order_item_addons, order_item_options, order_status_history, payments,
--   inventory_items, recipes, recipe_items, inventory_transactions,
--   discounts, discount_redemptions, app_settings, audit_logs, shifts.
-- Server-side (Prisma DIRECT_URL / service-role) bypasses RLS intentionally and
-- is the only writer of these tables until scoped policies are approved.
-- ============================================================================
