# Authentication and Session Verification

## Architecture

Supabase Auth is the identity authority and its SSR client stores the session in
cookies. The trusted `public.users` record resolved through Prisma is the sole
source for role, branch, active status, and permissions; JWT metadata is never
used for authorization. Middleware refreshes identity cookies and passes the
pathname/request correlation identifier downstream. The app layout and each
protected page resolve the trusted staff session again and fail closed.

### Browser cookie deletion

Authentication for a protected request is derived exclusively from the cookies
attached to that request. `middleware.ts` constructs its Supabase SSR client
from `request.cookies`; `session.ts` constructs its server client from
Next.js `cookies()` and verifies identity with `auth.getUser()`. Neither path
reads browser Local Storage, React state, an application session id, nor a
cached database user as authentication. Therefore deleting the Supabase auth
cookies causes the next protected page request to redirect to `/login` and the
next `/api/staff/*` request to return `401`; a database staff record cannot
restore access without a valid request credential.

The browser client uses `@supabase/ssr`'s cookie session mechanism. Application
Local Storage keys are limited to non-auth UI/guest-order data; the obsolete
login-credential key is removed during login-page initialization without being
read. Cookie deletion affects only this browser session and does not claim to
revoke sessions on other devices or close an operational shift.

## Confirmed fixes

* The dashboard logout control previously navigated to the login URL rather
  than invoking the supported server-side Supabase sign-out flow. It now uses
  `logoutAction`; logout does not touch shifts, payments, orders, inventory, or
  ledgers.
* A valid `next` form field could bypass the login-time operational-shift
  redirect. The trusted session is now resolved before either requested or
  default routing; Cashier, Waiter, and Kitchen staff without an open shift are
  sent to `/shifts` without creating a shift.
* Post-auth return paths now accept only safe same-origin application paths.
* Middleware preserves Supabase-provided cache-control headers when refreshed
  session cookies are written, reducing the risk of an intermediary caching a
  response containing `Set-Cookie`.
* Authenticated identities without an active trusted staff record are returned
  to `/login?reason=unprovisioned`, rather than taking an avoidable dashboard
  redirect path.
* `AuthExpiryGuard` now observes only same-origin `/api/staff/*` responses. A
  `401` forces a navigation to `/login`, clearing stale rendered React state
  after the authoritative server rejection. It neither polls nor handles public
  API responses.

## Role routing and shifts

| Role | Default | Login-time shift behavior |
| --- | --- | --- |
| Owner | `/dashboard` | No operational shift required |
| Manager | `/dashboard` | Existing policy remains exempt |
| Cashier | `/cashier` | `/shifts` when no active shift |
| Waiter | `/waiter` | `/shifts` when no active shift |
| Kitchen | `/kitchen` | `/shifts` when no active shift |

Login never opens a shift. Logout, expiry, and re-login do not close or create
shifts; operational services continue to enforce their own server-side shift
checks.

## Verification

* Offline tests: 119/119 passed, including safe redirect validation, role
  routing, authorization semantics, shift policy, and legacy credential
  cleanup.
* TypeScript typecheck passed.
* Browser, Supabase Auth fixture, token-refresh, revocation, and database-backed
  session tests are **BLOCKED** pending a positively verified isolated
  environment. No production account or database test was run.

Cookie deletion, browser Back, stale React state, and cross-device session
continuity require a real isolated browser/Auth fixture to observe. They are
not represented as completed integration tests.

## Status

**AUTH CODE COMPLETE (offline coverage) / AUTH BUILD VERIFIED / AUTH
INTEGRATION PENDING.** No migration, deployment, commit, or push was made for
this authentication pass.
