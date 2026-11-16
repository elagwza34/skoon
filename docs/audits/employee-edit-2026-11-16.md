# Employee edit failure — 16 November 2026

The Owner's employee detail endpoint returned `500 Unable to load employee` because its response included raw Prisma BigInt fields: branch IDs, HR profile IDs, contract IDs and compensation history IDs. The route called `NextResponse.json` directly. The employee list already converted its identifiers, which explains why the list worked while editing failed.

Tracing the edit flow also exposed a missing `PATCH /api/staff/employees/[id]` handler and a validator rejecting `username: null`, which the existing form sends for an empty optional username.

## Resolution

- Use the existing `financialJson` HTTP serializer throughout employee endpoints. Dates and Decimal amounts retain their existing JSON representation.
- Add PATCH delegation to `updateEmployeeProfile`, preserving its Owner-only authorization, validation, transaction and audit entry.
- Accept a nullable optional username, matching the existing form and service behavior. An empty username does not remove an existing username.
- Keep manager branch scope and sensitive-field redaction unchanged.
- Cover post-commit JSON serialization for contracts and compensation so successful writes do not appear to fail.

## Regression evidence

`tests/employee-edit-offline.test.ts` executes the actual route handlers and employee read/update services with an isolated Prisma substitute and real HTTP JSON serialization. It reproduced the original 500, then exposed the missing PATCH handler, then the nullable username 400; all now pass. It covers nested identifiers, exact Decimal output, Owner cross-branch access, manager denial outside the branch, manager update denial, unauthenticated access, malformed JSON, and history-write response serialization.

The complete offline suite passed 437/437. Typecheck and lint passed. No employee or financial production records were modified during verification; this change requires no database migration.
