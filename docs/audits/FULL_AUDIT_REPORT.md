# SOKOON Full Technical Audit Report

## Scope and method

Read-only review of the current `D:\Sokoon` worktree on 2026-10-30. Reviewed App Router pages and 76 API routes (73 staff, 3 public), 104 library files, Prisma schema, 23 Prisma migration directories, 13 Supabase SQL migrations, local RLS policy files, UI components, package configuration, and 14 test/support files. Documentation files in this directory are the only modifications.

Evidence labels: **Code** = confirmed by source; **Test** = confirmed by an executed test; **Database** = confirmed from a live database; **Blocked** = requires isolated/live infrastructure. No finding below is described as a production incident without production evidence.

## Architecture summary

- Next.js 15 App Router with server pages and route handlers.
- Supabase Auth establishes identity; Prisma `public.users` supplies role, branch, active status, and permissions (`src/lib/session.ts:29-71`).
- All 73 staff route files reference `getStaffSession`/`requireStaffSession`; object authorization remains service-specific.
- Core payment and inventory writers use PostgreSQL transactions and row/advisory locks.
- Public QR ordering validates products and prices server-side.
- The repository has two migration streams (`prisma/migrations` and `supabase/migrations`), which are not a single verifiable deployment history.

## Findings

### SEC-001 — P0 — Vulnerable production framework dependency

- **Description:** Installed `next@15.5.27` is affected by a critical Image Optimization RCE advisory and a high App Router DoS advisory according to `npm audit`.
- **Evidence:** `package.json` allows `^15.4.5`; `npm ls` resolves 15.5.27; `next.config.ts:15-30` enables remote image optimization. `npm audit --omit=dev` reports GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r.
- **Reproduction:** Run `npm audit --omit=dev --json` in this lockfile state.
- **Impact:** Conditional remote code execution or denial of service at the public application boundary.
- **Recommendation:** Upgrade to a patched supported Next.js release, review the advisory preconditions, lock the version, and rerun security/build/E2E tests.
- **Complexity:** Medium. **Verification:** clean audit plus hostile SVG/image and Server Action regression tests. **Confidence:** High (installed-package finding; exploitability not tested).

### FIN-001 — P0 — Invoice deletion destroys financial and operational history

- **Description:** Owner `DELETE /api/staff/invoices/[id]` deletes payments then hard-deletes the order without a reversal, business-state check, or audit entry.
- **Evidence:** `src/app/api/staff/invoices/[id]/route.ts:12-25`; cascades include order items/status/notifications and payments (`prisma/schema.prisma:1214`, `1275`, `1292-1293`, `1320`).
- **Reproduction:** Authenticated Owner calls DELETE with any numeric order ID.
- **Impact:** Revenue, payment evidence, order history, and traceability can be irreversibly removed; inventory records may lose item attribution.
- **Recommendation:** Remove hard delete from runtime; use immutable cancellation/refund/reversal records and an explicit audited exceptional workflow.
- **Complexity:** High. **Verification:** DB integration tests proving settled records cannot be deleted and every correction reconciles. **Confidence:** High.

### FIN-002 — P1 — Global-discount eligibility flag is ignored

- **Description:** `eligibleForInvoiceDiscount` is accepted and persisted, but the calculator applies the invoice discount to all post-item-discount value.
- **Evidence:** Flag enters at `src/lib/invoice-recalculation.ts:44-56`; calculator sets `eligibleBaseCents = afterItemDiscountCents` and `excludedCents = 0` at `src/lib/invoice-discounts.ts:33-41`. UI exposes the checkbox at `src/components/cashier/invoice-board.tsx:120-145`.
- **Reproduction:** Mark one line ineligible, apply a percentage global discount; the ineligible line remains inside the base.
- **Impact:** Incorrect invoice totals and explains invoice-dependent discount behavior.
- **Recommendation:** Calculate eligible and excluded bases independently after line discounts and define fixed-discount behavior when eligible base is smaller.
- **Complexity:** Medium. **Verification:** unit and PostgreSQL cases mixing eligible/ineligible lines, quantities, tax, and fixed/percentage discounts. **Confidence:** High.

### INV-001 — P1 — Cashier invoice edits bypass inventory lifecycle

- **Description:** Adding or changing quantities through `editOpenInvoice` directly creates/updates order items but never reserves/releases stock or handles prepared/served quantities.
- **Evidence:** `src/lib/staff-invoices.ts:102-168`, especially direct writes at 122-145. Inventory-aware alternatives exist in `src/lib/staff-order-item-adjustment.ts:116-194` and `src/lib/staff-inventory-engine.ts:95-180`.
- **Reproduction:** Edit an unpaid dispatched invoice through cashier UI and compare reservations before/after.
- **Impact:** Available stock, reservations, waste, and kitchen quantities can diverge from the billed invoice.
- **Recommendation:** Centralize mutations in one inventory-aware order adjustment transaction; prohibit edits beyond legal preparation/serving boundaries.
- **Complexity:** High. **Verification:** isolated PostgreSQL concurrency tests for add/increase/decrease/variant/cancel at every lifecycle state. **Confidence:** High by code; DB outcome not executed.

