# Skoon — RLS Policy Package (REVIEW-ONLY)

> **Nothing in this directory has been executed against any database.** These
> files are a design record for review. Execution against a real database is a
> **separately-approved, isolated-development task** and is explicitly NOT part
> of Phase B.

## Apply order (when later approved)

Run in filename order in the isolated dev Supabase project's SQL editor:

| # | File | Purpose |
|---|------|---------|
| 1 | `00-helpers.sql` | `SECURITY DEFINER` helpers that read the caller's role/branch from the **trusted `public.users` row** keyed by `auth.uid()` — never from client-controlled JWT claims. |
| 2 | `10-rls-enable-and-public.sql` | Enable RLS on all 24 tables + public **read-only** menu/branch/table policies for anonymous QR customers. |
| 3 | `20-operational-rls.sql` | Staff operational policies: orders & sub-tables, payments read, tables, menu management (manager+), self/branch user reads. |
| 4 | `30-sensitive-deny.sql` | Documentation of the **deny-by-default** boundary (no grants). |

## Security model (summary)

- **Default deny.** RLS is enabled everywhere; access exists only where a
  policy grants it. Money, roles, permissions, settings, inventory, and audit
  are **never** client-writable.
- **Role & branch come from the server-provisioned `public.users` row**, not
  from `auth.jwt()` metadata. This blocks client-side role spoofing.
- **Owner** is modeled as a `public.users` row with `branch_id = NULL`
  (`can_access_branch()` returns true for all branches). Manager/staff are
  branch-scoped.
- **No Prisma FK to `auth.users`.** Supabase reserves the `auth` schema;
  `public.users.id` is a UUID equal to `auth.uid()`, kept in sync by the
  server, with no database-level cross-schema FK.

## Identity ↔ auth relationship

- `public.users.id` (UUID PK) **== Supabase Auth `auth.users.id`**.
- The app never lets Prisma read/write `auth.*`.
- Invariant enforced by the **trusted server-side provisioning flow**, not by a
  DB FK. (Rationale documented in `00-helpers.sql`.)

## Isolated-dev validation plan (NOT yet run)

To be executed **only** in a throwaway Supabase dev project with synthetic data:

1. Load schema (via an approved migration) then apply `00 → 10 → 20 → 30`.
2. **Anonymous:** can read active menu/branches/tables; **cannot** read orders,
   payments, users, settings, audit, inventory, roles, permissions.
3. **Authenticated staff (branch A):** can read/write orders & sub-tables for
   branch A only; **cannot** see branch B orders; cannot read/write payments,
   settings, roles, other users; cannot escalate own role.
4. **Role-spoof attempt:** set `user_metadata.role = 'owner'` (or `app_metadata`)
   on a staff user and confirm helpers still deny owner actions (role is read
   from `public.users`, not the claim).
5. **Manager (branch A):** can manage menu/tables in branch A; still denied
   cross-branch and denied server-only tables.
6. **Owner (branch NULL):** cross-branch read; still subject to server-only
   writes going through the trusted server.
7. **Cross-branch insert attempt:** staff of A tries to INSERT an order with
   `branch_id = B` → rejected by `with check`.
8. **Writes via anon key** to `orders/payments/users/settings` → rejected.
9. **Service-role** (server-only) path exercised from a Node script, never from
   the browser bundle.

Record actual results per case before claiming the policies are effective.

## Files

```
supabase/policies/
  00-helpers.sql              # SECURITY DEFINER role/branch helpers
  10-rls-enable-and-public.sql# RLS enable + public read-only menu policies
  20-operational-rls.sql      # staff operational (orders, tables, menu mgmt)
  30-sensitive-deny.sql       # documented deny-by-default boundary
  README.md                   # this file
```
