# Skoon release-blockers remediation

Date: 2026-10-24
Scope: local fixes and read-only verification only. No Supabase migration, data, permission, migration-history, or deployment change was made.

## Decision

**NO-GO.** The Cairo build dependency was remediated locally, but waiter migration history drift, deployed Prisma-role verification, isolated PostgreSQL behavior tests, legacy-order decisions, and a definitive host build exit code remain release blockers.

## A. Cairo production-build failure

### Root cause and evidence

`src/app/layout.tsx` imported `Cairo` from `next/font/google`. The prior production build failed during compilation with `next/font` unable to fetch Cairo from Google Fonts and `EACCES`. There were no Cairo assets in the repository before this remediation. This is a build-time external-font fetch dependency; it is not evidence that the application font CSS, database, or business code failed.

### Fix applied

- Bundled the official upstream Cairo variable font as `public/fonts/Cairo-Variable.ttf`.
- Bundled its SIL Open Font License 1.1 text as `public/fonts/Cairo-OFL.txt`.
- Added provenance and SHA-256 (`667C987182391C91F4E57A2F455B1794FB5E3EE6CA4EF3383E86BB690FA9C964`) in `public/fonts/README.md`.
- Replaced `next/font/google` with `next/font/local` in `src/app/layout.tsx`, preserving Cairo, `display: 'swap'`, Arabic RTL, and the existing generated class-based font integration.

The subsequent build compiled, type-checked, generated all 11 static pages, finalized optimization, and collected build traces without a Cairo fetch error. However, the local runner did not return to the PowerShell wrapper to print `BUILD_EXIT`; it must remain **UNVERIFIED**, not passed. Read-only process listing showed many live `node.exe` processes, but command-line inspection was denied by Windows, so no process was terminated or attributed to Skoon.

### Build-exit verification attempt

On 2026-10-24, a read-only process-tree check confirmed that the live Node/cmd
processes belonged to Hostinger MCP connectors, not Skoon or `next build`.
With no Skoon build active, the exact build process started was:

```powershell
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', 'npm.cmd run build') `
  -WorkingDirectory 'D:\سكون' -RedirectStandardOutput '<TEMP>\stdout.log' `
  -RedirectStandardError '<TEMP>\stderr.log' -PassThru
```

Its captured stdout reached the final Next.js route manifest (including
`/waiter`) after successful compilation, page-data collection, all 11 static
pages, optimization, and build traces. Stderr held only the existing ESLint
plugin and `metadataBase` warnings. The started cmd process was later observed
as exited. The tool host, however, detached before the `Start-Process` object
could return its `ExitCode`; subsequent attempts to launch a wrapper that
writes an exit-code file were interrupted by the same host behavior before a
PID/log directory could be emitted. Therefore no actual exit code or precise
end timestamp exists and the result remains **BUILD UNVERIFIED**.

This is not a Cairo failure: no Google-Fonts request or `next/font` error
appeared in the new log. Re-run the same command in CI or an interactive
PowerShell session that retains the child process handle, then record its
`$process.ExitCode`, start/end timestamps, and duration. Do not mark release
build PASS until it is `0`.

## B. Waiter migration history drift

### Verified remote state

Read-only Supabase MCP checks confirmed project `bkgxjutnfkslpgshufhb` (`skoon`, `eu-west-1`, PostgreSQL 17.11, `ACTIVE_HEALTHY`). The deployed Waiter operational tables exist:

- `order_responsibility_history`
- `order_table_transfers`
- `waiter_shift_handovers`

The new Phase 2 review/audit tables do **not** exist. Remote migration history contains no `20261024100000` or `20261024110000` entry. Local migration ordering is chronological, but both Waiter migration files are currently untracked. The remote ledger also lacks several other local migration filenames, so migration history cannot be inferred from filenames alone.

### Required procedure — not executed

1. Re-run the schema-equivalence matrix and preserve a dated record.
2. Obtain provenance evidence from Supabase/CI activity logs if available; otherwise record origin as unknown.
3. Resolve all earlier local-versus-remote migration discrepancies before treating local filenames as deploy order.
4. Obtain written Owner approval specific to **metadata-only** repair of version `20261024100000` on the confirmed project.
5. Use the official Supabase CLI repair workflow to mark only that version applied. Never manually insert migration history, replay the non-idempotent SQL, use Prisma migration commands, or repair `20261024110000`.
6. Re-run migration-list and read-only catalog verification. Only then separately review and approve the Phase 2 reconciliation migration.

