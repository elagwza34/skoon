# Operational fixes — Batch 1

Date: 2026-11-06 (Africa/Cairo). Repository: `D:\Sokoon`.

## Scope and outcome

Implemented AUD-01, AUD-02, AUD-04 and AUD-11 against the existing working tree on `main`, HEAD `cfe1b2334d90184eb4ceaedfbe0a20a160224752`.

The initial tree already contained 24 modified tracked files and untracked financial/table-workspace implementations, tests and reports. Their changes were inspected and retained. This batch adds focused changes to shared order services and their callers; it does not replace the existing workspace, handover or refund implementations.

| Issue | Implementation status | Verification boundary |
|---|---|---|
| AUD-01: quantity editing | FIXED | Executable quantity/API contract and workspace wiring checks pass; browser interaction remains unverified |
| AUD-02: untracked serving | FIXED | Real service and inventory-engine paths pass transaction-double tests; PostgreSQL concurrency/rollback acceptance BLOCKED |
| AUD-04: preparation dispatch bypass | FIXED | Item and legacy preparation gates pass service-double tests; authenticated API/E2E and PostgreSQL acceptance BLOCKED |
| AUD-11: missing fixture slug | FIXED | Required slug supplied; type checking and build pass; PostgreSQL fixture execution BLOCKED |

“FIXED” describes the implemented correction and the evidence below. It does not certify production behavior. Overall operational acceptance remains PARTIAL; production readiness is not established.

## Root causes and implementation

### AUD-01 — Numeric quantity editing

The workspace used `/^\\d+$/`, which matches a literal backslash followed by `d` characters instead of decimal digits. Valid input returned silently before reaching the adjustment endpoint.

Added the browser-safe `parseOrderItemQuantity` contract. It trims surrounding whitespace, accepts integer digit strings whose numeric value is 1–99, rejects malformed/sub-cent/fractional/signed/exponential/excessive input, and returns clear Arabic feedback. Invalid input is displayed through the existing alert. Cancelling the prompt performs no request.

Valid input still calls `/api/staff/orders/[orderId]/items/[itemId]/adjust` with `action: quantity`, numeric `targetQuantity`, reason, `expectedUpdatedAt`, and an idempotency key. The existing server remains authoritative for prepared-item additions/waste and stale-item rejection. Cashier branch-wide rights and waiter ownership policy are unchanged. The edit handler now also checks the existing in-flight ref and paid state before opening prompts; `act` retains its synchronous duplicate-submission guard.

### AUD-02 — Untracked item serving

The inventory engine populated operational `servedDeltas` only while processing ingredient reservations. Products without tracked stock had no reservation, so their `servedQuantity` never advanced.

The engine now derives menu-unit progress from authoritative, non-voided order lines independently of reservations. It validates requested line IDs, duplicate IDs, positive integer quantities and remaining units. Stock consumption still follows the existing proportional reservation, physical-layer and FIFO-cost paths. Each menu line advances once even when it has multiple ingredient reservations. Whole-order consumption uses only remaining menu units; waste mode does not advance serving quantities.

An absent reservation is not automatically treated as untracked: when a selected line has no active reservation, current product/variant/recipe demand is checked and a tracked line fails closed. This is not a historical inventory repair or an immutable catalog-demand snapshot redesign.

The serving service retains the order-row serialization point and now acquires/revalidates the active shift before that order lock. Branch, cashier paid-takeaway restriction and waiter emergency ownership are revalidated using the locked order. Inventory changes, menu-unit progress, order/history state, audit and durable response commit in one transaction.

#### Required retry contract

An order lock alone cannot distinguish a duplicated partial request from a new request for the same quantity. `serveOrderItems` now requires an `idempotencyKey` of 8–100 characters. It stores a fingerprint/result under the existing `FinancialOperation` unique key with operation type `order_items_serve`. No cash movement or financial calculation is added.

Same actor/branch/key/payload returns the saved response without another increment or stock movement. A conflicting payload returns 409. Successful committed responses can replay after terminal order state or shift close. An intentional later partial serving must use a new key. A new key cannot exceed the line's remaining prepared/unserved quantities.

