# SKOON full system audit

Date: 2026-10-28

## Scope completed

Authentication provisioning, login, server session handling, route access, role home routing, build checks, and production read-only Supabase diagnostics were inspected. No production write, deployment, migration, Auth-user change, or infrastructure change was performed.

## Initial findings

1. The production project has 4 Auth identities without matching `public.users` authorization rows. One matches a documented seed-test identity. No orphaned application users were found.
2. The middleware refreshed identity using `getUser()` rather than the current SSR-recommended `getClaims()` validation path.
3. The configured isolated staging target is not usable: its guard reports that `DATABASE_URL` and `SKOON_STAGING_DATABASE_URL` differ. No integration test was run after that failure.
4. Supabase reports 33 RLS-enabled tables with no policies and leaked-password protection disabled. The application uses server-side Prisma for privileged data access; no RLS change was made during this audit.

## Verified implementation

- Owner-only staff creation calls Supabase Admin API, then creates `users`, `employee_profiles`, and an audit row in one Prisma transaction.
- Existing unmatched Auth identities can be adopted only by the Owner provisioning path; login never self-provisions them.
- New username accounts use non-routable synthetic email identities; passwords are passed only to Supabase Auth and not persisted by application code.
- Role destinations are owner `/owner`, manager `/manager`, cashier `/cashier`, kitchen `/kitchen`, and waiter `/waiter`.

See the companion reports for test evidence, security findings, and blockers.
