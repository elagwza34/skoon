> ## ✅ APPROVED ARCHITECTURE DECISION — Phase 1 (supersedes prior stack below)
> ## 🔄 UPDATE — Phase A DONE (2026-10-09): PostgreSQL + Supabase Auth schema applied locally
> `schema.prisma` now targets **PostgreSQL** (pooled `DATABASE_URL` + `DIRECT_URL` for
> migrations); `User` is keyed by **Supabase Auth UUID** and custom-password fields were
> removed. Validated via Prisma format/validate/generate. See
> **[PHASE-A-POSTGRES-SUPABASE-AUTH.md](./PHASE-A-POSTGRES-SUPABASE-AUTH.md)**.
> MySQL/next-auth references in the body remain **legacy/superseded**. Not done:
> migrations, RLS, Owner account, Supabase packages, auth code.

> **Effective: 2026-10 · Status: approved direction, implementation pending.**
>
> This banner is authoritative. Where the body of this document (below) still
> references **MySQL/MariaDB, next-auth, or Hostinger MySQL**, those references
> are **superseded** by the decisions below. The body is retained as design
> reference; Phase 2 will reconcile the concrete schema and configuration.
>
> | Concern | Approved decision | Validation status |
> |---|---|---|
> | Framework | **Next.js (App Router) + TypeScript + React** | Confirmed (installed) |
> | Language | **TypeScript** | Confirmed |
> | Database | **Supabase PostgreSQL** | Approved; migration pending (Phase 2) |
> | Authentication | **Supabase Auth** (server-verified sessions) | Approved; not yet wired |
> | ORM | **Prisma** — candidate, pending the dedicated PostgreSQL schema phase | Approved; schema still MySQL-typed (Phase 2) |
> | Hosting | **Hostinger Business** shared hosting | Plan reported to support SSR; **runtime/build details NOT independently verified** |
> | Production domain | **`skoon.awexen.com`** | Approved; DNS not configured |
> | Branches | **One branch initially**, data model designed for many | Approved |
> | Localization | **Arabic (RTL) + English (LTR)** | Approved |
> | Theme | **Dark mode default**, Light mode available, preference persisted | Approved |
> | UI surfaces | Admin dashboard **plus** dedicated **waiter / kitchen / cashier** POS screens | Approved |
> | Auth model | Staff accounts + roles/permissions, **server-side authorization** | Approved |
> | QR & lifecycle | Customer **QR ordering**, waiter orders, kitchen workflow, cashier payments | Approved |
> | Shifts | Opening float, closing cash count, expected cash, variance, reconciliation | Approved; shipped as MVP P0 (`shifts` table — `prisma/migrations/20261017_add_shifts`) |
> | Currency | Default **EGP**; configurable | Approved |
> | Tax | **Configurable rates/rules** (data-driven, not hardcoded) | Approved |
> | Live updates | **Polling for V1** unless a verified better option is confirmed later | Approved |
> | Image storage | **Supabase Storage** (proposed) | Pending implementation validation |
>
> **Still requiring validation (do NOT treat as confirmed):** Hostinger Node/SSR
> runtime & Node version, build/start commands, Supabase pooled-vs-direct
> connectivity from Hostinger, image storage choice, GitHub deploy integration.
> See [`HOSTINGER-DEPLOYMENT.md`](./HOSTINGER-DEPLOYMENT.md) and
> [`NEXTJS-HOSTINGER-VALIDATION.md`](./NEXTJS-HOSTINGER-VALIDATION.md).
>
> ---

# Cafe Management System — Architecture

> **Phase 0 v2 — Corrected Architecture**
> **Stack: Next.js + TypeScript** (not Laravel)
> **Status: design draft.** No implementation code exists yet.
> **Hosting: Hostinger Business Shared Hosting — no VPS**

---

## ⚡ CHANGELOG: v1 → v2