### OPS-001 — P1 — Waiter ready-item action targets a missing endpoint

- **Description:** `WaiterBoard` submits serve actions to `/api/staff/orders/[id]/items/serve`, but no matching route appears in source or the successful Next build manifest.
- **Evidence:** `src/components/waiter/waiter-board.tsx:644-672`; built route list contains only item `[itemId]/adjust` and `[itemId]/void`.
- **Reproduction:** Open a ready order and invoke the serve action from the Waiter board.
- **Impact:** Core ready-to-served workflow can return 404 and leave kitchen/waiter state inconsistent.
- **Recommendation:** Rewire to the canonical status/item service or restore a guarded endpoint with branch, responsibility, quantity, inventory-consumption, and idempotency checks.
- **Complexity:** Medium. **Verification:** role E2E plus inventory transaction assertion. **Confidence:** High for contract mismatch; browser path not executed.

### AUTH-001 — P1 — Manager shift policy is contradictory

- **Description:** Central policy requires Managers to open operational shifts, while financial-writer comments state Manager/Owner retain authority without a till shift. Existing tests explicitly lock in Manager-required behavior, conflicting with the intended Owner/Manager exemption.
- **Evidence:** `src/lib/authz.ts:23-39`; `src/lib/staff-payments-write.ts:115-130`; offline tests report `manager lifecycle: requiresOperationalShift is true`.
- **Reproduction:** Manager without a shift opens an operational page or performs a guarded write.
- **Impact:** Manager workflows may be blocked unexpectedly and policy varies by module.
- **Recommendation:** Approve one role/action matrix; centralize shift requirement and distinguish operational presence from cash custody.
- **Complexity:** Medium. **Verification:** role/action matrix tests for all five roles with and without shifts. **Confidence:** High for code contradiction.

### DB-001 — P1 — Migration/deployed-schema compatibility is not provable

- **Description:** Schema evolution is split across 23 Prisma migrations and 13 Supabase SQL migrations, including overlapping HR/waiter objects. No current read-only production history/schema comparison was authorized in this audit.
- **Evidence:** local directory inventory; RLS DDL appears across both trees. The build loads `.env` but does not prove deployed tables/columns.
- **Reproduction:** Compare checksums, migration tables, columns, constraints, policies, and grants on a restored production backup.
- **Impact:** A successful build may deploy code that queries absent or differently constrained database objects.
- **Recommendation:** Establish one authoritative migration ledger; create a non-destructive reconciliation plan from a staging clone and backup.
- **Complexity:** High. **Verification:** `migrate status`, schema diff, policy/grant inventory, and application smoke tests on isolated staging. **Confidence:** High for local split; production mismatch unverified.

### SEC-002 — P1 — Public order creation lacks abuse controls

- **Description:** Public QR order POST has validation and server pricing but no request/IP/table rate limit, replay token, CAPTCHA/queue, or explicit body-size control in application code.
- **Evidence:** `src/app/api/public/orders/route.ts:11-32`; `src/lib/public-orders.ts:8-24,40-123`; no rate-limit library/reference found. Installed Zod also has a high memory-exhaustion advisory.
- **Reproduction:** Repeated valid POSTs with a known table token.
- **Impact:** Order spam, notification load, database growth, and resource exhaustion.
- **Recommendation:** Add proxy and application limits, per-table nonce/replay policy, bounded body handling, monitoring, and safe customer messaging.
- **Complexity:** Medium. **Verification:** load/abuse tests in staging. **Confidence:** High for absent application control; Hostinger edge controls unverified.

### SEC-003 — P2 — RLS deployment state and SECURITY DEFINER exposure are unverified

- **Description:** Local policy files enable RLS and use trusted `auth.uid()` lookup helpers, but many helpers are `SECURITY DEFINER`; actual production policies, ownership, search paths, and EXECUTE grants were not inspected.
- **Evidence:** `supabase/policies/00-helpers.sql:20-125`, `10-rls-enable-and-public.sql:17-95`, `20-operational-rls.sql:31-262`.
- **Impact:** A drifted policy/grant can expose cross-branch records or block valid operations.
- **Recommendation:** Read-only enumerate production RLS, function definitions/owners, search paths, and grants; revoke PUBLIC execute unless explicitly needed.
- **Complexity:** Medium. **Verification:** policy matrix using anon/authenticated/runtime roles. **Confidence:** Medium; this is an audit gap, not a confirmed exposure.

### QA-001 — P2 — Default tests omit database and browser behavior

