# Phase 0.5: Repository Audit & Implementation Plan

**Date:** 2026-10-10  
**Project:** Skoon — Cafe Management System  
**Branch:** `main` (tracking `origin/main`)  
**HEAD:** `c64844905084a38cca06f483f8dbe529da8a9999`

---

## 1. Executive Summary

Repository audit completed. Phase A (PostgreSQL migration) is complete. Phase B (Supabase foundation) is ready for implementation. TypeScript compilation currently fails with **4 errors** in the waiter module that must be fixed before Phase B can proceed.

---

## 2. Repository State

| Item | Value |
|------|-------|
| **Branch** | `main` (tracking `origin/main`) |
| **HEAD** | `c64844905084a38cca06f483f8dbe529da8a9999` |
| **Baseline commit** | `9c1cb2f6cd78024d6e74623fb3a89f2e72b637ec` |
| **Working tree** | Phase A changes uncommitted; Phase B files untracked |
| **Stack** | Next.js 15 + TypeScript 5.9 + React 19 + Prisma 6.12 + Supabase 2.117.3 |

---

## 3. Prisma Schema Audit

| Check | Result | Notes |
|-------|--------|-------|
| `provider` | ✅ `postgresql` | Was `mysql` (Phase A fixed) |
| `directUrl` | ✅ Present | Added for migrations (Prisma 6.x supports it) |
| `User.id` | ✅ `String @db.Uuid` | Matches Supabase Auth uid() |
| MySQL tokens | ✅ 0 remaining | All `@db.Unsigned*` removed |
| UUID FK columns | ✅ 8 | User.id + 7 FK columns |
| `pinCode` / `pinHash` | ✅ `pinHash` with `@map("pin_hash")` | Plaintext PIN never stored |
| Models | ✅ 26 | Unchanged since baseline |
| Prisma validate | ✅ Valid | Full schema validation passes |

---

## 4. Environment Audit

| Check | Result |
|-------|--------|
| `.env` contains real secrets | ✅ Yes (Supabase credentials) — **git-ignored** |
| `.env` tracked by Git | ❌ No (`.env` is git-ignored) |
| `.env.example` has placeholders | ✅ Yes — safe to commit |
| Secrets in source control | ✅ None (verified) |

---

## 5. TypeScript Audit (Critical Findings)

The waiter module has **4 TypeScript errors** blocking the build:

| # | File | Error | Description |
|---|------|-------|-------------|
| 1 | `src/app/(app)/waiter/page.tsx:1:10` | `TS2305` | `waiter-view` module has no exported member `WaiterView` |
| 2 | `src/components/waiter/waiter-view.tsx:49:36` | `TS2322` | `'needs_cleaning'` not assignable to `TableStatus` |
| 3 | `src/components/waiter/waiter-view.tsx:54:36` | `TS2322` | `'needs_cleaning'` not assignable to `TableStatus` |
| 4 | `src/components/waiter/waiter-view.tsx:90:3` | `TS2353` | `needs_cleaning` doesn't exist in `TABLE_STATUS_META` |

### Root Cause

`src/components/waiter/waiter-view.tsx` is **incomplete**:
- Contains data and utility functions only
- **Never exports a `WaiterView` component**
- `TableStatus` enum is missing the `needs_cleaning` variant
- `TABLE_STATUS_META` record is missing the `needs_cleaning` key

---

## 6. Files Created During Audit

| File | Status |
|------|--------|
| `src/app/(app)/waiter/page.tsx` | New (untracked) |
| `src/components/waiter/waiter-view.tsx` | New, incomplete (untracked) |
| `_diag.txt` | Audit log (untracked) |
| `_phase.txt` | Audit log (untracked) |
| `_state.txt` | Audit log (untracked) |
| `_tsc.txt` | Audit log (untracked) |
| `_tsc_summary.txt` | Audit log (untracked) |

---

## 7. Phase B Implementation Plan

### Phase B Goals
1. Fix TypeScript errors in waiter module
2. Implement Supabase foundation (RLS, auth, PIN security)
3. Complete validation and testing

### Checklist

#### 7.1 Fix TypeScript Errors
- [ ] Add `WaiterView` component export to `src/components/waiter/waiter-view.tsx`
- [ ] Update `TableStatus` enum to include `needs_cleaning`
- [ ] Add `needs_cleaning` entry to `TABLE_STATUS_META` record
- [ ] Run `npm run typecheck` → **0 errors**

#### 7.2 Prisma Schema
- [ ] **No schema changes required** — Phase A schema is correct
- [ ] Verify `prisma validate` → valid
- [ ] Verify `prisma generate` → succeeds

#### 7.3 Supabase Setup
- [ ] Create `supabase/migrations/` directory
- [ ] Write RLS policies (based on `docs/PHASE-B-SUPABASE-RLS-OWNER.md`)
- [ ] Enable RLS on all 24 operational tables
- [ ] Apply branch-scoped policies
- [ ] Create service-role auth middleware

#### 7.4 Authentication & Authorization
- [ ] Implement server-side Supabase client with cookie handling (`@supabase/ssr`)
- [ ] Create server Actions for login/logout
- [ ] Implement owner provisioning flow
- [ ] Add auth guards to protected routes

#### 7.5 POS PIN Security
- [ ] Implement bcrypt + pepper PIN hashing (server-only)
- [ ] Add `pin_hash` and `pin_updated_at` columns to `User` model
- [ ] Create PIN verification middleware
- [ ] Add tests in `tests/offline.test.ts`

#### 7.6 Validation
- [ ] `npm run typecheck` → 0 errors
- [ ] `prisma validate` → valid
- [ ] `prisma generate` → succeeds
- [ ] `npm test` → 15 offline tests pass
- [ ] Manual verification: waiter page renders

---

## 8. Conclusion

Phase A is complete and validated. Phase B foundation is ready for implementation. The TypeScript errors in the waiter module must be fixed first, then Phase B can proceed per the checklist above. The implementation follows existing project conventions (App Router, Server Components + Client Components, Zod validation, bcryptjs for PIN hashing).