| Item | v1 (Superseded) | **v2 (Current)** |
|---|---|---|
| Framework | Laravel 10 | **Next.js (App Router)** |
| Language | PHP 8.2 | **TypeScript** |
| UI | Blade + Alpine.js | **React Server/Client Components** |
| CSS | Tailwind | **Tailwind + shadcn/ui** |
| ORM | Eloquent | **Prisma** |
| Auth | Laravel session | **httpOnly cookie sessions** |
| Validation | FormRequest + Policy | **Zod + RBAC** |
| Hosting model | PHP app | **Node.js app (managed)** |
| Real-time | Adaptive polling | **Adaptive polling** (unchanged) |

### Why the change

Phase 0 v1 rejected Next.js based on a **misreading** of Hostinger's
"run on demand" wording. The validation study found 5 gaps in that
reasoning and confirmed Next.js is **natively supported** on Business.

**Evidence:** [`NEXTJS-HOSTINGER-VALIDATION.md`](./NEXTJS-HOSTINGER-VALIDATION.md)
**Verdict:** ✅ **YES**

### What did NOT change

✅ Business requirements · ✅ Roles & permissions · ✅ Order workflow
✅ Database concepts · ✅ Security requirements · ✅ Multi-branch
✅ QR token concept · ✅ Real-time = HTTP polling

---

## 0. Document Map

| Doc | Purpose |
|---|---|
| [`NEXTJS-HOSTINGER-VALIDATION.md`](./NEXTJS-HOSTINGER-VALIDATION.md) | **Feasibility proof — read first** |
| [`CAFE-SYSTEM-ARCHITECTURE.md`](./CAFE-SYSTEM-ARCHITECTURE.md) | This doc |
| [`DATABASE-DESIGN.md`](./DATABASE-DESIGN.md) | Schema, indexes, migrations |
| [`HOSTINGER-DEPLOYMENT.md`](./HOSTINGER-DEPLOYMENT.md) | Deployment runbook |

---

## 1. Current Project State

### 1.1 Scan Result

| Check | Result |
|---|---|
| Directory contents | **Empty — 0 files** |
| `package.json` / `composer.json` | `ENOENT` |
| `.htaccess` / `.env` / `README.md` | `ENOENT` |
| `.git` | Not present |
| Codebase index | `Searched 0 files` |

### 1.2 Conclusion

**Greenfield.** No code, framework, DB, CMS, or auth exists.
Nothing to preserve or break.

### 1.3 Local Dev Environment

| Tool | Version |
|---|---|
| Node.js | v24.19.0 |
| npm | bundled |
| MariaDB (local test) | 10.4.32 |
| PHP | 8.2.12 — **no longer needed** |

> Production targets **Node 22 LTS** (Hostinger-supported).

### 1.4 Open Questions

| # | Question | Impact |
|---|---|---|
| 1 | Domain name? | Deployment |
| 2 | VAT rate confirmed (14%?) | Tax config |
| 3 | Branch/table count, peak orders/hour | Sizing |
| 4 | Invoice language? A4 or thermal? | Print CSS |
| 5 | ESC/POS printer needed? | Print strategy |

> ✅ Language, currency (**EGP**), and tax are **configurable in `settings`** — never hardcoded.

## 2. Technology Stack — المعتمد

### 2.1 القائمة المعتمدة

```text
Next.js (App Router) + TypeScript
├── React 18+           Server Components + Client Components
├── Tailwind CSS        styling
├── shadcn/ui           component primitives (Radix + CVA)
├── Prisma ORM          + MySQL / MariaDB
├── Zod                 validation (shared client/server)
├── next-auth           أو custom session (httpOnly cookies)
├── next-intl           i18n (ar/en, RTL/LTR)
└── Adaptive HTTP Polling  (3–5s)

❌ لا Redis · لا WebSocket · لا SSE · لا Pusher · لا Supabase
💰 التكلفة الخارجية الشهرية: 0
```

### 2.2 مقارنة الخيارات (V1)

