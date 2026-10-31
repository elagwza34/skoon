# Security test report

Date: 2026-10-28

## Fixed

Middleware now validates SSR identity via `getClaims()` rather than `getUser()`.

## Findings requiring planned remediation

1. Supabase Advisor reports leaked-password protection is disabled. Enable it through the Supabase Auth configuration after Owner approval; this was not changed here.
2. Supabase Advisor reports 33 RLS-enabled tables without policies. This is an availability/security review item: the code intentionally uses server-side Prisma for sensitive operations, but each exposed Data API table and grant must be reviewed before adding policies. Do not disable RLS.
3. Four unmatched Auth identities exist. They must be individually reconciled through the documented Owner-approved adoption or removal process; no identity was changed.

No service-role secret, password, session token, or user email is included in this report.
