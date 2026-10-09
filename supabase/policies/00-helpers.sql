-- ============================================================================
-- Skoon — RLS helper functions (review-only; NOT executed in this phase)
-- ============================================================================
--
-- DESIGN PRINCIPLE — never trust the client.
-- The application role/branch for the *signed-in* user is read from the trusted
-- `public.users` row (created by the server-side provisioning flow), keyed by
-- `auth.uid()`. We deliberately DO NOT read role from JWT `user_metadata` or
-- `app_metadata` set by the client — those can be spoofed. If we later mint a
-- custom JWT claim for role, it must be written only by a trusted server.
--
-- These are SECURITY DEFINER functions so the lookup can read `public.users`
-- without recursion in RLS. They return simple scalars and are cheap.
--
-- Prisma manages `public.*` tables; Supabase Auth manages `auth.users`.
-- `public.users.id` == `auth.users.id` (UUID), enforced by the app, with NO
-- database FK to auth.users (Supabase reserves that schema).
-- ============================================================================

-- current_app_user_id(): the Supabase auth user id (auth.uid()) or NULL if anon.
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

-- current_role_slug(): the caller's application role slug from public.users.
-- Returns NULL when the caller is anonymous or has no public.users row.
create or replace function public.current_role_slug()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.slug
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = auth.uid()
    and u.deleted_at is null
    and u.is_active = true;
$$;

-- current_branch_id(): the caller's branch id, or NULL.
-- NULL branch id means OWNER (cross-branch access) by app convention.
create or replace function public.current_branch_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select u.branch_id
  from public.users u
  where u.id = auth.uid()
    and u.deleted_at is null
    and u.is_active = true;
$$;

-- is_staff(): true when the caller is an active user with a known role.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role_slug() is not null;
$$;

-- is_owner(): true only for the owner role.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_slug(), '') = 'owner';
$$;

-- is_manager_or_above(): manager or owner (used for admin surfaces).
create or replace function public.is_manager_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role_slug() in ('owner', 'manager');
$$;

-- can_access_branch(target): owner (NULL branch) sees all; staff see their own.
create or replace function public.can_access_branch(target bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_owner() then true
    when public.current_branch_id() is null then false  -- non-owner without a branch
    else public.current_branch_id() = target
  end;
$$;

-- has_permission(slug): exact match against permissions granted to the caller's role.
create or replace function public.has_permission(slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.role_permission rp
    join public.permissions p on p.id = rp.permission_id
    join public.users u on u.role_id = rp.role_id
    where u.id = auth.uid()
      and u.deleted_at is null
      and u.is_active = true
      and p.slug = has_permission.slug
  );
$$;