| المعيار (الوزن) | **Next.js** | Laravel | PHP + MySQL |
|---|:---:|:---:|:---:|
| Hostinger Business support (5) | 5 | 5 | 5 |
| Type-safety (4) | **5** | 3 | 2 |
| DX / velocity (4) | **5** | 4 | 2 |
| Real-time fit — polling (5) | **5** | 4 | 4 |
| Security defaults (5) | 4 | 5 | 3 |
| Deployment simplicity (4) | 5 | 4 | 5 |
| **المجموع** | **29** | 27 | 24 |

### 2.3 لماذا Next.js للمشروع

| السبب | التفصيل |
|---|---|
| **مدعوم رسمياً** | Business + Next.js both named in Hostinger docs |
| **Managed pipeline** | `npm install` → `build` → start، كلها مُدارة |
| **Native primitives** | SSR · Server Actions · Route Handlers · Middleware |
| **Type safety end-to-end** | TypeScript + Zod share types client↔server |
| **مaligned مع الطلب** | §1 من المتطلب |
| **معاملات أقل** | React + Tailwind + Prisma في منظومة واحدة |

### 2.4 Trade-offs المعترف بها

| الجانب | المقابل | التخفيف |
|---|---|---|
| Server Actions تلتقط POST | حد CSRF مدمج | good — Server Actions only |
| Runtime = Node (بلا PHP) | PHP لا يعمل في نفس الدومين | subdomain أو تجاهل PHP |
| hbuilds يُستبدل | ❌ لا تعديل يدوي | الكود كله من Git |
| Cold start بعد خمول | أول طلب بعد فترة | polling يبقيها نشطة |

---

## 3. System Architecture

### 3.1 نظرة عامة

```text
┌────────────────────────────────────────────────────────────┐
│ Browser                                                    │
│  Customer(QR) · Waiter · Kitchen · Cashier · Admin          │
└─────────────────────────┬──────────────────────────────────┘
                          │ HTTPS (SSL — Let's Encrypt)
┌─────────────────────────▼──────────────────────────────────┐
│ Hostinger Business                                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ LiteSpeed reverse proxy → SSL termination            │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Next.js standalone server                             │  │
│  │  ├─ Server Components   → SSR default               │  │
│  │  ├─ Client Components   → 'use client' islands      │  │
│  │  ├─ Route Handlers      → /api/orders/updates        │  │
│  │  ├─ Server Actions      → mutations                 │  │
│  │  └─ Middleware          → auth + RBAC + rate limit   │  │
│  └──────────────────────┬───────────────────────────────┘  │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │ Prisma ORM (singleton)                                │  │
│  └──────────────────────┬───────────────────────────────┘  │
└─────────────────────────┼──────────────────────────────────┘
                          ▼
              MySQL @ 127.0.0.1:3306
```

### 3.2 حدود المسؤوليات

```text
src/
├── app/
│   ├── (public)/menu/[token]/     ← Customer (QR) — no auth
│   ├── (staff)/waiter/            ← session + role check
│   ├── (staff)/kitchen/           ← session + role check
│   ├── (staff)/cashier/           ← session + role check
│   ├── (staff)/admin/             ← session + RBAC
│   ├── api/                       ← Route Handlers (polling, health)
│   └── layout.tsx                 ← root: dir, lang, i18n
│
├── components/          ← Presentational (shadcn + app UI)
│   ├── ui/              ← shadcn primitives
│   ├── menu/            ← customer menu components
│   ├── orders/          ← shared order UI
│   └── layout/          ← shell, sidebar, nav
│
├── server/              ← Server-only logic (no 'use client')
│   ├── services/        ← business logic (order, payment, menu)
│   ├── auth/            ← session, password, guards
│   ├── rbac/            ← permissions, policies
│   └── db/              ← Prisma singleton, queries
│
├── lib/                 ← Framework-agnostic utils (cn, format)
├── validations/         ← Zod schemas (shared client + server)
├── types/               ← shared TS types
└── i18n/                ← ar/en messages
```

