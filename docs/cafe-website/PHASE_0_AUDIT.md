# PHASE_0_AUDIT — SKOON Premium Café Landing Page

**Project:** SKOON (D:\Projects-code\Sokoon)  
**Scope:** Read-only audit before implementing the approved premium café landing page.  
**Constraint:** No application code changes. No database or migration changes. No production access. No deployment or Git push.  
**Status:** Draft — for review before implementation.

---

## 1. Executive Summary

The SKOON repository is a Next.js (App Router) + TypeScript + Prisma + Supabase Auth café operations platform. It already contains a minimal public guest landing page (`/`) backed by `PublicBackdrop` (Pexels photo + orange/dark overlay) with a disabled CTA ("أبدأ طلبك الآن") and a "QR coming soon" note. The guest flow currently lives at `/order-type` → `/select-table` → `/menu/[token]`, backed by public QR order creation (`POST /api/public/orders`) and waiter-side claim/approve (`/api/staff/qr/orders`).

The landing page is intentionally static and disabled. The premium café landing page should be built as a real replacement for `/` (within the `(public)` route group), reusing the existing brand assets, Cairo font, RTL layout, theme tokens, and public API surface — without touching any staff route, middleware, or database schema.

---

## 2. Route Preservation Matrix

The following routes MUST be preserved unchanged. The landing page work must not alter, remove, or redirect any of them.

| Route | Group | Purpose | Public? | Preserve? |
|---|---|---|---|---|
| `/` | root | Landing page | Yes | **Yes** (replace only the landing UI) |
| `/login` | root | Staff sign-in | Yes | Yes (unchanged) |
| `/order-type` | (public) | Guest order mode picker (dine-in/takeaway) | Yes | Yes |
| `/select-table` | (public) | Guest manual table picker | Yes | Yes |
| `/menu/[token]` | (public) | QR menu + cart + order submit | Yes | Yes |
| `/order/[id]?n=` | (public) | Customer order tracking | Yes | Yes |
| `/api/public/orders` | api | Public QR order creation (POST) | Yes | Yes |
| `/api/public/service-requests` | api | Public service requests (POST) | Yes | Yes |
| `/api/staff/*` | api | Staff JSON APIs (fail-closed) | No | Yes (untouched) |
| `/(app)/*` | (app) | Staff shell (waiter, cashier, kitchen, pos, owner, manager, tables, shifts, products, reports, settings) | No | Yes (untouched) |
| `/api/staff/qr/orders` | api | Waiter claim/approve QR orders | No | Yes |
| `/(app)/waiter/tables/[tableId]` | (app) | Waiter single-table workspace | No | Yes |

**Preservation rule:** The new landing page lives under `/` only. No `(app)` route, no `/api/staff/*` route, no middleware entry, and no Prisma model is modified.

---

## 3. Existing Public Flow (Reference for Integration)

### 3.1 Landing (`/`)
- `src/app/(public)/page.tsx` — `LandingPage`
- Full-screen `PublicBackdrop` (Pexels photo id `302899`, orange/dark overlay)
- `SOKOON` title, `/logo.png` image
- Disabled CTA button ("أ開始 طلبك الآن")
- `ResumeOrderButton` (saved order ref)
- Copy: "الطلب من خلال ال QR سيكون متاح قريباً" (QR ordering coming soon)

### 3.2 Guest order flow
1. `/order-type` — guest picks "داخل الكافيه" (dine-in, live) or "تيك أواي — قريباً" (takeaway, disabled)
2. `/select-table` — lists active, non-deleted `cafeTable` rows with `publicToken`; links to `/menu/${publicToken}`
3. `/menu/[token]` — `MenuPage` resolves token via `getTableByToken(token)`, loads `getPublicMenu(table)`, renders `MenuOrderView`
4. `POST /api/public/orders` — `createPublicOrder` (server-side pricing, Zod validation, idempotency, status `pending`, notifies waiters)
5. `/order/[id]?n=<orderNumber>` — `getPublicOrder(id, orderNumber)` (double-guarded against enumeration), `OrderStatusTracker`

### 3.3 Waiter acceptance (existing, must remain intact)
- `GET /api/staff/qr/orders` — lists unclaimed pending QR orders for the waiter's branch (requires open shift)
- `POST /api/staff/qr/orders` — waiter claims a QR order (`claimQrOrder`)
- Approve/reject via `approveQrOrder` / `rejectQrOrder` in `src/lib/staff-waiter-operations.ts` (atomic transaction, inventory reservation, kitchen notification, merge-to-existing-order logic)
- Waiter single-table page: `src/app/(app)/waiter/tables/[tableId]/page.tsx` → `WaiterTableWorkspace`

