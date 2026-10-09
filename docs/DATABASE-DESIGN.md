> ## ✅ APPROVED DATABASE TARGET — Phase 1 (supersedes MySQL specifics below)
> ## 🔄 UPDATE — Phase A DONE (2026-10-09): schema converted to PostgreSQL & Supabase Auth locally
> The `provider = "postgresql"` conversion, MySQL-type removal, and `User` → UUID
> (Supabase Auth) changes have been **applied locally and validated** (format/validate/
> generate pass). See **[PHASE-A-POSTGRES-SUPABASE-AUTH.md](./PHASE-A-POSTGRES-SUPABASE-AUTH.md)**.
> This file remains the **relational design reference**; the MySQL-specific body below
> is **legacy/superseded** — use Prisma `schema.prisma` + the Phase A record as the
> source of truth. No data migration, migrations, RLS, or Owner provisioning were done.

> **Effective: 2026-10 · Target: Supabase PostgreSQL · Auth: Supabase Auth**
>
> This banner is authoritative for the **target architecture**. The body below is
> retained as the **conceptual/relational design reference** and still describes
> **MySQL/MariaDB** specifics. The schema has **NOT** been converted to or
> validated for PostgreSQL — that is **Phase 2** work. Nothing in this banner
> claims a migration has been performed.
>
> **Target stack:** Supabase PostgreSQL (managed Postgres) · Prisma (candidate ORM,
> pending the PostgreSQL schema phase) · Supabase Auth (owns credentials).
>
> ### Pending Phase 2 changes to the existing MySQL-specific `prisma/schema.prisma`
> The current schema (`provider = "mysql"`) must be retargeted and fixed before any
> migration. Required work (none done yet):
>
> 1. **Datasource provider** `mysql` → `postgresql` (necessary, not sufficient).
> 2. **PostgreSQL-compatible native types** — remove MySQL-only attributes
>    (`@db.UnsignedBigInt`, `@db.UnsignedSmallInt`, `@db.UnsignedTinyInt`,
>    reconsider `@db.VarChar(n)`/`@db.Char(n)`). Prisma rejects these on Postgres.
> 3. **Supabase Auth user UUID linkage** — current `User.id` is `BigInt autoincrement`;
>    Supabase Auth issues UUIDs. Link the staff profile to `auth.users.id` (UUID),
>    either as the PK or via a unique `authUserId` column.
> 4. **Remove application-managed password hashes** (`passwordHash`) — Supabase Auth
>    owns credentials. Do not store passwords in the app `User` table.
> 5. **Staff profiles, roles, permissions** — keep app-side RBAC (`Role`,
>    `Permission`, `RolePermission`) driven by the staff profile; do not rely on
>    Supabase Auth metadata for authorization unless custom claims are added deliberately.
> 6. **Shifts & cash reconciliation** — add models for opening float, closing cash
>    count, expected cash, variance, and reconciliation (currently absent).
> 7. **Audit logging** — retain `AuditLog`; wire sensitive actions server-side.
> 8. **Multi-branch data isolation** — most tables already carry `branch_id`;
>    enforce scoping in the query layer (server) and, for Supabase-API-exposed
>    tables, via Row Level Security.
> 9. **Global-vs-branch settings** — the schema currently uses a `branch_id = 0`
>    sentinel in `app_settings`. Replace with a proper design (e.g., nullable
>    `branch_id` where `NULL` = global, with a unique constraint that handles NULLs,
>    or a separate global-settings table) before migration.
> 10. **Database privileges & RLS** — decide the access pattern. Prisma's direct
>     connection bypasses RLS; RLS protects only traffic through Supabase's API
>     (anon/authenticated keys). Enforce authorization in app code for Prisma paths.
>
> **Not yet done:** no `prisma migrate` has been run; no migration history exists.
> The first migration will be created against Supabase/Postgres in Phase 2.
>
> ---

# Database Design — Cafe Management System

> **Phase 0 v2 — Prisma + MySQL**
> ORM: **Prisma** (بدل Eloquent)
> المحرّك: **MySQL 8 / MariaDB 10.4+** على Hostinger (InnoDB، `utf8mb4`)
> لن يُعدَّل أي schema بدون **`prisma migrate`**.

---

## ⚡ v2 Changes