**قواعد الفصل:**

| القاعدة | التطبيق |
|---|---|
| `server/` لا يُستورد من client | ❌ build error — good |
| business logic في `services/` | قابل للاختبار بدون HTTP |
| validation في `validations/` | **نفس schema** على client و server |
| DB access في `server/db/` فقط | لا استعلامات في components |
| auth check في middleware **و** service | defense in depth |
## 4. Core Domain Concepts

### 4.1 QR Token — الأمان

```text
Route: /menu/[table-token]     ✅ ليس /menu/table/12

cafe_tables
  id            = 12                    ← internal, لا يُكشف
  public_token  = 'a3f9c2e8b7d14605'   ← 64-bit random, فريد
```

**لماذا:**
- ✅ لا enumeration بسيط (لا id مكشوف)
- ✅ 1.8×10¹⁹ احتمال → غير قابل للتخمين
- ✅ **قابل للإبطال**: تغيير الطاولة → token جديد، الروابط القديمة تفشل
- ✅ `is_active = 0` → ترفض أي scan

**توليده (Prisma-friendly):**
```ts
// lib/qr.ts
import { randomBytes } from 'crypto'
export const generateTableToken = () => randomBytes(8).toString('hex')
// → 16 hex chars, 64 bits
```

### 4.2 ⚠️ قاعدة الأمان الأهم — السعر

```text
❌ العميل لا يرسل السعر — إطلاقاً
```

**ما يرسله العميل:**
```json
{ "productId": 42, "quantity": 2, "optionValueIds": [7], "addonIds": [3,4] }
```

**ما يفعله الخادم:**
```text
1. يقرأ السعر من DB  (products.price)
2. يقرأ price_adjustment من DB  (product_option_values)
3. يقرأ سعر الإضافات من DB  (addons.price)
4. يحسب الإجمالي
5. يحفظ snapshot في order_items (أسماء + أسعار وقت الطلب)
```

> **هذا يمنع التلاعب بالأسعار كلياً** — لا يوجد سعر من جهة العميل.

### 4.3 Order Workflow

```text
  NEW ──→ ACCEPTED ──→ PREPARING ──→ READY ──→ SERVED ──→ COMPLETED
   │           │                                                │
   └───────────┴──────────────── CANCELLED ────────────────────┘
                                                    │
                       COMPLETED / PAID ──→ REFUNDED ┘
```

| Transition | مسموح؟ | ملاحظة |
|---|:---:|---|
| `NEW → ACCEPTED` | ✅ | Waiter / Kitchen |
| `NEW → CANCELLED` | ✅ | قبل البدء |
| `ACCEPTED → PREPARING` | ✅ | Kitchen |
| `ACCEPTED → CANCELLED` | ✅ | قبل التحضير |
| `PREPARING → READY` | ✅ | Kitchen |
| `PREPARING → CANCELLED` | ❌ | بدأ التحضير → يحتاج refund |
| `READY → SERVED` | ✅ | Waiter |
| `SERVED → COMPLETED` | ✅ | Cashier (شرط PAID) |
| `COMPLETED → REFUNDED` | ✅ | استرداد مالي |
| `READY → COMPLETED` | ❌ | يجب تقديمه أولاً |
| `CANCELLED → أي` | ❌ | **نهائي** |
| `REFUNDED → أي` | ❌ | **نهائي** |
| `NEW → PREPARING` | ❌ | يجب القبول أولاً |

**التنفيذ — State Machine صريح:**

```ts
// server/services/order-status.ts
export const TRANSITIONS = {
  NEW:       ['ACCEPTED', 'CANCELLED'],
  ACCEPTED:  ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY:     ['SERVED'],
  SERVED:    ['COMPLETED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED:  [],
} as const

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (TRANSITIONS[from] as readonly OrderStatus[]).includes(to)
}
```