- **Description:** `npm test` runs only `tests/offline.test.ts`. PostgreSQL suites exist but require authorized isolated environments; there is no browser E2E suite.
- **Evidence:** `package.json` scripts; 225/225 offline tests passed. DB suites were intentionally not run.
- **Impact:** Transaction, RLS, redirect, responsive UI, printing, and client/server route mismatches can escape.
- **Recommendation:** Add CI stages for disposable PostgreSQL, concurrency, Playwright role journeys, and production smoke tests.
- **Complexity:** High. **Verification:** enforced CI matrix. **Confidence:** High.

### PERF-001 — P2 — Polling and capped list reads lack operational measurement

- **Description:** Notifications poll every 20 seconds; public order tracking and waiter timers poll/refresh; cashier invoices fetch at most 150 with no pagination contract.
- **Evidence:** `src/components/layout/notifications-bell.tsx:68-84`, `src/components/order/order-status-tracker.tsx:38-60`, `src/components/waiter/waiter-board.tsx:629`, `src/lib/staff-invoices.ts:52-61`.
- **Impact:** Growing staff/session counts can amplify DB and Hostinger load; older invoices may become inaccessible.
- **Recommendation:** Add cursor pagination, visibility-aware polling/backoff, request metrics, and only then consider realtime.
- **Complexity:** Medium. **Verification:** load test and query telemetry. **Confidence:** High for pattern, performance impact unmeasured.

### ARCH-001 — P2 — Waiter module is highly coupled with stale API contracts

- **Description:** `waiter-board.tsx` combines navigation, POS state, orders, QR, transfers, actions, timers, and dialogs; route drift is already visible in missing serve/QR/item paths.
- **Evidence:** `src/components/waiter/waiter-board.tsx` exceeds 1,000 lines and contains fetches to endpoints absent from the route manifest; Table Workspace separately implements newer flows.
- **Impact:** Regressions and duplicate state/contracts are difficult to detect and test.
- **Recommendation:** Extract feature components behind typed server/client contracts after P0/P1 fixes, without duplicating cart state.
- **Complexity:** High. **Verification:** contract tests and role E2E. **Confidence:** High.

### DEPLOY-001 — P2 — Production runtime readiness is not evidenced

- **Description:** Local build passes, but current Hostinger runtime variables, connection pooling role, proxy headers, migration state, backups, monitoring, and recovery were not inspected.
- **Evidence:** `.env.example` names required variables; `next.config.ts:3-9` still describes a preview-oriented configuration; no current live inspection.
- **Impact:** Build success does not establish deploy/runtime safety or recoverability.
- **Recommendation:** Complete a read-only preflight checklist on Hostinger and Supabase, then test backup restore and rollback in staging.
- **Complexity:** Medium. **Verification:** signed deployment checklist and smoke trace. **Confidence:** High as a readiness gap.

### CFG-001 — P3 — Prisma configuration is deprecated

- **Description:** Prisma warns that `package.json#prisma` will be removed in Prisma 7.
- **Evidence:** `npx prisma validate` warning; schema validation itself passed.
- **Impact:** Future upgrade friction, not a current runtime failure.
- **Recommendation:** Move configuration to `prisma.config.ts` in an isolated upgrade.
- **Complexity:** Low. **Verification:** validate/generate/build without warning. **Confidence:** High.

### UX-001 — P3 — Physical receipt and accessibility verification is absent

- **Description:** 80mm receipt UI and print CSS exist, but physical XP80TS output, kiosk printing, keyboard/focus behavior, screen reader labels, and mobile browser flows were not tested.
- **Evidence:** `src/components/cashier/thermal-receipt-preview.tsx`; `src/app/globals.css`; no browser/hardware suite.
- **Impact:** Operational friction, clipped receipts, or inaccessible dialogs despite a successful build.
- **Recommendation:** Hardware/browser acceptance checklist across Arabic RTL, 80mm margins, page breaks, copies, and modal focus.
- **Complexity:** Medium. **Verification:** signed physical and accessibility test record. **Confidence:** High for missing verification.

## Validation results

| Check | Result |
|---|---|
| `npx prisma validate` | Passed; Prisma 7 config deprecation warning |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with zero warnings |
| `npm test` | Passed: 225 tests, 0 failures |
| `npm run build` | Passed; warning that Next ESLint plugin was not detected |
| `npm audit --omit=dev` | Failed: 1 critical, 5 high vulnerability records |
| PostgreSQL suites | Blocked: isolated target not proven in this audit |
| Browser E2E / printer hardware | Blocked: suite/hardware unavailable |
| Production DB/RLS/Hostinger inspection | Blocked: not authorized/currently unavailable |

## Production readiness

**NOT READY.** P0 findings must be closed first, followed by financial/inventory/Waiter P1 integration tests and an isolated schema/RLS deployment rehearsal.