| Item | v1 | **v2** |
|---|---|---|
| ORM | Eloquent | **Prisma** |
| Schema file | migrations/*.php | **`prisma/schema.prisma`** |
| Migration cmd | `artisan migrate` | **`npx prisma migrate deploy`** |
| Global settings | `branch_id = 0` (fake) | **`app_settings` جدول منفصل** ✅ |
| Decimals | DECIMAL(10,2) | **DECIMAL(10,2)** (unchanged) |

> ✅ **التصميم المفاهيمي محفوظ بالكامل** — PKs, FKs, indexes, unique constraints,
> snapshots, multi-branch. فقط الـ ORM والأداة تغيّرا.

---

## 0.1 Prisma Connection

```env
# ⚠️ 127.0.0.1 وليس localhost — التوثيق الرسمي ينصّ على ذلك
DATABASE_URL="mysql://u123456789_admin:PASSWORD@127.0.0.1:3306/u123456789_cafe"
```

> ⚠️ **URL-encode لكلمة المرور** إذا احتوت `@ # : /`

**الوصول:**
```bash
npx prisma migrate deploy      # production
npx prisma migrate dev        # local (يبني migration جديد)
npx prisma generate           # يولّد client
npx prisma studio             # DB viewer (dev only)
```

> `prisma generate` يجب أن يعمل **قبل** `next build` — نضعه في `postinstall`.

---

## 0. قواعد عامة

| القاعدة | التطبيق |
|---|---|
| Primary Key | `BIGINT UNSIGNED AUTO_INCREMENT` لكل الجداول |
| Timestamps | `created_at`, `updated_at` في كل جدول تقريبًا |
| Charset | `utf8mb4` / `utf8mb4_unicode_ci` — يدعم العربية + الإيموجي |
| Engine | `InnoDB` — transactions + foreign keys |
| Decimal | الأسعار `DECIMAL(10,2)` — **لا تستخدم FLOAT** (دقة خاطئة) |
| Soft deletes | على `categories, products, cafe_tables, users, inventory_items` |
| Branch scoping | كل جدول تشغيلية تحمل `branch_id` |
| Enums | `VARCHAR` + validation في التطبيق — **لا MySQL ENUM** |
| Boolean | `TINYINT(1)` |

> **لماذا DECIMAL وليس FLOAT؟** `FLOAT` لا يمثّل `0.10` بدقة — أخطاء حسابية مالية. `DECIMAL(10,2)` هو المعيار المالي.

> **لماذا لا MySQL ENUM؟** إضافة قيمة تتطلب `ALTER TABLE` كامل وتكسر التطبيق القديم. `VARCHAR + validation` آمن للتوسّع.

---

## 1. ERD — نظرة عامة

```text
┌──────────────┐
│   branches   │◄──────┬──────────────┬───────────────┐
└──────┬───────┘       │              │               │
       ▼               ▼              ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐
│  cafe_tables │  │    users     │  │categories│  │   settings   │
│ public_token │  │  role_id     │  │  branch  │  │  branch_id   │
└──────┬───────┘  └──────┬───────┘  └────┬─────┘  └──────────────┘
       │                 │              │
       ▼                 ▼              ▼
┌──────────────────────────────────────────────────────────────┐
│                          orders                             │
│  branch_id · cafe_table_id · order_number · status          │
│  payment_status · subtotal · discount · tax · total        │
└───────┬───────────────────────────────┬──────────────────────┘
        ▼                               ▼
┌────────────────┐            ┌────────────────┐
│  order_items   │            │   payments     │
└───────┬────────┘            └────────────────┘
        ▼
┌──────────────────────────┐
│  order_item_addons       │
└──────────────────────────┘
```

**السلسلة الكاملة:** `Company` (من `branches`) → `Tables` → `Orders` → `Staff`

---

## 2. جداول Core

### 2.1 `branches` — الفروع

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `name` | VARCHAR(100) | |
| `code` | VARCHAR(20) **UNIQUE** | معرّف قصير للـ QR |
| `phone` | VARCHAR(20) NULL | |
| `address` | VARCHAR(255) NULL | |
| `timezone` | VARCHAR(50) DEFAULT 'Africa/Cairo' | |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `created_at` / `updated_at` | TIMESTAMP | |

**فهرس:** `UNIQUE(code)`, `INDEX(is_active)`

### 2.2 `cafe_tables` — الطاولات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | **لا يُكشف في URL** |
| `branch_id` | BIGINT UNSIGNED FK → `branches.id` | |
| `number` | VARCHAR(20) | الرقم المعروض |
| `name` | VARCHAR(50) NULL | "طاولة الزاوية" |
| `capacity` | TINYINT UNSIGNED DEFAULT 4 | |
| `public_token` | CHAR(16) **UNIQUE** | **64-bit عشوائي — أمان QR** |
| `qr_image_path` | VARCHAR(255) NULL | مسار صورة QR |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `sort_order` | INT DEFAULT 0 | |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | |

**فهارس:** `UNIQUE(public_token)`, `UNIQUE(branch_id, number)`, `INDEX(branch_id, is_active)`

> **توليد الـ token:** `bin2hex(random_bytes(8))` → 16 hex chars، مع إعادة توليد عند التعارض مع `UNIQUE`.

### 2.3 `roles` — الأدوار

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `slug` | VARCHAR(30) **UNIQUE** | `owner`/`manager`/`waiter`/`kitchen`/`cashier` |
| `name` | VARCHAR(50) | بالعربي |
| `description` | VARCHAR(255) NULL | |
| `is_system` | TINYINT(1) DEFAULT 0 | لا يُحذف |
| `created_at` / `updated_at` | | |

### 2.4 `permissions` — الصلاحيات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `slug` | VARCHAR(60) **UNIQUE** | `orders.cancel` |
| `name` | VARCHAR(100) | |
| `group` | VARCHAR(50) | `orders`/`menu`/`tables`/`staff`/`reports` |
| `created_at` / `updated_at` | | |

**فهرس:** `UNIQUE(slug)`, `INDEX(group)`

**Slugs المستخدمة:** `orders.view`, `orders.update`, `orders.cancel`, `orders.refund`, `orders.kitchen_status`, `orders.serve`, `menu.view`, `menu.update`, `tables.view`, `tables.manage`, `staff.view`, `staff.manage`, `reports.view`, `inventory.view`, `inventory.manage`, `discounts.manage`, `settings.manage`, `audit.view`

### 2.5 `role_permission` — ربط الأدوار بالصلاحيات

| العمود | النوع |
|---|---|
| `role_id` | BIGINT UNSIGNED FK → `roles.id` — **PK** |
| `permission_id` | BIGINT UNSIGNED FK → `permissions.id` — **PK** |

**فهرس:** `PRIMARY KEY (role_id, permission_id)`, `INDEX(permission_id)`

---

### 2.6 `users` — الموظفون

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `branch_id` | BIGINT UNSIGNED FK NULL | NULL = كل الفروع (owner) |
| `role_id` | BIGINT UNSIGNED FK → `roles.id` | |
| `name` | VARCHAR(100) | |
| `email` | VARCHAR(150) **UNIQUE** | |
| `phone` | VARCHAR(20) NULL | |
| `password` | VARCHAR(255) | **bcrypt hash فقط** |
| `remember_token` | VARCHAR(100) NULL | Laravel |
| `avatar_path` | VARCHAR(255) NULL | |
| `pin_code` | VARCHAR(10) NULL | PIN سريع (مُشفّر) |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `last_login_at` | DATETIME NULL | |
| `failed_login_count` | TINYINT DEFAULT 0 | |
| `locked_until` | DATETIME NULL | |
| `must_change_password` | TINYINT(1) DEFAULT 0 | |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | |

**فهارس:** `UNIQUE(email)`, `INDEX(role_id)`, `INDEX(branch_id, is_active)`

> **لا يوجد جدول `customers` في v1** — العميل غير مسجّل الدخول (متطلب).

---

## 3. جداول Menu

### 3.1 `categories` — التصنيفات

| العمود | النوع |
|---|---|
| `id` | BIGINT UNSIGNED PK |
| `branch_id` | BIGINT UNSIGNED FK → `branches.id` |
| `name` | VARCHAR(100) |
| `slug` | VARCHAR(120) |
| `image_path` | VARCHAR(255) NULL |
| `is_active` | TINYINT(1) DEFAULT 1 |
| `sort_order` | INT DEFAULT 0 |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP |

**فهارس:** `UNIQUE(branch_id, slug)`, `INDEX(branch_id, is_active, sort_order)`

### 3.2 `products` — المنتجات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `branch_id` | BIGINT UNSIGNED FK → `branches.id` | |
| `category_id` | BIGINT UNSIGNED FK → `categories.id` | |
| `name` | VARCHAR(150) | |
| `description` | TEXT NULL | |
| `image_path` | VARCHAR(255) NULL | |
| `price` | **DECIMAL(10,2)** | السعر الأساسي |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `is_available` | TINYINT(1) DEFAULT 1 | **نفد مؤقتاً — منفصل عن is_active** |
| `is_featured` | TINYINT(1) DEFAULT 0 | مميّز في المنيو |
| `sort_order` | INT DEFAULT 0 | |
| `prep_time_minutes` | SMALLINT UNSIGNED DEFAULT 5 | **لشاشة المطبخ: المدة** |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | |

**فهارس:** `INDEX(category_id, is_active, sort_order)`, `INDEX(branch_id, is_active)`, `INDEX(is_available)`

> **`is_active` vs `is_available`:**
> - `is_active = 0` → مخفي **نهائياً** (صنف صيفي).
> - `is_available = 0` → ظاهر لكن **غير قابل للطلب** (نفد حليب). يظهر "غير متوفر" للعميل ويختفي من المطبخ.

> **`prep_time_minutes`:** يُنسخ إلى `order_items` وقت الطلب — لأن المنتج قد يتغيّر والطلب القديم يجب أن يبقى كما كان.

### 3.3 `product_options` — خيارات المنتج (حجم، تحميص)

| العمود | 类型 | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `product_id` | BIGINT UNSIGNED FK → `products.id` | |
| `name` | VARCHAR(100) | "الحجم" |
| `type` | VARCHAR(20) | `single` أو `multiple` |
| `is_required` | TINYINT(1) DEFAULT 0 | **إجباري؟** |
| `min_selections` | TINYINT DEFAULT 0 | |
| `max_selections` | TINYINT DEFAULT 1 | |
| `sort_order` | INT DEFAULT 0 | |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | |

**فهرس:** `INDEX(product_id, sort_order)`

### 3.4 `product_option_values` — قيم الخيار

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `product_option_id` | BIGINT UNSIGNED FK → `product_options.id` | |
| `value` | VARCHAR(100) | "كبير" |
| `price_adjustment` | **DECIMAL(10,2) DEFAULT 0.00** | **فرق السعر** |
| `is_default` | TINYINT(1) DEFAULT 0 | |
| `sort_order` | INT DEFAULT 0 | |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | |

**فهرس:** `INDEX(product_option_id, sort_order)`

> **الأمان:** `price_adjustment` يُقرأ من DB — **العميل لا يرسله أبداً**.

### 3.5 `addons` — الإضافات

| العمود | النوع | ملاحظات |
### 3.6 `product_addon_map` — ربط المنتجات بالإضافات

| العمود | النوع |
|---|---|
| `product_id` | BIGINT UNSIGNED FK → `products.id` — **PK** |
| `addon_id` | BIGINT UNSIGNED FK → `addons.id` — **PK** |

**فهرس:** `PRIMARY KEY (product_id, addon_id)`, `INDEX(addon_id)`

---

## 4. جداول Orders — الأهم

### 4.1 `orders` — الطلبات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `branch_id` | BIGINT UNSIGNED FK | **عزل الفرع** |
| `cafe_table_id` | BIGINT UNSIGNED FK | |
| `order_number` | VARCHAR(20) **UNIQUE** | فريد، معروض في الفاتورة |
| `order_ref` | CHAR(24) **UNIQUE** | **عشوائي — لتتبع العميل بلا كشف id** |
| `status` | VARCHAR(20) | `NEW`…`REFUNDED` |
| `payment_status` | VARCHAR(20) | `UNPAID`/`PARTIALLY_PAID`/`PAID`/`REFUNDED` |
| `order_type` | VARCHAR(20) DEFAULT 'DINE_IN' | `DINE_IN`/`TAKEAWAY` |
| `customer_name` | VARCHAR(100) NULL | اختياري |
| `customer_phone` | VARCHAR(20) NULL | اختياري |
| `notes` | TEXT NULL | ملاحظة عامة |
| `items_subtotal` | **DECIMAL(10,2)** | مجموع العناصر |
| `discount_type` | VARCHAR(20) NULL | `PERCENT`/`FIXED` |
| `discount_value` | DECIMAL(10,2) DEFAULT 0 | |
| `discount_amount` | DECIMAL(10,2) DEFAULT 0 | **المحسوب — لا يُقبل من العميل** |
| `tax_rate` | DECIMAL(5,2) DEFAULT 0 | % |
| `tax_amount` | DECIMAL(10,2) DEFAULT 0 | |
| `total` | **DECIMAL(10,2)** | **المبلغ النهائي** |
| `source` | VARCHAR(20) | `QR`/`WAITER` |
| `is_archived` | TINYINT(1) DEFAULT 0 | Soft delete |
| `accepted_at` | DATETIME NULL | |
| `ready_at` | DATETIME NULL | |
| `served_at` | DATETIME NULL | |
| `completed_at` | DATETIME NULL | |
| `cancelled_at` | DATETIME NULL | |
| `cancel_reason` | VARCHAR(255) NULL | |
| `created_by` | BIGINT UNSIGNED FK → `users.id` NULL | الويتر إن أنشأ الطلب |
| `created_at` / `updated_at` | TIMESTAMP | |

**فهارس:**
```sql
INDEX (branch_id, status)          -- dashboards
INDEX (cafe_table_id, status)      -- طلبات الطاولة
INDEX (branch_id, created_at)      -- تقارير يومية
INDEX (status)                     -- polling للعدّادات
INDEX (payment_status)             -- الكاشير
UNIQUE (order_number), UNIQUE (order_ref)
```

> **`order_number` vs `order_ref`:**
> - `order_number` = `ORD-20260104-0001` — متسلسل، يظهر في الفاتورة.
> - `order_ref` = عشوائي 24 char — رابط تتبع العميل، **لا يكشف `id`**.

> **`total` يُحسب على الخادم فقط.** العميل يرسل `product_id` + `qty` + `option_value_ids`، والتطبيق يقرأ الأسعار من DB.

### 4.2 `order_items` — عناصر الطلب

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `order_id` | BIGINT UNSIGNED FK ON DELETE CASCADE | |
| `product_id` | BIGINT UNSIGNED FK | مرجع |
| `product_name` | VARCHAR(150) | **نسخة وقت الطلب** |
| `unit_price` | **DECIMAL(10,2)** | **نسخة وقت الطلب** |
| `quantity` | SMALLINT UNSIGNED | |
| `line_total` | **DECIMAL(10,2)** | `unit_price × qty` |
| `options_snapshot` | JSON NULL | نسخة الخيارات |
| `notes` | VARCHAR(255) NULL | "بدون سكر" |
| `prep_time_minutes` | SMALLINT UNSIGNED | **نسخة وقت الطلب** |
| `is_voided` | TINYINT(1) DEFAULT 0 | **إلغاء فردي** |
| `void_reason` | VARCHAR(255) NULL | |
| `created_at` / `updated_at` | | |

**فهارس:** `INDEX(order_id)`, `INDEX(product_id)`, `INDEX(order_id, is_voided)`

> **لماذا ننسخ `product_name` و `unit_price`؟** **التقارير التاريخية.** لو حذفت منتجاً أو غيّرت سعره، يجب أن تبقى الفواتير القديمة صحيحة — نمط **snapshot** أساسي في أنظمة POS.

> **`is_voided`:** يلغّي عنصراً واحداً **دون إلغاء الطلب كاملاً** (مشروب انسكب). المبلغ يُعاد حسابه تلقائياً.

### 4.3 `order_item_addons` — الإضافات المختارة

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `order_item_id` | BIGINT UNSIGNED FK ON DELETE CASCADE | |
| `addon_id` | BIGINT UNSIGNED FK | مرجع |
| `addon_name` | VARCHAR(100) | **نسخة وقت الطلب** |
| `price` | **DECIMAL(10,2)** | **نسخة وقت الطلب** |
| `quantity` | TINYINT UNSIGNED DEFAULT 1 | |
| `created_at` | | |

**فهرس:** `INDEX(order_item_id)`, `INDEX(addon_id)`

### 4.4 `order_item_options` — الخيارات المختارة

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `order_item_id` | BIGINT UNSIGNED FK ON DELETE CASCADE | |
| `product_option_id` | BIGINT UNSIGNED FK | مرجع |
| `option_value_id` | BIGINT UNSIGNED FK | مرجع |
| `option_name` | VARCHAR(100) | نسخة |
| `value_label` | VARCHAR(100) | نسخة |
| `price_adjustment` | DECIMAL(10,2) | نسخة |
| `created_at` | | |

**فهرس:** `INDEX(order_item_id)`

> **لماذا جدول منفصل مع وجود `options_snapshot` JSON؟** JSON للعرض السريع؛ هذا الجدول للتحليلات. **في v1 نكتفي بـ JSON**، وهذا الجدول يُضاف عند الحاجة الفعلية للتحليل — تفادياً لـ over-engineering.

### 4.5 `order_status_history` — سجل الانتقالات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `order_id` | BIGINT UNSIGNED FK ON DELETE CASCADE | |
| `from_status` | VARCHAR(20) NULL | NULL = إنشاء |
| `to_status` | VARCHAR(20) | |
| `changed_by` | BIGINT UNSIGNED FK → `users.id` NULL | NULL = نظام |
| `note` | VARCHAR(255) NULL | |
| `created_at` | | |

**فهرس:** `INDEX(order_id, created_at)`
### 4.6 `payments` — المدفوعات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `order_id` | BIGINT UNSIGNED FK | |
| `branch_id` | BIGINT UNSIGNED FK | للتقارير السريعة |
| `method` | VARCHAR(20) | `CASH`/`CARD`/`ONLINE`/`WALLET` |
| `amount` | **DECIMAL(10,2)** | المبلغ المدفوع |
| `amount_due` | DECIMAL(10,2) | المتبقي قبل هذه الدفعة |
| `change_amount` | DECIMAL(10,2) DEFAULT 0 | الباقي للعميل |
| `status` | VARCHAR(20) | `PENDING`/`PAID`/`FAILED`/`REFUNDED` |
| `transaction_ref` | VARCHAR(100) NULL | مرجع العملية |
| `gateway` | VARCHAR(30) NULL | `stripe`/`paymob` — **null في v1** |
| `gateway_response` | JSON NULL | |
| `paid_by` | BIGINT UNSIGNED FK → `users.id` | الكاشير |
| `created_at` / `updated_at` | | |

**فهارس:** `INDEX(order_id)`, `INDEX(branch_id, created_at)`, `INDEX(method)`

> **`amount_due` مهم:** يسمح بتتبع الدفع الجزئي بشكل صحيح.

> **`gateway` nullable:** حقل جاهز لـ Payment Gateway **بدون دمج أي gateway في v1** (متطلب صريح).

---

## 5. جداول Inventory — مصمّمة للتوسّع دون إعادة بناء

> **في v1 لا ننفّذ نظام مخزون معقّد** (متطلب صريح). لكن **الـ schema مصمّمة الآن** لتفعيله لاحقاً **دون إعادة بناء المشروع**.

### 5.1 `inventory_items` — مكونات المخزون

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `branch_id` | BIGINT UNSIGNED FK | |
| `name` | VARCHAR(100) | "حبوب البن" |
| `sku` | VARCHAR(50) NULL | كود مخزني |
| `unit` | VARCHAR(20) | `gram`/`ml`/`piece`/`kg`/`liter` |
| `current_stock` | DECIMAL(10,2) DEFAULT 0 | **الكمية الحالية** |
| `min_stock` | DECIMAL(10,2) DEFAULT 0 | حد إعادة الطلب |
| `unit_cost` | DECIMAL(10,2) DEFAULT 0 | سعر الشراء |
| `is_tracked` | TINYINT(1) DEFAULT 1 | **هل يُتتبَّع فعلياً؟** |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `created_at` / `updated_at` / `deleted_at` | | |

**فهارس:** `INDEX(branch_id, is_active)`, `UNIQUE(branch_id, sku)`

> **`is_tracked` مهم:** يسمح بتسجيل المكونات **بدون** خصم تلقائي في v1. لاحقاً نُفعّل الخصم بـ migration واحدة **دون تغيير الـ schema**.

### 5.2 `recipes` — وصفات المنتجات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `product_id` | BIGINT UNSIGNED FK → `products.id` | |
| `yield_quantity` | DECIMAL(10,2) DEFAULT 1 | كمية المنتج الناتجة |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `created_at` / `updated_at` / `deleted_at` | | |

**فهرس:** `UNIQUE(product_id)`

> مثال: Cappuccino → 1 كوباية

### 5.3 `recipe_items` — مكوّنات الوصفة

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `recipe_id` | BIGINT UNSIGNED FK ON DELETE CASCADE | |
| `inventory_item_id` | BIGINT UNSIGNED FK | |
| `quantity` | **DECIMAL(10,2)** | **18.00** |
| `waste_percent` | DECIMAL(5,2) DEFAULT 0 | **نسبة الفاقد** |

**فهرس:** `UNIQUE(recipe_id, inventory_item_id)`

> **مثال — Cappuccino:** Coffee Beans = 18g · Milk = 200ml · Sugar = 5g

> **`waste_percent` future-proofing:** يسمح بحساب الاستهلاك الفعلي شاملاً الفاقد. يُضاف الآن بـ default 0 ولا يُستخدم في v1.

### 5.4 `inventory_transactions` — حركة المخزون

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `inventory_item_id` | BIGINT UNSIGNED FK | |
| `branch_id` | BIGINT UNSIGNED FK | |
| `type` | VARCHAR(20) | `PURCHASE`/`CONSUMPTION`/`WASTE`/`ADJUSTMENT` |
| `quantity` | DECIMAL(10,2) | **موجب للمورد، سالب للاستهلاك** |
| `quantity_after` | DECIMAL(10,2) | **الرصيد بعد الحركة** |
| `reference_type` | VARCHAR(30) NULL | `order`/`purchase`/`manual` |
| `reference_id` | BIGINT UNSIGNED NULL | |
| `unit_cost` | DECIMAL(10,2) NULL | |
| `created_by` | BIGINT UNSIGNED FK → `users.id` NULL | |
| `notes` | VARCHAR(255) NULL | |
| `created_at` | | |

**فهارس:** `INDEX(inventory_item_id, created_at)`, `INDEX(branch_id, type, created_at)`

> **`quantity_after` snapshot:** يجعل رصيد أي لحظة قابل للتدقيق دون إعادة حساب كل الحركات.

> **`reference_type` + `reference_id` polymorphic:** يسمح بربط الحركة بطلب أو شراء دون أعمدة FK إضافية.

---

## 6. جداول Discounts & Settings

### 6.1 `discounts` — الخصومات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `branch_id` | BIGINT UNSIGNED FK NULL | NULL = كل الفروع |
| `name` | VARCHAR(100) | "خصم الموظف" |
| `code` | VARCHAR(30) NULL | كود نصي |
| `type` | VARCHAR(20) | `PERCENT`/`FIXED` |
| `value` | DECIMAL(10,2) | |
| `min_order_total` | DECIMAL(10,2) NULL | حد أدنى |
| `max_discount_amount` | DECIMAL(10,2) NULL | سقف الخصم |
| `usage_limit` | INT NULL | حد الاستخدام |
| `usage_count` | INT DEFAULT 0 | |
| `starts_at` | DATETIME NULL | |
| `ends_at` | DATETIME NULL | |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `created_by` | BIGINT UNSIGNED FK NULL | |
| `created_at` / `updated_at` / `deleted_at` | | |

**فهارس:** `INDEX(branch_id, is_active)`, `INDEX(code)`, `INDEX(starts_at, ends_at)`

### 6.2 `discount_redemptions` — استخدامات الخصم

| العمود | النوع |
|---|---|
| `id` | BIGINT UNSIGNED PK |
| `discount_id` | BIGINT UNSIGNED FK |
| `order_id` | BIGINT UNSIGNED FK |
| `amount` | DECIMAL(10,2) — المبلغ المخصوم |
| `created_at` | |

**فهرس:** `UNIQUE(discount_id, order_id)`, `INDEX(order_id)`

> **`UNIQUE(discount_id, order_id)`** يمنع استخدام نفس الخصم مرتين على نفس الطلب.

### 6.3 `settings` — الإعدادات

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `branch_id` | BIGINT UNSIGNED NULL | **0 = إعدادات عامة** |
| `key` | VARCHAR(80) | `cafe_name`, `currency`, `tax_rate` |
| `value` | TEXT NULL | أي قيمة (نص/JSON) |
| `type` | VARCHAR(20) | `string`/`int`/`bool`/`json` |
| `updated_by` | BIGINT UNSIGNED FK NULL | |
| `created_at` / `updated_at` | | |

**فهرس:** `UNIQUE(branch_id, key)`

**مفاتيح مقترحة:** `cafe_name`, `cafe_phone`, `cafe_address`, `currency`, `currency_symbol`, `tax_enabled`, `tax_rate`, `tax_inclusive`, `service_charge`, `order_prefix`, `kitchen_sla_minutes`, `invoice_template`, `allow_takeaway`

> **لماذا `branch_id = 0` بدل NULL؟** في MySQL لا يسمح `UNIQUE` بتكرار NULL. استخدام `0` يضمن uniqueness للإعدادات العامة.

### 6.4 `audit_logs` — سجل التدقيق

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `user_id` | BIGINT UNSIGNED FK NULL | NULL = نظام |
| `branch_id` | BIGINT UNSIGNED NULL | |
| `action` | VARCHAR(60) | `product.update`, `order.cancel` |
| `entity_type` | VARCHAR(50) | `Product`, `Order`, `User` |
| `entity_id` | BIGINT UNSIGNED NULL | |
| `old_values` | JSON NULL | **قبل التعديل** |
| `new_values` | JSON NULL | **بعد التعديل** |
| `ip_address` | VARCHAR(45) NULL | يدعم IPv6 |
| `user_agent` | VARCHAR(255) NULL | |
| `created_at` | | |

**فهارس:** `INDEX(user_id, created_at)`, `INDEX(entity_type, entity_id)`, `INDEX(branch_id, created_at)`, `INDEX(action, created_at)`

> **بدون `updated_at`:** سجل التدقيق **لا يُعدَّل ولا يُحذف أبداً** — للقراءة فقط.

> **`old_values` / `new_values` JSON:** تخدم أي كيان — **لا نضيف أعمدة جديدة لكل نوع تعديل**.

---

## 7. جداول Laravel system

| الجدول | الغرض | مطلوب؟ |
|---|---|:---:|
| `jobs` | طابور المهام (مطلوب لـ `QUEUE_CONNECTION=database`) | ✅ |
| `job_batches` | دفعات المهام | ✅ |
| `failed_jobs` | تشخيص المهام الفاشلة عبر `queue:failed` | ✅ |
| `cache` / `cache_locks` | `Cache::remember` للمنيو + `RateLimiter` | ✅ |
| `sessions` | جلسات المستخدمين | ✅ |
| `personal_access_tokens` | API tokens | ❌ لا نحتاجه (session auth كافٍ) |

> `sessions.user_id` يسمح بـ **"تسجيل الخروج من كل الأجهزة"**.

---

## 8. الملخص — متى نحتاج كل جدول

| الجدول | Phase | السبب |
|---|---|---|
| `branches`, `cafe_tables` | 1 | QR والفرع |
| `roles`, `permissions`, `role_permission`, `users` | 1 | RBAC أساسي |
| `settings`, `audit_logs` | 1 | إعدادات + أمن |
| `categories`, `products`, `product_options`, `product_option_values`, `addons`, `product_addon_map` | 2 | منيو العميل |
| `orders`, `order_items`, `order_item_addons`, `order_status_history` | 2 | الطلبات |
| `payments` | 4 | الدفع |
| `order_item_options` | 5 | **v1 نكتفي بـ JSON** — يُضاف عند الحاجة للتحليل |
| `discounts`, `discount_redemptions` | 5 | الخصومات |
| `inventory_items`, `recipes`, `recipe_items`, `inventory_transactions` | 6 | المخزون (مؤجل لكن **التصميم جاهز**) |

> **الاستراتيجية:** الـ schema **مخططة بالكامل الآن**. ننشئ migrations للجداول الأساسية في Phase 1، والمؤجلة في الـ phase المناسب. **لا إعادة بناء.**

---

## 9. المخطط النهائي — عدد الجداول

```text
Core (6):        branches, cafe_tables, roles, permissions,
                 role_permission, users
Menu (6):        categories, products, product_options,
                 product_option_values, addons, product_addon_map
Orders (6):      orders, order_items, order_item_addons,
                 order_item_options, order_status_history, payments
Inventory (4):   inventory_items, recipes,
                 recipe_items, inventory_transactions
Config (4):      settings, discounts,
                 discount_redemptions, audit_logs
Laravel (5):     jobs, job_batches, failed_jobs, cache, sessions
─────────────────────────────
المجموع: 31 جدول
```

> **31 جدول لمشروع كافيه — معقول وليس مبالغاً فيه.** لكل جدول **سبب واضح** (§8). الـ 31 تشمل 5 جداول Laravel system + 4 مخزون مؤجل.

---

## 10. استعلامات التقارير — التحقق من كفاية الفهارس

| التقرير | الاستعلام | الفهرس المستخدم |
|---|---|---|
| مبيعات اليوم | `SUM(total) WHERE branch_id=? AND created_at BETWEEN ? AND ? AND status='COMPLETED'` | `(branch_id, created_at)` |
| طلبات اليوم | `COUNT(*) WHERE branch_id=? AND created_at...` | `(branch_id, created_at)` |
| الأكثر مبيعًا | `JOIN order_items GROUP BY product_id ORDER BY SUM(qty)` | `order_items(product_id)` |
| طلبات المطبخ | `WHERE branch_id=? AND status='NEW'` | `(branch_id, status)` |
| عدّاد Polling | `COUNT(*) WHERE branch_id=? AND status=?` | `(branch_id, status)` |
| طلبات الطاولة | `WHERE cafe_table_id=? AND status NOT IN (...)` | `(cafe_table_id, status)` |
| طاولات غير مدفوعة | `WHERE payment_status != 'PAID'` | `orders(payment_status)` |

> **كل تقرير يغطيه فهرس مُعرَّف مسبقاً** — لا نكتشف مشكلة أداء بعد الإطلاق.

---

## 11. Migration Strategy

> **قاعدة التطوير #3: لا تغيّر schema بدون migration.**

### 11.1 ترتيب الـ Migrations

```text
Phase 1:  001_branches_table
          002_roles_table
          003_permissions_table
          004_role_permission_table
          005_users_table
          006_settings_table
          007_audit_logs_table
          008_laravel_system_tables  (sessions, cache, jobs...)

Phase 2:  010_cafe_tables_table
          011_categories_table
          012_products_table
          013_product_options_table
          014_product_option_values_table
          015_addons_table
          016_product_addon_map_table
          017_orders_table
          018_order_items_table
          019_order_item_addons_table
          020_order_status_history_table

Phase 4:  030_payments_table

Phase 5:  040_discounts_table
          041_discount_redemptions_table
          042_order_item_options_table

Phase 6:  050_inventory_items_table
          051_recipes_table
          052_recipe_items_table
          053_inventory_transactions_table
```

### 11.2 قواعد المigration

| القاعدة | السبب |
|---|---|
| **لا تعديل migration مُطبَّقة أبداً** | كسر الـ migration history |
| migration جديدة فقط | أمان + قابلية تتبع |
| `down()` دائماً موجود | rollback |
| Foreign keys بـ `constrained()` | سلامة referential |
| `index()` في نفس الـ migration | لا ننسى |
| Test على Staging أولاً | قبل الإنتاج |

> **لا نكتب `DROP TABLE` في الإنتاج.** `migrate:rollback` يعمل فقط على Staging/local.

### 11.3 Seeders

```text
RoleSeeder:        owner, manager, waiter, kitchen, cashier
PermissionSeeder:  كل الـ permissions + ربطها بالأدوار
BranchSeeder:      فرع تجريبي (Staging فقط)
UserSeeder:        حساب owner (كلمة المرور من .env)
TableSeeder:       طاولات مع public_token عشوائي
```

> **لا توجد بيانات وهمية في production logic.** الـ Seeders للبيانات المرجعية (الأدوار، الصلاحيات) فقط. بيانات تجريبية (منتجات، طلبات) **اختيارية** وتعمل فقط في `local`/`staging` عبر `AppServiceProvider` check على `app()->environment()`.

---

## 12. خلاصة قرارات قاعدة البيانات

| القرار | السبب |
|---|---|
| **`BIGINT UNSIGNED` PK** | أداء + مساحة |
| **`DECIMAL(10,2)` للأسعار** | دقة مالية صحيحة |
| **`utf8mb4`** | دعم العربية + الإيموجي |
| **`InnoDB`** | transactions + FKs |
| **`VARCHAR` لا `ENUM`** | قابلية التوسّع |
| **Snapshot في `order_items`** | صحة التقارير التاريخية |
| **`is_tracked` في inventory** | تفعيل المخزون دون إعادة بناء |
| **`waste_percent`** | future-proofing بلا تكلفة |
| **Polymorphic refs** | مرونة بلا أعمدة زائدة |
| **`branch_id = 0` للعموميات** | uniqueness في MySQL |
| **`public_token` لـ QR** | أمان — لا كشف `id` |
| **Audit logs JSON** | مرونة بلا جدول per-entity |
| **31 جدول معقول** | سبب واضح لكل جدول |

---

> **انتهى تصميم قاعدة البيانات.** لم يُنشأ أي migration بعد — في انتظار الموافقة.

**المراجع:**
- [`CAFE-SYSTEM-ARCHITECTURE.md`](./CAFE-SYSTEM-ARCHITECTURE.md)
- [`HOSTINGER-DEPLOYMENT.md`](./HOSTINGER-DEPLOYMENT.md)