> ✅ **مصفوفة صريحة** بدل `if/else` — قابلة للتدقيق والاختبار.
> يُستدعى من **service واحد فقط**، مع `SELECT ... FOR UPDATE` (عبر Prisma `$transaction`).

### 4.4 Order Status ≠ Payment Status

| Order Status | Payment Status | المعنى |
|---|---|---|
| `NEW` … `SERVED` | `UNPAID` | الطلب قائم |
| `COMPLETED` | `PAID` | مدفوع ومغلق |
| `COMPLETED` | `PARTIALLY_PAID` | دفع جزئي — **لا يُغلق** |
| `CANCELLED` | `UNPAID` | ملغى قبل الدفع |
| `REFUNDED` | `REFUNDED` | استُرد المبلغ |

> `→ COMPLETED` **مشروط** بـ `payment_status = PAID`.

### 4.5 Multi-Branch — تصميم نظيف

```text
✅ لا branch_id = 0  (لا fake branch)
✅ كل جدول تشغيلية لها branch_id حقيقي (FK)
✅ عزل الفرع مفعّل في middleware + service
```

```text
Company (implicit — single-tenant deployment)
    ↓
branches
    ├── users          (branch_id FK, NULL = multi-branch owner)
    ├── cafe_tables    (branch_id FK)
    ├── categories     (branch_id FK)
    ├── products       (branch_id FK)
    ├── addons         (branch_id FK)
    ├── orders         (branch_id FK)
    ├── payments       (branch_id FK)
    ├── discounts      (branch_id FK, NULL = global)
    └── settings       (branch_id FK, NULL = global)
```

**الإعدادات العامة (NULL):** design مختلف عن `branch_id = 0`:

```ts
// ✅ بدل fake branch — نستخدم NULL بشكل صحيح
// Unique constraint مع NULL: MySQL لا يمنع تكرار NULL
// الحل: unique index على (branch_id, key) + logic في التطبيق
// أو: جدول settings عام منفصل
```

> **قرار:** الإعدادات العامة في **جدول منفصل** `app_settings`
> (مفتاح واحد، صف واحد) — يحقق:
> - ✅ `UNIQUE` حقيقي
> - ✅ FK integrity محفوظة
> - ✅ لا fake IDs
---

## 5. Security Architecture

### 5.1 طبقات الحماية

| الطبقة | التنفيذ في Next.js |
|---|---|
| **Password hashing** | `bcrypt` (cost 12) أو `argon2id` — **لا نص صريح أبداً** |
| **Session** | httpOnly + Secure + SameSite=Lax cookie، signed |
| **CSRF** | Server Actions built-in + Origin check لـ Route Handlers |
| **SQL Injection** | **Prisma parameterized** — لا raw string queries |
| **XSS** | React escaping افتراضي · ❌ `dangerouslySetInnerHTML` ممنوع لبيانات المستخدم |
| **Input validation** | **Zod** على كل Server Action + Route Handler |
| **Authorization** | RBAC في middleware **و** service (defense in depth) |
| **Rate limiting** | login · QR scan · order submit |
| **File uploads** | MIME sniff + حجم + UUID + صور فقط |
| **Audit logging** | كل تغيير حساس في `audit_logs` |

### 5.2 RBAC — التحقق server-side

```text
┌─────────────────────────────────────────────────────────┐
│  Server Action / Route Handler                          │
│                                                         │
│  1. session = await auth()          → مستخدم؟           │
│  2. role = session.user.role                           │
│  3. requirePermission(role, 'orders.cancel')  → 403     │
│                                                         │
│  ⚠️ إخفاء الزر في UI ≠ حماية                           │
│     الحماية الحقيقية هنا فقط                            │
└─────────────────────────────────────────────────────────┘
```

**Permissions:**

