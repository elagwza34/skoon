# Pre-Commit Review — Skoon (financial integrity + security + readiness)

- **Branch:** `main` — HEAD `e85eaad` == `origin/main` (synced; tree holds ~60
  uncommitted files from phased work; nothing staged/committed/pushed here).
- **Scope:** `src/lib/staff-payments-write.ts`,
  `src/lib/staff-inventory-write.ts`, `src/lib/staff-provision-write.ts`,
  `src/lib/staff-settings-write.ts`, pay/users/settings/inventory API routes,
  `OrdersBoard`, `StaffBoard`, `SettingsBoard`, `middleware.ts`,
  `staff-orders.ts`, `staff-waiter.ts`, `tests/offline.test.ts`.
- **Constraint honored:** no DB writes, no migrations, no schema edits, no
  commits/stages/pushes, no secret values printed.

## Checks actually run (this review)

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0 — clean after fixing 2 test-file errors |
| `npm test` (`node --import tsx --test`) | ✅ **21/21 pass, 0 fail** |
| `npm run build` | ✅ exit 0 — all routes compile incl. new pay/settings/users APIs |
| `npx prisma validate --schema prisma/schema.prisma` | ✅ "schema … is valid" (no schema change) |
| ESLint | ⚠️ skipped — no eslint config/binary in repo |
| Live DB integration / invitations / migrations | ⛔ BLOCKED by policy — not attempted; static verification only |

## Fixed in this review (isolated, low-risk, no schema change)

1. **F1 — invite rollback could delete a pre-existing auth user (P2→fixed).**
   `staff-provision-write.ts:161-168`: rollback deleted the auth user on ANY
   failure. Fix: delete ONLY when no profile row survived (checked first).
2. **F2 — "refund" wording could imply external money movement (P3→fixed).**
   NOTE comment in `staff-payments-write.ts` + button label now reads
   «استرداد (تسجيل داخلي — حركة الأموال الخارجية يدوية)».
3. **F3 — 2 type errors in `tests/offline.test.ts`** (zero-arg `tax_enabled`
   validator called with args). Fixed to `d.validate()`.

## Findings (open)

### P1 — HIGH
1. **No idempotency key on finalize (double-submit across retries).**
   `FOR UPDATE` blocks *concurrent* finalize, but a retried POST after a
   committed payment has no idempotency token (safe 409, poor UX).
   *Fix:* `Idempotency-Key` header + UNIQUE column (needs schema change +
   migration + approval), or document "refresh instead of retry".
2. **Re-collect after refund is currently POSSIBLE** (`paidAgg` counts only
   `status='completed'`, refunded rows excluded → outstanding returns to full
   total). Confirm business rule: intended? If not, add a guard.
3. **Money E2E untested on Postgres.** Interactive `$transaction` + row locks
   are correct in principle, but no live run has proven two concurrent
   cashiers or the refund race. *Gate:* staging race scripts before prod.

### P2 — MEDIUM
4. **Sub-cent totals (`total=10.005`) self-heal but over-collect half a cent.**
   `round2` outstanding vs stored total mismatch.
   *Fix:* enforce 2-decimal totals at order-creation write paths.
5. **Cancelled-status check sits OUTSIDE the payment lock** — a cancel racing
   a payment could pay a cancelled order. *Fix:* move the check inside the tx
   on the locked row (left unapplied: changes error precedence; owner call).
6. **Invite audit + profile creation are NOT in one transaction** (different
   systems: Supabase Auth vs Prisma). Best-effort rollback (F1) mitigates.
7. **Deactivation doesn't revoke existing JWTs** until expiry (`getStaffSession`
   filters `isActive:true` for new sessions). Acceptable V1 if documented.

### P3 — LOW
8. `PAYMENT_METHOD_LABELS` exported but unused (board has its own maps) —
   harmless dead export, cleanup candidate.
9. Reports must explicitly handle `refunded` orders (verify before prod).
10. Confirm `tsconfig.tsbuildinfo` is gitignored before committing.

## Security findings
- ✅ Service-role key read ONLY in `staff-provision-write.ts:adminClient()`
  (server lib → server routes only). Zero `eyJ…` literals in the tree.
- ✅ Middleware fail-closed: new `/api/staff/*` staff-only by default;
  public prefixes unchanged.
- ✅ Branch scoping on every money/inventory/staff write; role assignment
  resolved from DB `roles.slug`, never client claims.
- ✅ Manager→owner and cross-branch escalation blocked server-side;
  self-deactivation blocked.

## Financial-integrity verdict (per review item)

1. ✅ Outstanding from DB (`total − SUM(completed)`), never client input.
2. ✅ Concurrent finalize blocked by `SELECT … FOR UPDATE` inside the
   interactive `$transaction` (Postgres row lock held to commit).
3. ✅ Payment + `paymentStatus` + audit in ONE transaction (both flows).
4. ✅ Method enum + zod; amounts server-computed; cash `received ≥ outstanding`.
5. ✅ Cash change = `received − outstanding`; non-cash ignores `received`
   (`received` defaults to outstanding → change 0).
6. ✅ `NUMERIC(10,2)` storage + `round2` + `.toFixed(2)` on every write.
7. ✅ Cancelled (409) and already-paid (409) rejected; lock re-checks refund.
8. ✅ Refund: manager+, reason required, only `paymentStatus='paid'`,
   only `completed` rows flipped, double-refund impossible (guard + lock;
   second concurrent refund 409s on the locked re-read).
9. ⚠️ Refund = DB status only — now labeled as such in code + UI (F2).
10. ✅ Partial payments: explicitly rejected by design (outstanding must be
    covered in full); documented in header.
11. ✅ Audit rows carry actor (`userId`), branch, entity (`order`+id),
    action, and reason/amount — no PII beyond operator-provided names/emails
    already in the DB; no secrets.
12. ✅ Branch enforced on every query (`staffCanAccessBranch` + row branch
    used for writes, never client branch).
13. ✅ UI passes only method/received/reason; server re-authorizes everything.

## Tests still necessary before production
1. Staging concurrent-finalize + concurrent-refund race scripts.
2. Staging E2E: cash/card/online → refund → re-collect rule decision.
3. Branch-isolation negative tests (manager of B vs A's orders).
4. Invite flow with real service key (incl. rollback path).
5. Settings allowlist negative tests; reports `refunded` handling.

## Changed files in THIS review
- `src/lib/staff-provision-write.ts` (F1 conditional rollback)
- `src/lib/staff-payments-write.ts` (F2 refund-scope NOTE)
- `src/components/orders/orders-board.tsx` (F2 button label)
- `tests/offline.test.ts` (F3 zero-arg validator)
- `docs/audits/pre-commit-review.md` (new — this file)

## Verdict: **PASS WITH WARNINGS**

**Ready for a local commit (no push):** money paths are transactionally sound
under static analysis, authz is server-side throughout, no secret leaks, and
type/tests/build/prisma-validate are all green. The P1 items are
*pre-production* gates (live-race proof, idempotency decision, sub-cent
totals, shift model) — they need staging credentials and schema decisions
outside this review's scope. **Do NOT deploy to production before P1.3 and the
shift-model decision are resolved.**
