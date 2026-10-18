# Financial acceptance tests

`tests/financial-postgres.test.ts` is an opt-in, database-backed test of the real fixed-float service. It creates unique fixture branches, users, shifts, ledger rows, idempotency rows, and audit records, then removes only those fixture branches. It never runs migrations, truncates tables, or uses `.env` automatically. It performs a read-only financial-schema preflight before creating any fixture, so unapplied ledger migrations stop the run safely.

Run it only against a pre-migrated disposable PostgreSQL database or schema whose name contains `test`, `ci`, or `sandbox`. Set both variables to the exact same test-only URL in the process environment:

```powershell
$env:DATABASE_URL = '<isolated test URL>'
$env:SKOON_FINANCIAL_TEST_DATABASE_URL = $env:DATABASE_URL
npm run test:financial
```

For the existing shared development Supabase project, the same command is allowed only with the additional one-process acknowledgement below. The suite does not create roles or touch existing branches; it creates and deletes uniquely named fixture branches and their dependent records only.

```powershell
$env:SKOON_FINANCIAL_ACCEPTANCE_SHARED_DATABASE = 'allow-test-fixtures'
```

The project test scripts already load a test-process-only fallback for hosts affected by Node's `uv_os_get_passwd ENOMEM` bug. It does not alter system configuration and only supplies process-local user metadata when Node's native call fails. The equivalent direct command is:

```powershell
node --require ./tests/node-userinfo-workaround.cjs --import tsx --test --test-concurrency=1 tests/financial-postgres.test.ts
```

For migration work, set `DIRECT_URL` to a direct connection for that same isolated database; do not point it at production. The suite refuses to run if the two URLs differ or the target lacks a test identity. It covers baseline/advance/return/settlement invariants, return idempotency and changed-payload conflicts, concurrent requests, reversals, baseline fail-closed rules, administrative debit locking, operational-till separation, and branch/role isolation.