```text
orders.view      orders.create    orders.update
orders.cancel    orders.refund    orders.serve
orders.kitchen   orders.payment

menu.view        menu.create      menu.update      menu.delete

tables.view      tables.create    tables.update    tables.delete
tables.qr

staff.view       staff.create     staff.update      staff.delete

reports.view     inventory.view   inventory.manage
discounts.manage settings.view    settings.update
audit.view       branches.manage
```

### 5.3 Role Matrix

| Permission | OWNER | MANAGER | WAITER | KITCHEN | CASHIER |
|---|:---:|:---:|:---:|:---:|:---:|
| `orders.view` (all) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `orders.view` (branch) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `orders.create` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `orders.kitchen` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `orders.serve` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `orders.cancel` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `orders.payment` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `orders.refund` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `menu.*` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `tables.view` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `tables.create/update/delete` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `staff.view` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `staff.create/update/delete` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `reports.view` | ✅ | ✅ | ❌ | ❌ | ⚠️ self |
| `inventory.view` | ✅ | ✅ | ❌ | ✅ | ❌ |
| `inventory.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `discounts.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `settings.view` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `settings.update` | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| `audit.view` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `branches.manage` | ✅ | ❌ | ❌ | ❌ | ❌ |

✅ كامل · ⚠️ محدود · ❌ ممنوع

### 5.4 Branch Isolation

```ts
const user = await auth()
if (user.role !== 'OWNER' && order.branchId !== user.branchId) {
  throw new ForbiddenError()   // 403
}
```

- OWNER: كل الفروع · غيره: فرعهم فقط
- **لا استثناء** — يُطبَّق حتى على manager

### 5.5 Audit Logging

```ts
await prisma.auditLog.create({
  data: {
    userId, branchId,
    action: 'order.cancel',
    entityType: 'Order', entityId: order.id,
    oldValues: { status: 'PREPARING' },   // JSON
    newValues: { status: 'CANCELLED' },   // JSON
    ipAddress, userAgent,
  },
})
```

> **بدون `updated_at`** — سجل التدقيق للقراءة فقط.

## 6. Real-time Strategy

### 6.1 القرار

```text
✅ Adaptive HTTP Polling — 3 إلى 5 ثوانٍ
❌ لا WebSocket · لا SSE · لا Redis · لا Pusher · لا Supabase
```

### 6.2 لماذا

| الحجة | التفصيل |
|---|---|
| **كفاية** | دورة طلب = دقائق. 3 ث غير ملحوظة |
| **لا daemon** | WebSocket/SSE يحتاج عملية دائمة — غير متاحة |
| **اقتصاد** | تكلفة = **0** · بيانات لا تمر بطرف ثالث |
| **موثوقية** | polling يفشل أو ينجح — لا dependency خارجي |
| **موارد** | polling بـ 3 ث = حمل ضئيل |

### 6.3 التنفيذ

```text
GET /api/orders/updates?branchId=1&since=<timestamp>
  Authorization: session cookie
        ↓
  200 { "changed": false }                          ← ~30 bytes
  200 { "changed": true, "counts": {...},
        "orders": [...] }                            ← فقط المتغيّر
```

| التحسين | التفصيل |
|---|---|
| ✅ Change detection | `updated_at > since` — لا يُرجع قائمة كاملة |
| ✅ Count-only | للعدادات، `COUNT(*)` على فهرس |
| ✅ Tab hidden | `visibilitychange` → يوقف polling |
| ✅ Backoff | تباعد عند الأخطاء أو الخمول |
| ✅ Indexed queries | كل COUNT على `(branch_id, status)` |

### 6.4 تقدير الحمل

**سيناريو واقعي:** كافيه واحد، 20 طاولة، 400 طلب/يوم، ذروة 40/ساعة.

| المصدر | freq | طلب/ساعة | DB queries |
|---|---|---|---|
| 2 waiter | 3s | 2,400 | 2,400 |
| 1 kitchen | 3s | 1,200 | 1,200 |
| 1 cashier | 10s | 360 | 360 |
| **المجموع** | | **~4,000** | **~4,000** |