Both serving route adapters forward the body key or `idempotency-key` header and preserve emergency intervention reasons. The POS caller retains its key for an unchanged request after an error, excludes already-served lines, and uses a synchronous in-flight ref. Existing direct PostgreSQL inventory test callers were updated. Missing keys now return a validation error: external/custom clients must adopt this contract rather than retrying keyless partial increments.

### AUD-04 — Kitchen dispatch gate

The item preparation writer previously checked role/branch/shift/status but did not require dispatch, QR approval or takeaway settlement. Kitchen UI visibility was therefore stronger than the API.

The writer now obtains the active shift's shared lock, verifies it remains open and belongs to the actor/branch, then locks the order. Under that lock it verifies branch, active preparation status, dispatch timestamp, QR approval when applicable, and full takeaway payment. Pending QR, undispatched and unpaid/partially paid takeaway orders fail before mutations.

The same dispatch predicate protects the legacy whole-order `preparing`/`ready` transitions; otherwise the status endpoint would remain an alternate bypass. Legacy transitions now revalidate their active shift under the same shift-before-order lock order. Legitimate dispatched dine-in, approved QR and paid takeaway preparation remain supported. No financial amounts/formulas were changed.

The existing dispatch and QR approval writers were reviewed: they retain reservation-at-dispatch/approval behavior. No pending QR stock reservation was introduced.

### AUD-11 — PostgreSQL fixture typing

The category fixture omitted Prisma's required `slug`. Added `test-drinks`; the category lives in a unique generated test branch, so its branch-scoped slug does not collide across runs.

Reviewed the remaining create inputs against generated Prisma types/schema. Added explicit prerequisite checks for cashier, waiter and kitchen roles before creating the branch, and added a kitchen actor for the new acceptance case. Existing branch/user/table/product defaults and explicit shift opening satisfy the local type gate. Actual deployed schema, role inventory, migration state and cleanup behavior remain unverified.

The suite retains its dedicated URL/ACK, loopback-host and exact-database-name guard, with no dotenv fallback, migrations or seeds. These syntactic guards are not proof that a loopback endpoint is not a production tunnel. Independent isolation verification is still mandatory.

## Exact files changed by this batch

| File | Change |
|---|---|
| `src/lib/order-item-quantity.ts` | New browser-safe parser and Arabic validation contract |
| `src/components/waiter/waiter-table-workspace.tsx` | Use parser; display errors; preserve adjustment contract and edit guards |
| `src/lib/staff-inventory-engine.ts` | Separate menu progress from reservation existence; validate untracked/missing-reservation cases |
| `src/lib/staff-orders.ts` | Locked preparation gates; legacy gate; serving retry contract and locked revalidation |
| `src/app/api/staff/orders/[id]/status/route.ts` | Forward serving retry key and intervention reason |
| `src/app/api/staff/orders/[id]/items/serve/route.ts` | Forward the same serving contract |
| `src/components/pos/pos-checkout.tsx` | Stable serving attempt key, in-flight guard and unserved-line selection |
| `tests/operational-batch-1-offline.test.ts` | New regression suite |
| `tests/table-workspace-postgres.test.ts` | Required category slug, role prerequisites, authored dispatch/untracked-serving acceptance |
| `tests/inventory-postgres.test.ts` | Update serving keys and assert tracked partial replay does not consume twice |
| `package.json` | Add new offline suite to the existing test command |
| `docs/audits/OPERATIONAL_FIXES_BATCH_1.md` | This report |

Prisma schema, migration files, cash refund/handover services, financial formulas, and dependencies were not changed by this batch. Existing modifications in those areas remain in the working tree.

## Regression coverage

New offline suite: **49 tests**.

- Quantity: valid values and boundaries; whitespace; zero/negative/fractional/exponential/hex/signed/malformed/excessive values; Arabic errors; compatibility with the real adjustment Zod schema; source wiring to the existing adjustment endpoint and guards.
- Serving: untracked partial/final; tracked partial/final; mixed lines; multiple ingredient reservations; same-key concurrent retries in the double; conflicting-key payload; terminal/closed-shift replay; missing key; duplicate line; unready/over-serving; missing tracked reservation; insufficient stock; exact zero stock; competing distinct operations; audit-failure rollback; role/branch/shift checks.
- Preparation: undispatched, pending QR, unapproved QR, unpaid/partial takeaway; valid dine-in/takeaway/QR start and ready; role/branch/shift; dispatch/payment/branch/QR changes between preflight and transaction; legacy dispatch and payment gates; audit-failure rollback.
- Contracts: both serving adapters, POS key/in-flight wiring, and fixture slug/prerequisite checks.

