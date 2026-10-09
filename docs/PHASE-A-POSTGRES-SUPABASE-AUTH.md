# Phase A — PostgreSQL + Supabase Auth Foundation

**Status:** Local schema design change applied. NOT deployed. NOT migrated.
**Date:** 2026-10-09
**Baseline commit:** `9c1cb2f6cd78024d6e74623fb3a89f2e72b637ec`
**Branch:** `main` (in sync with `origin/main` before this change)

> This document is the decision record for Phase A. It distinguishes **approved
> decisions**, **implemented local changes**, **proposed-but-unimplemented design**,
> **unresolved questions**, and **production steps not yet authorized**.

---

## 1. Scope of this phase

Resolve the foundational conflicts between:

1. Prisma targeting **MySQL** vs the approved **Supabase PostgreSQL** database.
2. The **custom-password** user model vs the approved **Supabase Auth** architecture.
3. The Prisma datasource config vs the intended Supabase **pooled/direct** connection.

Phase A changes **local schema design only**. It does **not** migrate data, create
migrations, deploy, or implement authentication code. Shift and TaxRule models are
explicitly **out of scope** and were **not** added.

---

## 2. Approved decisions

| # | Decision | Source |
|---|---|---|
| D1 | Database is **Supabase PostgreSQL** (not MySQL). | Product owner |
| D2 | Authentication identity is owned by **Supabase Auth** (`auth.users`). | Product owner |
| D3 | App runtime uses the **pooled** connection (`DATABASE_URL`, PgBouncer 6543). Migrations use the **direct** connection (`DIRECT_URL`, 5432). | Product owner / `.env.example` |
| D4 | Prisma remains the ORM. | Product owner |
| D5 | Staff identity = Supabase Auth identity; application profile is linked by UUID. | This phase |
| D6 | Money stays `DECIMAL(10,2)` — never floating point. | Preserved |
| D7 | One branch now, schema designed for many. | Product owner |

---

## 3. Implemented local changes (this phase)

**Only `prisma/schema.prisma` was modified.** No other file changed.

### 3.1 Datasource

| Before | After |
|---|---|
| `provider = "mysql"` | `provider  = "postgresql"` |
| `url = env("DATABASE_URL")` | `url = env("DATABASE_URL")` (pooled, preserved) |
| — | `directUrl = env("DIRECT_URL")` (added for migrations) |

`directUrl` is supported because Prisma 6.x is in use (see §6).

### 3.2 MySQL-only native types removed

PostgreSQL has **no unsigned integer** types, so all MySQL-only native types were
removed and replaced with portable Prisma scalars. Counts verified programmatically
(0 MySQL tokens remain):

| MySQL construct | Occurrences | PostgreSQL replacement | Rationale |
|---|---|---|---|
| `@db.UnsignedBigInt` | 40 | *(removed attribute; keep `BigInt`)* | Postgres `bigint` is already signed; positivity is a business rule enforced in the app layer. |
| `@db.UnsignedSmallInt` | 3 | `@db.SmallInt` | Valid Postgres native type; signed `smallint` (-32768..32767) covers the small positive counters/quantities. |
| `@db.UnsignedTinyInt` | 2 (1 removed with User fields) | `@db.SmallInt` | Postgres has no `tinyint`; `smallint` is the closest native type for small non-negative counters (e.g. `capacity`, `quantity`). |
| `@db.TinyInt` | 2 | `@db.SmallInt` | Same as above. |

> **Data-migration implication (future):** When moving real MySQL data, the removal
> of UNSIGNED means the migration must clamp/cast values into the signed ranges and
> enforce non-negativity in application validation. No data was migrated here.


### 3.3 Identifier strategy change (BigInt → UUID for User lineage)

The `User` primary key changed from `BigInt autoincrement` to `String @db.Uuid`
because the id **must equal the Supabase Auth user id** (`auth.uid()`).

> **Rule honored (scope §4.7):** every foreign key that referenced `User.id` was
> updated consistently. All seven `User`-referencing FKs became `String? @db.Uuid`:

| Model | Column | Now |
|---|---|---|
| `Order` | `createdById` | `String? @db.Uuid` |
| `OrderStatusHistory` | `changedById` | `String? @db.Uuid` |
| `Payment` | `paidById` | `String? @db.Uuid` |
| `Discount` | `createdById` | `String? @db.Uuid` |
| `InventoryTransaction` | `createdById` | `String? @db.Uuid` |
| `AuditLog` | `userId` | `String? @db.Uuid` |
| `AppSetting` | `updatedById` | `String? @db.Uuid` |