> **1.1 استعلام/ثانية** — **ضئيل جداً** لاستضافة مشتركة.

### 6.5副作用 إيجابية

> polling المستمر **يمنع إيقاف العملية عند الخمول** — traffic مستمر.
> لا cold starts أثناء ساعات العمل.

---

## 7. Internationalization, Currency, Tax

### 7.1 اللغة

```text
Primary:   العربية (ar)  →  RTL
Secondary: English (en) →  LTR
```

```ts
// app/layout.tsx
<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
```

### 7.2 قواعد i18n

| القاعدة | التطبيق |
|---|---|
| ❌ **لا hardcode strings** | كل نص في `i18n/messages/{ar,en}.json` |
| ✅ Direction من locale | `dir` تلقائي |
| ✅ RTL-safe CSS | Tailwind logical properties (`ms-`, `me-`, `ps-`, `pe-`) |
| ✅ Numbers | `Intl.NumberFormat` مع locale |
| ✅ Currency | `Intl.NumberFormat(locale, { style:'currency', currency })` |
| ✅ Dates | `Intl.DateTimeFormat` مع `settings.timezone` |

### 7.3 العملة والضريبة — configurable

```ts
// ❌ ممنوع — hardcoded
const total = subtotal * 1.14

// ✅ من settings
const { currency, taxEnabled, taxName, taxRate } = await getSettings(branchId)
const total = taxEnabled ? subtotal * (1 + taxRate / 100) : subtotal
```

```json
// app_settings (صف واحد — عام)
{
  "currency": "EGP",
  "tax_enabled": true,
  "tax_name": "VAT",
  "tax_rate": 14
}
```

> ✅ **14% مثال في settings — ليس في business logic.**

## 8. UI, PWA & Performance

### 8.1 UI System

| الطبقة | التقنية |
|---|---|
| Components | **shadcn/ui** (Radix + CVA) — code مملوك، لا lock-in |
| Styling | **Tailwind CSS** + logical properties (RTL-safe) |
| Forms | React Hook Form + Zod (shared schemas) |
| Tables | TanStack Table |
| Icons | lucide-react (bundled, no CDN) |
| Toasts | sonner |

### 8.2 Responsive Targets

| الجهاز | الشاشة | الأولوية |
|---|---|---|
| iPhone / Android | 375–430px | **Customer** — عمودي، لمسي |
| iPad / Android Tab | 768–1024px | **Waiter / Kitchen** — لمسي |
| Desktop | 1280px+ | **Admin** — mouse |

**قواعد:**
- ✅ أهداف لمس ≥ 44×44px (WCAG 2.5.5)
- ✅ `user-scalable=yes` — لا يمنع التكبير
- ✅ Safe-area insets (iPhone notch)
- ✅ `prefers-color-scheme` — وضع داكن للـ Kitchen

**شاشة Kitchen خاصة:** مقروء من مسافة مترين — أكبر خط، تباين أقصى، **لا يعرض الأسعار إطلاقاً**.

### 8.3 PWA — تصميم جاهز، ليس blocker

```text
public/
├── manifest.webmanifest
├── sw.js                    ← Service Worker
└── icons/ (192, 512, maskable)
```

**الاستراتيجية:**

| المورد | Cache strategy |
|---|---|
| App shell (CSS/JS/icons) | Precache |
| صور المنتجات | Cache-First |
| صفحات HTML | Network-First |
| `/api/*` | **Never cache** |

> ✅ **PWA ليس شرطاً للإطلاق.** يُضاف بعد نجاح الـ MVP.
> Server Components تعني HTML كامل في أول response → **لا حاجة لـ offline**.

**ما لا نفعله:**
- ❌ native mobile app
- ❌ offline write (تعقيد مزامنة + خطر تضارب)
- ❌ push notifications