These tests invoke production services and the actual inventory engine through explicit in-memory transaction doubles. Quantity wiring checks are contract/source checks, not rendered browser tests. Promise queues and simulated rollback do not establish PostgreSQL isolation or rollback behavior.

Authored but NOT EXECUTED PostgreSQL coverage includes untracked partial serving, concurrent same-key replay, final completion with no inventory movements, and preparation rejection before dispatch. Existing tracked acceptance now checks replay as well. No PostgreSQL suite was invoked, including in skip mode.

## Actual validation results

| Check | Result |
|---|---|
| New offline regression suite | 49 passed in final combined run; no failed/skipped tests |
| All existing offline suites plus new suite and staff provisioning | **378 passed, 0 failed, 0 skipped; exit 0** |
| TypeScript `--noEmit --incremental false` | PASS, exit 0 |
| ESLint `--max-warnings=0` | PASS, exit 0 |
| Prisma schema validation | PASS, exit 0 |
| Production compilation/build | PASS, exit 0 |
| `git diff --check` | PASS, exit 0; line-ending warnings only |
| PostgreSQL integration/concurrency | BLOCKED — no independently verified isolated target |
| Authenticated browser/API E2E | BLOCKED — no isolated acceptance environment exercised |

Commands:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js . --max-warnings=0
node node_modules/prisma/build/index.js validate
node --require ./tests/node-userinfo-workaround.cjs --import tsx --test --test-reporter=tap tests/offline.test.ts tests/cash-handover-offline.test.ts tests/cash-refund-offline.test.ts tests/table-workspace-offline.test.ts tests/operational-batch-1-offline.test.ts tests/staff-provision-offline.test.ts
node --require ./tests/node-userinfo-workaround.cjs node_modules/next/dist/bin/next build
git diff --check
```

The build script, Next configuration, environment consumers and local font setup were inspected before building. Build and validation database URLs were overridden in the child shell to an unreachable loopback endpoint. Build Supabase URL/key, service-role key, cron secret, PIN pepper and application URLs were replaced with invalid/local placeholders; Next telemetry was disabled. No env file was edited or printed. Next/Prisma reported reading `.env`, but the production database/Auth variables were overridden. The generated `.next` build contains placeholder configuration and is validation-only, not a deployment artifact.

Existing warnings: package-level Prisma configuration deprecation, Next ESLint plugin detection, and webpack cache serialization warnings. These were not suppressed or “fixed” by changing dependencies.

## Remaining defects and acceptance blockers

This batch does not resolve the other November 6 findings: QR customer-session binding/replay and item review, product configuration selection, manager/Owner cash custody, tax creation, report aggregation/refund-date consistency, invoice configuration bypass, public rate limits, transfers/refund UX, printing or migration-history reconciliation.

Additional acceptance requirements:

1. Independently provision/verify an isolated PostgreSQL instance with the actual compatible schema and required role rows. Do not run either integration suite against credentials inferred from `.env`.
2. Exercise tracked/untracked/mixed serving with concurrent requests, real row locks, audit failure, stock boundaries, preparation/close races, and rollback. A fresh key denotes a distinct intended serving operation; client retries must retain their original key.
3. Exercise authenticated role/branch/shift denials through both route adapters, including legacy preparation and emergency waiter service.
4. Verify browser prompts/Arabic errors, cashier and waiter quantity editing, prepared-item restrictions, double-clicks, stale updates and lost-response recovery on tablet/mobile/desktop.
5. Verify actual migration/schema prerequisites; no schema or historical data repair was attempted here.

No production database access, migrations, seeds, resets, backfills, historical rewrites, commits, pushes, merges or deployments occurred. No production-readiness claim is made.