All other tables keep `BigInt autoincrement` primary keys — only the User lineage is
UUID. This preserves the existing surrogate-key design everywhere except the identity
boundary, which the Supabase architecture requires.

### 3.4 Supabase Auth integration on `User`

**Removed** (credentials now owned by Supabase Auth — verified these fields were
referenced by no other model, so removal is safe):

- `passwordHash`
- `failedLoginCount`
- `lockedUntil`
- `mustChangePassword`

**Kept:** `pinCode` (see §5 — purpose UNCONFIRMED), `email`, `phone`, `name`,
`avatarPath`, `isActive`, `lastLoginAt`, `branchId`, `roleId`, timestamps, soft delete.

**Explicitly NOT created:** a Prisma relation to `auth.users`. See §4.

### 3.5 Documentation header comment

A short Phase A banner comment was added at the top of the schema pointing here.

---

## 4. Auth-identity relationship strategy (DECISION)

**Do not model `auth.users` in Prisma.**

Supabase Auth manages the `auth` schema. Prisma must not treat `auth.users` as an
ordinary application-owned table (no migrations against it, no relation assumptions,
no introspection coupling).

**Chosen strategy — application-owned profile keyed by Supabase UUID:**

- `User.id` is a `UUID` that **equals** the Supabase Auth `auth.uid()`.
- The id is assigned **only** by the trusted server-side provisioning flow, so it
  always matches the Supabase identity (never client-supplied).
- **No** Prisma FK from `User` to `auth.users` — justified because Prisma should not
  manage the Supabase auth schema. Integrity across the boundary is enforced by the
  provisioning flow + RLS, not by a database FK.
- Staff/application data (roles, branch membership, activation, permissions) lives in
  the `public` schema and IS fully Prisma-managed.

This keeps a clean separation:

- **Authentication identity** → Supabase Auth (`auth.users`) — not in Prisma.
- **Application profile** → `User` (public) — Prisma-managed, keyed by Supabase UUID.
- **Roles & permissions** → `Role`, `Permission`, `RolePermission` — preserved.
- **Branch membership** → `User.branchId` — preserved (null = all branches, e.g. owner).
- **Activation** → `User.isActive` + `deletedAt` — preserved.

## 5. PIN handling — UNRESOLVED (needs your approval)

`pinCode` currently exists on `User`. The repository does **not** establish whether it
is:

- (a) a **staff POS quick-login PIN** (waiter/cashier unlock on a shared terminal), or
- (b) an **obsolete login credential** superseded by Supabase Auth.

It was **kept** (not deleted) so the schema stays valid, but it is **flagged** in the
schema with a comment and **must not be treated as plaintext auth** if used.

**Recommendation (pending approval):**
- If (a) POS PIN: it is a **separate** credential and must be **hashed** (never
  plaintext), stored as a hash (e.g. `pinCodeHash`), with rate-limiting and lockout.
  This is a **new, separately-approved** mechanism — NOT built in Phase A.
- If (b) legacy: remove `pinCode` in a later phase.

**Action required:** confirm the intended purpose before any PIN feature is built.

---

## 6. Prisma package compatibility findings

Inspected the lockfile/package config (not assumed):

- `@prisma/client`: **6.19.3** (runtime)
- `prisma` (CLI): **6.12.0**
- Both declared as `^6.12.0`.

**Findings:**
- Both are Prisma **6.x**, so `directUrl` is fully supported.
- **Minor version mismatch** (CLI 6.12.0 vs client 6.19.3). Both satisfy `^6.12.0`,
  so `generate`/`validate` pass. **Recommendation:** align both to the same 6.x
  (e.g. bump CLI to 6.19.3) in a later, approved dependency update — **not done here**
  because that would require a package install (prohibited without approval).
- Next.js: **15.4.5**; React: **19.1.1**.

### Supabase packages (NOT installed — by policy)

| Package | Intended role | Needed? |
|---|---|---|
| `@supabase/supabase-js` | Core Supabase client (Auth, PostgREST, storage). | Yes |
| `@supabase/ssr` | Supabase Auth for **server-side** Next.js (cookie-based sessions in Route Handlers / Server Components / middleware). | Yes, for SSR auth |

- Compatible with Next.js 15 / React 19.
- **Not installed in Phase A:** installing requires network + lockfile change, which is
  prohibited without explicit approval. This will be handled in the auth-implementation
  phase.

---

## 7. RLS & authorization boundaries (design only — NOT implemented)

Nothing below is implemented or tested. This documents future requirements.