---

## 4. Authentication, Middleware & Role Redirects

### 4.1 Middleware (`src/middleware.ts`)
- **Fail-closed:** every path is staff-only unless in `PUBLIC_PREFIXES` (`/`, `/login`, `/order-type`, `/select-table`, `/menu`, `/order`, `/api/public`, `/_next`, `/favicon.ico`, `/robots.txt`, `/logo.png`, `/receipt-logo.png`)
- Refreshes Supabase session cookies via `@supabase/ssr`
- Unauthenticated + staff path → 401 JSON (API) or redirect to `/login?next=...`
- Sets `x-pathname` and `x-request-id` request headers for server components
- `getPublicEnv()` validates `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; misconfiguration degrades gracefully (login page shows `reason=config`)

### 4.2 Session & authorization (`src/lib/session.ts`, `src/lib/authz.ts`, `src/lib/route-access.ts`)
- Supabase Auth owns identity; `public.users` (Prisma, DIRECT_URL) owns role/branch/permissions
- `getStaffSession()` resolves trusted session; first-run owner bootstrap when `public.users` is empty
- Roles: `owner` (branchId null, cross-branch), `manager`, `cashier`, `waiter`, `kitchen`
- Route access matrix in `ROUTE_PERMISSION`; `canSeeRoute()` is pure and shared by sidebar + server guard
- `(app)` layout (`src/app\(app)/layout.tsx`) re-validates `canSeeRoute` server-side on every request; operational roles routed to their boards (`/waiter`, `/kitchen`, `/cashier`, `/pos`)
- Operational shift required for cashier/waiter/kitchen/manager before branch work (`requiresOperationalShift`)

### 4.3 Public API surface
- `/api/public/*` paths are excluded from staff auth in middleware (`isStaffApiPath` returns false for them) — no session required
- All public writes are server-priced (client prices never trusted); Zod validation on all inputs

---

## 5. Product Categories, Variants, Images & Prices

### 5.1 Schema (read-only, `prisma/schema.prisma`)
Relevant models: `CafeBranch`, `Category`, `Product`, `ProductVariant`, `ProductOption`, `ProductOptionValue`, `CafeTable` (has `publicToken`).

- `Product` fields: `id` (BigInt), `name`, `price` (Decimal), `categoryId`, `isActive`, `deletedAt`, `imagePath` (nullable String), `variants`, `optionAssignments`
- `Category`: `id`, `name`, `sortOrder`, `branchId`, `isActive`, `deletedAt`
- `ProductVariant`: `id`, `combinationKey`, `price`, `isActive`, `isAvailable`, `archivedAt`, `values`
- `Product.imagePath` — nullable string; used by public menu (`getPublicMenu` selects `imagePath`)
- Pricing: `NUMERIC(10,2)` money; server-side only in `createPublicOrder` and `getPublicMenu`

### 5.2 Public menu endpoint (`src/lib/public-menu.ts`)
- `getTableByToken(token)` — validates `TABLE_TOKEN_RE`, loads `cafeTable` + `branch`, enforces `isActive` and `deletedAt` null and branch active; returns `PublicTable` with `publicToken`
- `getPublicMenu(table)` — active categories + active/available products per branch; returns `PublicMenuProduct[]` with `imagePath`
- No variants or modifiers exposed in the public menu (products with variants/required options throw "هذا المنتج يحتاج اختيارات؛ اطلبه من النادل" at order time)

### 5.3 Images
- `public/logo.png`, `public/receipt-logo.png`, `public/fonts/Cairo-Variable.ttf`
- `PublicBackdrop` pulls `pexels(BACKGROUND_ID, 1920)` → `https://images.pexels.com/photos/302899/...`
- `next.config.ts` `images.remotePatterns` allow-lists `images.pexels.com` and `skooncafe.com`
- Product images are stored as `imagePath` strings (no evidence of an external product-image CDN allow-list beyond `skooncafe.com/images/**`)

---

## 6. QR Table-Ordering & Waiter Acceptance

### 6.1 Guest creates QR order
- `POST /api/public/orders` → `createPublicOrder` (`src/lib/public-orders.ts`)
- Zod schema: `token`, `customerName` (1-60), `customerPhone` (optional regex), `items` (1-30, qty 1-20), optional `idempotencyKey`
- Rejects products with variants or required options ("اطلبه من النادل")
- Creates order with `status='pending'`, `source='qr'`, `paymentStatus='unpaid'`
- Does NOT occupy the table until waiter approves
- Notifies `ROLE.WAITER` of the branch via `notifyRole`
- Idempotency via `financialOperation` table (actor `public-qr`, operation `qr_order_create`)

### 6.2 Waiter claim & approve
- `GET /api/staff/qr/orders` — list unclaimed pending QR orders (waiter + open shift required)
- `POST /api/staff/qr/orders` — claim (`claimQrOrder`, row-level lock `FOR UPDATE`)
- Approve (`approveQrOrder`): reserves inventory, transitions `pending` → `new`, sends to kitchen (`sentToKitchenAt`), notifies kitchen; if table already has an open dine-in order, appends QR items to it and cancels the pending QR order
- Reject (`rejectQrOrder`): cancels with documented reason

### 6.3 Waiter table workspace
- `src/components/waiter/waiter-table-workspace.tsx` — `WaiterTableWorkspace`
- Adds items to an open table order via `POST /api/staff/orders/[id]/items/append` or creates via `POST /api/staff/pos/orders`
- Edit/void items, send to kitchen, view invoice/history/kitchen progress

---

## 7. Operational Authorization & Security

### 7.1 Defense-in-depth layers
1. Middleware: identity + fail-closed path protection + cookie rotation
2. `(app)` layout: server-side `requireStaffSession` + `canSeeRoute` guard + operational-role board redirect
3. Per-route page guards: `requirePageAccess(pathname)` on every `(app)` page
4. API routes: `getStaffSession()` + role/branch checks + `staffCanAccessBranch`
5. Business logic: `OrderError` with HTTP statuses, row-level `FOR UPDATE` locks, advisory locks for transfers/handovers, audit log on every mutation

### 7.2 Public surface risks
| Risk | Detail | Severity | Mitigation (existing) |
|---|---|---|---|
| Order ID enumeration | `/order/[id]` could be guessed | Medium | Double guard: requires `id` + `n` (orderNumber) |
| Token enumeration | `/menu/[token]` could be brute-forced | Low | `TABLE_TOKEN_RE` regex; returns `notFound` for inactive/deleted; no table metadata leaked |
| Client price tampering | Guest sends custom prices | Low | All pricing server-side from DB in `createPublicOrder` |
| QR order spam | Unlimited public POST | Medium | Zod validation (items 1-30, qty 1-20), idempotency key, table occupancy check |
| Image hotlink / broken images | `next/image` blocks unlisted hosts | Low | `remotePatterns` allow-list; `dangerouslyAllowSVG: false` |
| Auth config drift | Missing `NEXT_PUBLIC_SUPABASE_*` breaks middleware | Medium | `getPublicEnv()` throws; middleware degrades to `reason=config` on `/login` |

### 7.3 Landing-page-specific considerations (for implementation)
- The landing page is in `(public)` group — no session, no sidebar, no header
- Must remain RTL (`dir="rtl"`, `lang="ar"`), use Cairo font from `next/font` (bundled locally, no `fonts.googleapis.com` outbound)
- Must respect `images.remotePatterns` if using `next/image` for external photos (Pexels allow-listed; `skooncafe.com/images/**` allow-listed)
- Theme uses `skoon-theme` localStorage key (`light`/dark class on `<html>`)
- Metadata base currently `https://sokooncafe.com`; `APP_URL` env is `https://skoon.awexen.com` — verify canonical URL for the landing page

---

## 8. Exact Implementation Plan

All work is confined to the `(public)` route group and `public/` assets. No `(app)`, `/api/staff/*`, middleware, or Prisma changes.

### Phase 1 — Landing page shell (`/`)
1. Replace `src/app/(public)/page.tsx` (`LandingPage`) with a premium café landing:
   - Keep `PublicBackdrop` (Pexels `302899` + orange/dark overlay) or swap to a café-specific hero image under `public/` (verify `next.config.ts` allow-list for any new host)
   - Keep `/logo.png`, Cairo font, RTL, theme tokens
   - Enable the CTA ("أbegin طلبك الآن") linking to `/order-type`
   - Keep `ResumeOrderButton`
   - Remove "QR coming soon" note (QR is live) or replace with value proposition
   - Add sections: brand story, menu preview (categories from `getPublicMenu`? No — landing is static; link to `/order-type` for live menu), featured items, contact/hours
   - Metadata: update `title`/`description`/`openGraph` in `src/app/layout.tsx` if needed (shared root layout — verify no staff impact)

### Phase 2 — Guest flow polish (optional, within scope)
2. Review `/order-type`, `/select-table`, `/menu/[token]`, `/order/[id]` for visual consistency with the premium landing
3. Ensure `PublicBackdrop` and `Button`/`Card` components match the landing design system

### Phase 3 — Verification (read-only)
4. `npx tsc --noEmit` — typecheck (no emit, no DB)
5. `npx eslint . --max-warnings=0` on touched files only
6. Confirm no `(app)` or `/api/staff/*` files were modified (`git diff --stat` should show only `(public)` and `public/` changes)
7. Confirm `prisma/schema.prisma` is untouched

### Deliverable boundaries
- **In scope:** `src/app/(public)/page.tsx`, `src/components/public/*` (new landing components), `public/` assets, `src/app/layout.tsx` metadata (optional)
- **Out of scope:** `src/app/(app)/*`, `src/app/api/staff/*`, `src/middleware.ts`, `prisma/schema.prisma`, `src/lib/*` business logic

---

## 9. Blockers & Readiness Verdict

### Blockers
1. **No product images in `public/`:** Only `logo.png` and `receipt-logo.png` exist. Product `imagePath` values come from DB; no evidence they are populated or hosted on an allow-listed domain. A premium landing featuring product photos needs either (a) images added to `public/` and referenced, or (b) `next.config.ts` `remotePatterns` extended for the image host. Both are implementation decisions, not audited here.
2. **Canonical URL ambiguity:** Root metadata uses `https://sokooncafe.com`; `.env.example` `APP_URL` is `https://skoon.awexen.com`. Landing page canonical/openGraph URLs should use one consistent value.
3. **Pexels dependency:** `PublicBackdrop` relies on `images.pexels.com` (allow-listed). If Pexels is unavailable at build/runtime, the hero image breaks. A self-hosted hero image under `public/` is more robust for a premium landing.
4. **Takeaway disabled:** `/order-type` shows takeaway as disabled ("قريباً"). The landing CTA should not promise takeaway until the backend lands.

### Readiness Verdict
**READY — with conditions.**

The repository has a complete, authenticated staff operations platform and a functioning public QR ordering flow. The landing page can be implemented as a read-only UI replacement of `src/app/(public)/page.tsx` within the `(public)` group, preserving all staff routes, middleware, APIs, and the Prisma schema.

Conditions before implementation:
1. Confirm the canonical URL (`sokooncafe.com` vs `skoon.awexen.com`) for metadata.
2. Decide on hero/product image hosting and update `next.config.ts` `remotePatterns` if using an external host not already allow-listed.
3. Do NOT modify `src/middleware.ts`, `src/app/(app)/*`, `src/app/api/staff/*`, or `prisma/schema.prisma`.

---

## 10. File Inventory Audited (read-only)

| File | Role | Audited? |
|---|---|---|
| `src/middleware.ts` | Route protection, session refresh | Yes |
| `src/app/layout.tsx` | Root layout, metadata, Cairo font, theme | Yes |
| `src/app/(public)/layout.tsx` | Public group layout | Yes |
| `src/app/(public)/page.tsx` | Landing page | Yes |
| `src/app/(public)/order-type/page.tsx` | Guest order mode picker | Yes |
| `src/app/(public)/select-table/page.tsx` | Guest table picker | Yes |
| `src/app/(public)/menu/[token]/page.tsx` | QR menu page | Yes |
| `src/app/(public)/order/[id]/page.tsx` | Order tracking | Yes |
| `src/app/api/public/orders/route.ts` | Public QR order creation | Yes |
| `src/app/api/public/service-requests/route.ts` | Public service requests | Yes |
| `src/lib/public-orders.ts` | `createPublicOrder`, `getPublicOrder` | Yes |
| `src/lib/public-menu.ts` | `getTableByToken`, `getPublicMenu` | Yes |
| `src/lib/session.ts` | Staff session, role, branch, bootstrap | Yes |
| `src/lib/authz.ts` | Roles, permissions, rank | Yes |
| `src/lib/route-access.ts` | Route permission matrix | Yes |
| `src/lib/require-page-access.ts` | Server page guard | Yes |
| `src/lib/env.ts` | Public env validation | Yes |
| `src/lib/staff-waiter-operations.ts` | QR claim/approve/reject, transfers, handovers | Yes |
| `src/app/api/staff/qr/orders/route.ts` | Waiter QR claim | Yes |
| `src/app/api/staff/orders/[id]/items/append/route.ts` | Append items to table order | Yes |
| `src/components/waiter/waiter-table-workspace.tsx` | Waiter single-table workspace | Yes |
| `src/components/public/public-backdrop.tsx` | Brand backdrop (Pexels) | Yes |
| `src/lib/pexels.ts` | Pexels URL builder | Yes |
| `next.config.ts` | Next config, image remote patterns | Yes |
| `.env.example` | Env placeholders | Yes |
| `prisma/schema.prisma` | Data model (read-only reference) | Yes |

---

**End of audit.** This document is read-only. No code, database, or Git changes were made as part of this audit.
