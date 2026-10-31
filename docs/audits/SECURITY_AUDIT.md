# Security Audit

## Confirmed strengths

- Middleware fails closed for staff paths and validates Supabase JWT claims (`src/middleware.ts:22-40,83-120`).
- Authorization data comes from trusted Prisma `public.users`, not user-editable JWT metadata (`src/lib/session.ts:42-71`).
- All 73 staff route files reference a server session guard.
- Core routes generally validate identifiers and branch scope; public order prices are server-resolved.
- Environment values were not printed; only required names were inspected.

## Findings

| ID | Priority | Finding | Evidence |
|---|---|---|---|
| SEC-001 | P0 | Installed Next.js has critical RCE and high DoS advisories | `next@15.5.27`; `next.config.ts:15-30`; npm audit |
| SEC-002 | P1 | Public QR creation has no application rate limit/replay control/body limit | `src/app/api/public/orders/route.ts:11-32` |
| SEC-003 | P2 | Production RLS/function grants not verified | `supabase/policies/*.sql` |

Additional dependency results: Zod has a high resource-exhaustion advisory; Prisma CLI/config transitively reports a high recursive-merge advisory; Next's bundled PostCSS reports high file-disclosure advisories. `npm audit` reported 6 total vulnerability records: 1 critical, 5 high. Runtime reachability differs per package and must be assessed during upgrades.

## Authentication and authorization lifecycle

- Login resolves a Supabase user then a DB staff record; canonical homes are role-derived.
- Active/deleted state is checked in `src/lib/session.ts:46-60`.
- First-user Owner bootstrap is bounded by an empty users table and confirmed email (`src/lib/session.ts:76-129`), but its safety depends on public signup actually being disabled in live Supabase; that setting was not verified.
- Middleware is identity-only by design; pages/services must enforce role and branch.
- Staff route guard presence was confirmed, but complete object-level authorization was traced only in prioritized financial/inventory/waiter paths.

## RLS review

Local policies use `auth.uid()` and DB roles rather than `user_metadata`, which is the correct trust model. However, the local policy directory is not proof of deployment. Before release, enumerate live:

1. RLS-enabled tables and FORCE RLS state.
2. Policies by command/role/USING/WITH CHECK.
3. `SECURITY DEFINER` owners, immutable search paths, and EXECUTE grants.
4. Data API exposed schemas and table grants.
5. Runtime Prisma role privileges and `rolbypassrls`.

## Remediation order

Patch Next first; protect public APIs; then perform a read-only RLS/grant matrix on staging and production. Do not use production writes or policy changes during verification.