- **Branch-scoped access:** every business table carries `branchId`; RLS policies must
  scope reads/writes to the staff member's branch.
- **Role-based authorization:** `Role`/`Permission`/`RolePermission` remain the app's
  RBAC source of truth; enforce in trusted server code (and/or RLS with a role claim).
- **RLS policies:** must be **designed and tested** in a later, separately-approved
  task. **No RLS is enabled, complete, or secure at this time.** Do not assume RLS.
- **Trusted server-side admin operations:** privileged writes (role assignment,
  provisioning) run only on the server using the service-role key, never on the client.
- **Anti-escalation:** roles/permissions must **never** be accepted from client
  metadata or public registration. Role is set only by the provisioning flow.

---

## 8. Owner provisioning — design only (NOT executed)

Future secure workflow (no account created, no invite sent, no service-role secret
added in this phase):

1. Supabase Auth **creates/invites** the identity (e.g. admin invite or
   `auth.admin.createUser`) — identity lives in `auth.users`.
2. A **trusted server-side admin process** (using the service-role key, server-only)
   inserts the `User` profile row with `id = auth.uid()` and assigns the **Owner**
   role via `RolePermission`/`User.roleId`.
3. **No hardcoded passwords or service-role secrets in source.** Secrets come from
   server env vars only.
4. Owner privileges are **never** granted via public registration or client-controlled
   metadata.
5. The operation is **audited** (`AuditLog`).

**`prisma/seed.ts` current behavior:** it only upserts the `owner` **role**
(`slug: 'owner'`). It does **not** create a user and does **not** set a password.
**What would change later:** the seed could ensure roles/permissions exist, but the
Owner **account** must come from the Supabase-provisioning flow — **not** from a plain
seed write. Seed was **not executed** in Phase A.


## 9. `.env.example` review

`DATABASE_URL` (pooled 6543) and `DIRECT_URL` (5432) are already present and match the
new datasource. Supabase Auth vars are present as **placeholders only**. **No change
was needed** and none was made. No real credentials were introduced anywhere.

---

## 10. Local validation (commands actually run — no DB connection)

Environment used **fake local placeholders only** (no production credentials, no DB
connection):

```
DATABASE_URL=postgresql://user:pass@localhost:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://user:pass@localhost:5432/postgres
```

| Command | Result |
|---|---|
| `node node_modules/prisma/build/index.js format --schema prisma/schema.prisma` | Formatted in 59ms |
| `node node_modules/prisma/build/index.js validate --schema prisma/schema.prisma` | **The schema is valid** |
| `node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma` | Generated Prisma Client |

Additional programmatic verification (UTF-8-safe check, output confirmed):
- BOM: none (`2f 2f 20`).
- `provider = "postgresql"` present; `"mysql"` absent.
- `directUrl` present.
- MySQL tokens (`@db.Unsigned*` / `@db.TinyInt`): **0 remaining**.
- UUID columns: **8** (`User.id` + 7 FK columns).
- Removed fields absent: `passwordHash`, `failedLoginCount`, `lockedUntil`,
  `mustChangePassword`. `pinCode` kept.
- Models: **26** (unchanged). Braces balanced (28/28).
- Secret scan of `schema.prisma` and `.env.example`: no real `eyJ...` key present;
  `.env.example` is placeholders only.

Line endings were normalized to CRLF to match the rest of the repository.

---

## 11. NOT done / not authorized (stop boundary)

- No migrations (`migrate dev/deploy`, `db push`) — none created or run.
- No data migration claimed or performed.
- No `Shift` or `TaxRule` models (later phase).
- No Supabase packages installed.
- No Owner account created; no invite sent; no service-role secret added.
- No RLS policies created, enabled, or tested.
- No auth code, pages, routes, APIs, UI.
- No CI/CD, deployment, DNS.
- No commit, push, branch changes, or Git state changes.
- No production/remote database connection.

---

## 12. Open questions requiring approval before next phase

1. **PIN purpose** (§5): POS quick-login PIN (hash it, new mechanism) or legacy
   (remove)? Approval required before building any PIN auth.
2. **Prisma version alignment** (§6): bump CLI `prisma` to match `@prisma/client`
   6.19.3? Requires an approved dependency install.
3. **Supabase package installation** (§6): approve installing
   `@supabase/supabase-js` + `@supabase/ssr` for the auth phase.
4. **RLS strategy** (§7): approve designing/testing branch-scoped RLS policies as a
   separate task.
5. **Owner provisioning trigger** (§8): CLI script vs one-time admin route vs manual
   hPanel/Supabase dashboard step?

