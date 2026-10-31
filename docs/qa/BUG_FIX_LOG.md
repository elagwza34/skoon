# Bug fix log

## 2026-10-28 — SSR session validation hardening

- Root cause: `src/middleware.ts` used `supabase.auth.getUser()` in the session-refresh path while current Supabase SSR guidance requires `getClaims()` for validated JWT claims and cookie refresh.
- Affected file: `src/middleware.ts`.
- Change: call `getClaims()` and accept identity only when the signed `sub` claim is a string.
- Reproduction: a stale or spoofed cookie session must not be treated as validated middleware identity.
- Tests: existing offline regression suite, TypeScript check, ESLint, and production build were executed.
- Result: passed. Live isolated Auth integration remains blocked by the staging guard configuration.

## 2026-10-28 â€” staging guard/template diagnosis

- Root cause: `.env.staging.example` used explanatory text where the loader requires a literal URL. It does not expand variable references.
- Affected files: `.env.staging.example`, `scripts/validate-staging-env.cjs`.
- Change: document duplicated complete pooled URLs in the template and reject template placeholders before any database connection.
- Result: `npm run staging:check` stops with a precise non-secret error. No guard bypass or test mutation occurred.

## 2026-10-28 — controlled Auth reconciliation completion

- Root cause: the reconciliation endpoint had unresolved imports, did not verify the requested Auth UUID with Supabase Admin API, did not create the required employee profile, and allowed an incomplete data shape.
- Affected files: `src/lib/staff-reconcile.ts`, `src/app/api/staff/reconcile/route.ts`, `tests/offline.test.ts`.
- Change: restrict reconciliation to non-owner roles; require Owner confirmation, an exact existing Auth UUID, active branch, caller-provided name, no existing UUID/email mapping, and create `users`, `employee_profiles`, and an audit record in one transaction.
- Tests: 175 offline tests and TypeScript passed. This flow was not invoked against production.
