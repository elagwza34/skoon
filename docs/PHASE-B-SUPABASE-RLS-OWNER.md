# Phase B — Supabase Foundation, Secure POS PIN & Isolated RLS (Decision Record)

> **Status: design + offline code only. NOT executed against any database.**
> No migrations, no seeds, no real invitations, no deployment, no commits.
> Supabase client packages were installed; Prisma versions were **not** changed.

---

## 1. Verified starting state

| Item | Value |
|------|-------|
| Branch | `main` (tracking `origin/main`) |
| Baseline commit | `9c1cb2f6cd78024d6e74623fb3a89f2e72b637ec` (== baseline, unchanged) |
| Working tree (start) | Phase A changes uncommitted (from prior phase) |
| Real `.env` | present, git-ignored, **not read/modified in this phase** |
| Provider | `postgresql` with `directUrl = env("DIRECT_URL")` (Phase A) |

Phase A is **preserved**, not committed. Phase B builds on top of it.

---

## 2. Files created / modified (this phase)

### Created
| File | Purpose |
|------|---------|
| `src/lib/env.ts` | Public env validation (URL + anon key only) via Zod. |
| `src/lib/env.server.ts` | **Server-only** secrets validation (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`). Never imported by client code. |
| `src/lib/supabase/client.ts` | Browser Supabase client (anon key only). |
| `src/lib/supabase/server.ts` | Server Supabase client via `@supabase/ssr` cookie handling (anon key; RLS-respecting). |
| `src/lib/security/pin.ts` | POS PIN hashing/verification (bcrypt + pepper), server-only. |
| `src/lib/authz.ts` | Pure authorization helpers (role rank, branch access, permissions). |
| `tests/offline.test.ts` | Offline unit tests (`node:test`) — 15 tests, all pass. |
| `supabase/policies/00-helpers.sql` | `SECURITY DEFINER` role/branch helpers (read from `public.users`, never JWT). |
| `supabase/policies/10-rls-enable-and-public.sql` | Enable RLS on all 24 tables + public read-only menu/branch/table policies. |
| `supabase/policies/20-operational-rls.sql` | Staff operational policies (orders & sub-tables, payments read, tables, menu mgmt, user self-read). |
| `supabase/policies/30-sensitive-deny.sql` | Documented deny-by-default boundary (no grants). |
| `supabase/policies/README.md` | Apply order, security model, isolated-dev validation plan. |
| `docs/PIN-SECURITY-DESIGN.md` | POS PIN security design. |
| `docs/PHASE-B-SUPABASE-RLS-OWNER.md` | This document. |

### Modified
| File | Change |
|------|--------|
| `prisma/schema.prisma` | **Smallest safe change:** `pinCode String?` → `pinHash String? @map("pin_hash")` + `pinUpdatedAt DateTime? @map("pin_updated_at")`. Plaintext PIN is never stored. No migration applied. |
| `package.json` | Added `@supabase/supabase-js`, `@supabase/ssr`; added `test` + `typecheck` scripts. |
| `package-lock.json` | Lockfile updated by `npm install` (Supabase packages only). |
| `.env.example` | Added `POS_PIN_PEPPER` (server-only placeholder). |

---

## 3. Supabase package versions installed (exact)

| Package | Version |
|---------|---------|
| `@supabase/supabase-js` | `2.117.3` |
| `@supabase/ssr` | `0.12.7` |

Installed with the repo's existing package manager (`npm`), updating the lockfile.

### Prisma versions — UNCHANGED (verified in lockfile)
| Package | Version (unchanged) |
|---------|---------------------|
| `prisma` (CLI) | `6.12.0` |
| `@prisma/client` | `6.19.3` |

> Note (carried from Phase A): CLI 6.12.0 vs client 6.19.3 is a pre-existing
> mismatch, both within `^6.12.0`, and `directUrl` is supported by both. Not
> changed here per instructions. **Recommend aligning to one 6.x in a later,
> approved task.**