`20261024110000_waiter_order_reconciliation_reviews.sql` is additive but depends on the already-deployed Waiter objects. It remains local and unapplied.

## C. Prisma runtime role

Local configuration is a PostgreSQL pooler setup: `DATABASE_URL` targets port 6543 and `DIRECT_URL` targets port 5432; secrets were not displayed. This only describes the local `.env`, not the deployed service configuration.

The read-only MCP query ran as `postgres`; it cannot prove the actual deployed Prisma role. The deployed role remains **UNVERIFIED**.

### Minimal safe verification procedure

From the deployed runtime connection path, with no credentials printed, run a read-only query that returns:

```sql
select current_user, session_user;
select has_table_privilege(current_user, 'public.order_responsibility_history', 'select,insert,update'),
       has_table_privilege(current_user, 'public.order_table_transfers', 'select,insert,update'),
       has_table_privilege(current_user, 'public.waiter_shift_handovers', 'select,insert,update');
select has_sequence_privilege(current_user, 'public.order_responsibility_history_id_seq', 'usage'),
       has_sequence_privilege(current_user, 'public.order_table_transfers_id_seq', 'usage'),
       has_sequence_privilege(current_user, 'public.waiter_shift_handovers_id_seq', 'usage');
select 1 from public.order_responsibility_history limit 0;
select 1 from public.order_table_transfers limit 0;
select 1 from public.waiter_shift_handovers limit 0;
```

Do not compensate for a failed result with broad grants or RLS changes.

## D. PostgreSQL integration readiness

No disposable Supabase branch exists. The existing `with-authorized-test-env.cjs` permits the named shared project and is **not proof of isolation**; it must not be used for mutation tests while this project is considered production.

No dedicated Waiter PostgreSQL suite currently exists. Prepare it against a verified disposable database with fixture prefixes and `try/finally` cleanup limited to created fixture IDs. Required cases:

1. Two QR claims: exactly one succeeds; approval/rejection actor checks.
2. Manager reassignment and responsibility-history record.
3. Handover acceptance/rejection and shift-close refusal while responsibility remains.
4. Table-transfer conflict against an occupied destination.
5. Ready-only emergency serving with reason; no duplicate serving, inventory movement, or payment.
6. Cross-branch and closed-shift denial.
7. Cashier and kitchen regression assertions that no payment/inventory record duplicates.

## E. Legacy reconciliation preview

The Phase 2 panel is still preview-only. Its policy requires Owner/Manager review, non-historical eligibility, a reason, and a same-branch active Waiter with an open shift for assignment proposals. It blocks historical/paid/cancelled/completed orders; approval is deliberately separate from execution. The proposed data model has status transitions and a partial unique index to prevent two actionable reviews per order, but it is not deployed and no production approval/assignment endpoint exists.

## Local verification

| Command | Exit/result |
| --- | --- |
| `npx.cmd prisma validate` | PASS, exit 0 |
| `npm.cmd run typecheck` | PASS, exit 0 |
| `npm.cmd run lint` | PASS, exit 0 |
| `npm.cmd test` | PASS, exit 0 — 101 passed, 0 failed/skipped |
| `npm.cmd run build` | UNVERIFIED — no Cairo error; stdout reached final route manifest, but the host did not return an exit code |
| `git diff --check` | PASS, exit 0 (only pre-existing CRLF warnings) |

## Files changed by this remediation

- `src/app/layout.tsx`
- `public/fonts/Cairo-Variable.ttf`
- `public/fonts/Cairo-OFL.txt`
- `public/fonts/README.md`
- `docs/SKOON_RELEASE_BLOCKERS_REMEDIATION.md`

Other uncommitted Waiter, HR, inventory, and dashboard changes predate this remediation and were preserved.

## External prerequisites and next actions

1. Resolve/identify the Skoon-owned Node/Next build workers, then run the build in CI or a stable runner and capture exit 0.
2. Obtain a disposable PostgreSQL target before writing integration fixtures.
3. Verify the actual deployed Prisma role using the read-only procedure above.
4. Obtain explicit approval for metadata-only repair only after the migration-history reconciliation evidence is complete.
5. Re-run the legacy read-only order report and obtain human decisions; do not auto-assign any order.
