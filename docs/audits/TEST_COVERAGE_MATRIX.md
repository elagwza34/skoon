# Test Coverage Matrix

## Executed checks

| Check | Result |
|---|---|
| Prisma validation | Pass; deprecation warning |
| TypeScript | Pass |
| ESLint (`--max-warnings=0`) | Pass |
| Offline Node tests | **225 passed, 0 failed** |
| Production build | Pass; Next ESLint-plugin warning |
| Dependency audit | Fail: 1 critical, 5 high records |

## Coverage matrix

| Area | Unit/offline | PostgreSQL integration present | Executed now | Browser E2E | Main gap |
|---|---|---|---|---|---|
| Authentication/routing | Good | Limited | Offline only | None | session expiry, redirect loops, unprovisioned identity |
| RBAC/branch scope | Good pure-policy cases | Partial | Offline only | None | endpoint-by-endpoint IDOR matrix |
| Owner/Manager | Partial | HR/service suites | No | None | real role journeys and shift policy |
| Cashier/payments | Good calculation/contracts | `cashier`, `financial` | No | None | concurrent settlement/refund/receipt |
| Waiter | Good policy/draft/adjustment | inventory suite | No | None | missing serve endpoint and full table workflow |
| Kitchen | Status-policy cases | inventory suite | No | None | timers/realtime/item transitions |
| QR ordering | Validation helpers | No dedicated suite | Offline only | None | abuse, variants/modifiers, concurrent orders |
| Inventory | Good pure policies | `inventory-postgres` | No | None | full concurrency/lifecycle matrix |
| HR/payroll | Good calculations | `hr-postgres` | No | None | posting and calendar edge integration |
| Shifts | Good arithmetic/policy | shift concurrency coverage exists | No | None | close/payment races |
| Notifications | Minimal | Indirect | No | None | delivery/read/realtime/load |
| Printing | Formatting checks | N/A | Offline only | None | 80mm hardware, copies, page breaks |

## Test-suite observation

`npm test` executes only `tests/offline.test.ts`; other test files are gated behind staging/authorized-environment scripts. This is safe but insufficient for release sign-off. Do not point those suites at production.

## Priority additions

1. Regression for eligible/ineligible invoice lines.
2. Settled invoice edit/delete denial.
3. Cashier item mutation plus reservations/waste.
4. Waiter ready-to-served client/server contract.
5. Public QR rate/replay/oversized-body cases.
6. Role-by-role Playwright matrix on mobile and desktop RTL.
7. Disposable PostgreSQL concurrency CI.
