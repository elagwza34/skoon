# Authentication test report

Date: 2026-10-28

## Change verified

`src/middleware.ts` now uses `supabase.auth.getClaims()` to validate and refresh the SSR session, deriving identity only from the signed `sub` claim. This follows current Supabase SSR guidance and avoids relying on an unvalidated cookie session in middleware.

## Executed

- `npm test`: passed, 173 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: completed and `.next/BUILD_ID` was created.
- Read-only production identity reconciliation: 4 unmatched Auth identities; 0 orphaned application users; 2 active application users.

## Not executed

Real Auth provisioning/login E2E tests are blocked before execution. The local `.env.staging` is an unconfigured copy of the example: its database URLs and project reference contain template placeholders, and `SKOON_STAGING_DATABASE_URL` is literal explanatory text rather than a URL. The loader intentionally does not expand that text. No test Auth user, session, employee, invoice, payment, or inventory record was created.

The staging guard now rejects template placeholders before it attempts a database connection. Configure a separate Supabase project, copy its pooled URL exactly into both `DATABASE_URL` and `SKOON_STAGING_DATABASE_URL`, use its direct URL for `DIRECT_URL`, set its real project ref and Auth keys, then run `npm run staging:check` successfully before live tests.