### 8.4 الأداء

| الجانب | التقنية |
|---|---|
| **DB indexes** | على كل أعمدة البحث والربط |
| **N+1** | Prisma `include` — eager loading |
| **Pagination** | `?page=` — 25-50 عنصر |
| **Caching** | `next: { revalidate }` للمنيو العام (يتغير infrequently) |
| **Images** | `next/image` + WebP + `loading="lazy"` |
| **Bundle** | Server Components افتراضياً → JS أقل |
| **Build cache** | `.next/cache` — Next يديره تلقائياً |

**Decisions:**
- ✅ Server Components لكل ما لا يحتاج تفاعلاً
- ✅ `'use client'` فقط للـ cart، filters، polling hook
- ✅ `Promise.all` بدل fetch waterfall
- ❌ لا `'use client'` على مستوى الصفحة

---

## 9. Implementation Phases

| Phase | المحتوى | المخرجات |
|---|---|---|
| **0** ✅ | Validation + Architecture | 4 docs |
| **0.5** | **Smoke Test** | proof Next.js runs |
| **1** | التأسيس | Next.js project · Prisma schema · RBAC · auth |
| **2** | QR + Customer | tables · menu · cart · order create |
| **3** | Waiter + Kitchen | dashboards · workflow |
| **4** | Cashier + Payments | payment · invoice · print |
| **5** | Admin | dashboard · reports · CRUD |
| **6** | Quality | PWA · tests · hardening |
| **7** | Deployment | staging · launch |

> كل phase قابل للتشغيل والاختبار منفرداً.

### 9.1 Phase 0.5 — Smoke Test (قبل أي شيء)

```bash
npx create-next-app@latest smoke --typescript --app --tailwind
git push → hPanel → Deploy
```

**Acceptance:** build ✅ · page renders ✅ · `/api/health` → 200 ✅ · logs ✅

> **هذا يحسم كل الـ UNKNOWNs.** راجع validation doc §G.2.

---

## 10. File Structure — Planned

```text
cafe-system/
├── prisma/
│   ├── schema.prisma          ← single source of truth
│   ├── migrations/            ← كل تغيير schema هنا فقط
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (public)/menu/[token]/
│   │   ├── (staff)/waiter/ kitchen/ cashier/ admin/
│   │   ├── api/
│   │   └── layout.tsx
│   ├── components/  { ui, menu, orders, layout }
│   ├── server/      { services, auth, rbac, db }
│   ├── lib/ validations/ types/ i18n/
├── public/  manifest.webmanifest · sw.js · uploads/
├── tests/   unit/ · integration/
└── package.json · tsconfig.json · tailwind.config.ts
```

> ⚠️ **لم يُنشأ أي مما سبق بعد.** خطة فقط.

---

## 11. Open Questions Requiring Your Decision

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Next.js + TypeScript** | ✅ proceed (validation passed) |
| 2 | **Polling** بلا خدمة خارجية | ✅ صفر تكلفة |
| 3 | **QR token** بدل table ID | ✅ أمان |
| 4 | **Images في DB blob** | ✅ لا تضيع عند deploy |
| 5 | `app_settings` منفصل بدل `branch_id=0` | ✅ FK integrity |
| 6 | auth: next-auth vs custom | next-auth (أسرع) |
| 7 | auth: bcrypt vs argon2id | argon2id (أقوى) |

---

> **انتهت Phase 0 v2.** لا يوجد implementation code.
> **Phase 0.5 (Smoke Test)** هو الخطوة التالية بعد موافقتك.

**المراجع:**
- [`NEXTJS-HOSTINGER-VALIDATION.md`](./NEXTJS-HOSTINGER-VALIDATION.md)
- [`DATABASE-DESIGN.md`](./DATABASE-DESIGN.md)
- [`HOSTINGER-DEPLOYMENT.md`](./HOSTINGER-DEPLOYMENT.md)
---
---

---

---
---
