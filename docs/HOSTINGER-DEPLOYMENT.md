> ## ✅ APPROVED DEPLOYMENT TARGET — Phase 1 (supersedes MySQL specifics below)
> **Effective: 2026-10 · Host: Hostinger Business · DB/Auth: Supabase**
>
> This banner is authoritative. The body below describes a **Hostinger MySQL**
> deployment; those database specifics are **superseded**. The database and
> authentication platform is now **Supabase** (PostgreSQL + Supabase Auth), not a
> Hostinger MySQL database.
>
> | Item | Approved value |
> |---|---|
> | Host | **Hostinger Business** shared hosting |
> | Production domain | **`https://skoon.awexen.com`** |
> | App runtime | **Next.js (App Router)** Node server |
> | Database | **Supabase PostgreSQL** (external managed DB) |
> | Authentication | **Supabase Auth** |
> | Image storage | **Supabase Storage** (proposed) |
>
> **User statement (not independently verified by this audit):** the Hostinger
> Business plan supports Next.js SSR. The concrete runtime/build details below are
> **unverified** and MUST be confirmed in the Hostinger control panel / official
> current docs before relying on them. Nothing has been deployed; no DNS changed.
>
> ### Verification checklist (must be confirmed before production)
> - [ ] Next.js **SSR / Route Handler** runtime supported on the actual plan.
> - [ ] Supported **Node.js version** (Next.js 15 requires a recent Node LTS).
> - [ ] Exact **build** (`npm install` + `next build`) and **start** (`next start`
>       or standalone) commands, and how the process is kept alive.
> - [ ] **Environment variable** configuration in hPanel (no secrets in Git).
> - [ ] **Prisma Client generation** during build (`postinstall: prisma generate`).
> - [ ] **Supabase connectivity** from Hostinger — pooled (`pgBouncer`, 6543) vs
>       direct (5432); IPv4/IPv6 egress; TLS required by Supabase.
> - [ ] **Supabase Auth** reachable (auth host + keys as env, never in client bundle).
> - [ ] **HTTPS** + custom subdomain `skoon.awexen.com` (SSL, DNS) configuration.
> - [ ] **Image storage** — Supabase Storage vs local (shared-hosting FS may be ephemeral).
> - [ ] **GitHub deployment** integration (auto-deploy on push to `main`).
>
> ---

# Hostinger Deployment Guide — Next.js

> **Phase 0 v2 — Next.js on Hostinger Business**
> التطبيق: **Node.js app** (وليس PHP)
> الاستضافة: **Hostinger Business Shared Hosting — بدون VPS**

---

## ⚡ v2 Changes

| Item | v1 (Superseded) | **v2 (Current)** |
|---|---|---|
| App type | PHP (Laravel) | **Node.js (Next.js)** |
| Framework preset | — | **`next`** |
| Build | `composer install` | **`npm install` + `next build`** |
| Output | `vendor/` | **`.next`** |
| Start | cron + `artisan` | **Hostinger يشغّل standalone server** |
| Deploy trigger | Git copy files | **GitHub push → full pipeline** |
| Migrations | `artisan migrate` | **`npx prisma migrate deploy`** |

> 🔴 **محتوى §§3–16 في v1 كان PHP — محجوب بالكامل.**
> هذا المستند هو البديل الكامل.

---

## 0. اقرأ هذا أولاً

| الوثيقة | متى |
|---|---|
| [`NEXTJS-HOSTINGER-VALIDATION.md`](./NEXTJS-HOSTINGER-VALIDATION.md) | **الآن** — feasibility |
| هذا المستند | عند النشر الفعلي |

**القاعدة الذهبية:**
> ⚠️ "Files in `hbuilds/` and `public_html` are **overwritten on every
> deployment**. Direct edits via File Manager, FTP, or SSH are
> **not supported**."
> → **الكود كله من Git. أي تعديل يدوي يضيع.**

---

## 0.1 Pre-Deployment Verification

```text
☐  1. Websites → Add Website → Node.js web app  ← متاح؟
☐  2. Smoke Test نجح؟ (validation doc §G.2)
☐  3. Node version؟ (18/20/22/24)
☐  4. Performance → Usage → CPU limit, RAM limit
☐  5. Databases → كم قاعدة؟ حجمها؟
☐  6. SSL مفعّل؟
☐  7. SSH → node -v   → يعمل؟
☐  8. SSH → npm -v    → يعمل؟
☐  9. SSH → df -h     → كم مساحة؟
☐ 10. Cron Jobs → متاح؟
```

> ❓ كل البنود أعلاه **UNKNOWN** في التوثيق — تحقّق منها بنفسك.

---

## 1. Environment Variables

> **تُضبط من hPanel — خارج Git.**

```text
hPanel → Websites → yourcafe.com → Environment variables → Add
```

### 1.1 Required

| Key | Value | ملاحظة |
|---|---|---|
| `DATABASE_URL` | `mysql://uXXX_admin:PASS@127.0.0.1:3306/uXXX_cafe` | ⚠️ **`127.0.0.1`** |
| `AUTH_SECRET` | (32+ chars عشوائي) | `openssl rand -base64 32` |
| `APP_URL` | `https://yourcafe.com` | بدون `/` |

### 1.2 Optional

| Key | Default | ملاحظة |
|---|---|---|
| `CRON_SECRET` | — | لـ protected cron routes |
| `LOG_LEVEL` | `info` | للتشخيص |

### 1.3 ⚠️ قواعد مهمة

| القاعدة | السبب |
|---|---|
| ⚠️ **التغيير يحتاج redeploy** | "Saving redeploys the application" |
| ⚠️ **max 1,000** vars · key ≤ 255 · `A-Z 0-9 _` | قيد Hostinger |
| ✅ **مشفّرة** في ملف محمي | آمن |
| ✅ **`.env.example` في Git** | نموذج بدون secrets |
| ❌ **`.env` الحقيقي لا يُرفع** | قاعدة التطوير #4 |

### 1.4 توليد secret

```bash
openssl rand -base64 32
# أو
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 2. Database Setup

### 2.1 الإنشاء من hPanel

```text
hPanel → Databases → MySQL Databases → Create database

Database name:  u123456789_cafe     (Hostinger يضيف u123456789_ تلقائياً)
Username:       u123456789_admin    (يُنشأ تلقائياً)
Password:       [قوية 20+ حرف]  ← سجّلها في مدير كلمات المرور
```

> ⚠️ **ولّد كلمة مرور بدون `@ # : /`** — يتجنّب مشاكل URL encoding في `DATABASE_URL`.

### 2.2 ⚠️ `127.0.0.1` وليس `localhost`

> **من توثيق Hostinger الرسمي:**
> *"Node.js connects over TCP and resolves `localhost` to the IPv6 loopback
> address `::1`, which your database user may not be granted for — so the
> connection is refused: `127.0.0.1` forces IPv4 and works on every account."*

### 2.3 اترك القاعدة فارغة

```bash
# عبر SSH بعد أول deploy
cd ~/domains/YOUR_DOMAIN/hbuilds/current/nodejs
npx prisma migrate deploy
```

> **لماذا؟** migrations هي **المصدر الوحيد للحقيقة**.

---

## 3. The Deployment Pipeline

```text
Local
  git push origin main
       ↓ GitHub webhook
Hostinger (fully managed)
  1. npm install          (auto-detect lockfile)
  2. npm run build        (next build → .next)
  3. start standalone server
       ↓
Running at ~/domains/{domain}/hbuilds/current/nodejs
```

**Build limits (موثقة):**

| البند | القيمة |
|---|---|
| Dependency install timeout | **15 دقيقة** |
| Build script timeout | **15 دقيقة** |
| Concurrent builds | 1/site (طابور حتى 20) |
| Build logs | آخر 10 deploys |
| Version retention | **النسخة الحية فقط** |

### 3.1 hPanel Settings

```text
Application type:    next          (auto-detected)
Node.js version:     22 (LTS)  ✅
Root directory:      (فارغ)
Build script:        build         ← next build
Output directory:    .next
Entry file:          (فارغ)       ← Next.js ignores it
Package manager:     npm           (auto)
Branch:              main
```

### 3.2 package.json

```json
{
  "name": "cafe-system",
  "private": true,
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "postinstall": "prisma generate"
  },
  "prisma": { "schema": "prisma/schema.prisma" }
}
```

> ⚠️ **`postinstall: prisma generate` إلزامي** — بدونه يفشل build
> (الـ client غير مُولّد).

### 3.3 Startup — ماذا يحدث فعلاً؟

| السؤال | الإجابة |
|---|---|
| يُشغّل `next start`؟ | ❌ لا — "starts their standalone server for you" |
| يحتاج entry file؟ | ❌ لا |
| يُحدَّد PORT يدوياً؟ | ❌ لا — Hostinger يدير الربط |
| لو انهار؟ | ✅ **يعيد التشغيل تلقائياً** |

### 3.4 بدائل النشر

| الطريقة | متى | الحالة |
|---|---|---|
| **GitHub auto-deploy** | الافتراضي | ✅ موصى به |
| **Archive upload** | فشل GitHub App | ✅ مدعوم |
| **Hostinger Connector** | نشر من VS Code | ✅ مدعوم |
| SSH + manual | طوارئ | ⚠️ يُمحى عند deploy |

## 4. SSL

### 4.1 التفعيل

```text
hPanel → Websites → yourcafe.com → Security → SSL
  → Activation → Free (Let's Encrypt)
  → Domain: yourcafe.com + www.yourcafe.com
  → Activate
```

### 4.2 Checklist بعد التفعيل

```text
☐ APP_URL = https:// (بدون http)
☐ كل روابط المشروع تستخدم https
☐ لا Mixed Content
☐ اختبار: http://yourcafe.com يحوّل تلقائياً
☐ session cookie: Secure + httpOnly + SameSite=Lax
```

---

## 5. File Uploads — ⚠️ نقطة حرجة

> ⚠️ **`hbuilds/` و `public_html` يُستبدلان كل deploy.**
> تخزين صور المنتجات في `public_html/uploads/` خطر — **قد تُمحى**.

### 5.1 الحل المعتمد: DB blob

```text
الصور → MySQL LONGBLOB  (products.image_data)
العرض → Route Handler: GET /api/images/[id]
```

**لماذا:**
- ✅ لا تضيع عند deploy
- ✅ لا external service
- ✅ تكلفة صفر
- ⚠️ حجم: كافيه ~100 منتج × 200KB = ~20MB — MySQL يتعامل معه بسهولة

### 5.2 ⚠️ عند التوسع (>2000 صورة)

```text
Cloudflare R2 أو S3  →  ~$0-2/شهر
```

> ❌ ليس مطلوباً الآن. **لكن يجب أن يكون الـ model قابلاً للتبديل:**
> التخزين عبر interface واحد (`StorageProvider`) يُبدَّل من `db` إلى `s3` دون لمس بقية الكود.

### 5.3 حماية uploads (إن استُخدمت مجلدات)

```apache
# public_html/uploads/.htaccess
<FilesMatch "\.(php|phtml|php3|php4|php5|php7|phps|phar)$">
    Require all denied
</FilesMatch>
Options -Indexes
```

> **لماذا حرج:** ملف `.php` متنكّر كصورة + PHP مفعّل = **RCE**.

### 5.4 Upload validation (إلزامي)

```text
✅ MIME sniff حقيقي (finfo) — لا نثق بامتداد الملف
✅ حجم ≤ 2MB
✅ امتداد صورة فقط (jpg/png/webp)
✅ اسم UUID — يمنع path traversal
✅ إعادة تحجيم قبل الحفظ
```

---

## 6. Cron Jobs

> **V1: للتنظيف والتقارير فقط.** لا background jobs ثقيلة.

### 6.1 Setup

```text
hPanel → Advanced → Cron Jobs → Create Cron Job

Schedule:  * * * * *   (كل دقيقة)
Command:   curl -s https://yourcafe.com/api/cron/tick
```

> ⚠️ **`curl` وليس `node`** —❓ مدى توفر `node` في PATH بيئة cron
> غير مؤكد. `curl` يعمل دائماً.

### 6.2 محمية

```ts
// app/api/cron/tick/route.ts
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  // ... logic
}
```

### 6.3 المهام المجدولة

| Job | التكرار | الغرض |
|---|---|---|
| `sessions:cleanup` | كل ساعة | حذف جلسات منتهية |
| `stale-orders:check` | كل 5 د | تنبيه طلبات معلّقة |
| `reports:daily` | 00:05 | تجقرير مبيعات اليوم |

> ⚠️ **لا تُشغّل migrations على cron** — قد يتعارض مع deploy.

---

## 7. Backups

### 7.1 من hPanel

```text
hPanel → Websites → yourcafe.com → Backups → Backup Now
أو Schedule: يومي / أسبوعي
```

### 7.2 ⚠️ نسخة خارجية (ضرورية)

**⚠️ Hostinger قد يوقف الخدمة. لا تعتمد على نسخهم وحدها.**

```text
1. hPanel Backup (يومي)
2. نسخة خارجية أسبوعية:
   - phpMyAdmin → Export → .sql محلياً
   - نسخة من .env في مدير كلمات مرور آمن
   - Code في GitHub (تلقائي)
   - خزّن .sql في Google Drive / OneDrive
```

> **10 دقائق أسبوعياً تحميك من فقدان كل شيء.**

---

## 8. Rollback

### 8.1 Rollback للكود

> ⚠️ **لا يوجد per-commit rollback في Hostinger.** التوثيق:
> *"There is no per-commit rollback: to ship an older version, revert
> or reset in Git and push, or upload the older archive."*

```bash
# revert إلى commit سابق
git log --oneline -5
git revert HEAD          # أو git revert <hash>
git push origin main     # → auto-deploy
```

أو: **hPanel → Deployments → Redeploy** (يعيد آخر commit).

### 8.2 ⚠️ Rollback للقاعدة

```bash
# ⭐ أولاً — دائماً
mysqldump -u USER -p DBNAME > backup_before_rollback.sql

npx prisma migrate status
npx prisma migrate resolve --rolled-back 0X0X_migration_name
npx prisma migrate deploy
```

> ⚠️ **قد تُفقد بيانات.** خذ backup دائماً.

### 8.3 خطة الطوارئ

```text
الموقع down؟
  1. hPanel → Deployments → هل آخر build فشل؟
  2. hPanel → Runtime Logs → اقرأ الخطأ
  3. hPanel → Redeploy (إعادة بناء من آخر commit ناجح)
  4. تحقق من Env vars — هل نُسي أحدها؟
  5. تحقق من DATABASE_URL — هل يتصل؟
  6. راجع §9 للأخطاء الشائعة
```
## 9. Troubleshooting

### 9.1 أخطاء شائعة

| الخطأ | السبب | الحل |
|---|---|---|
| `Build failed` — Prisma | `generate` لم يعمل | تأكد `postinstall: prisma generate` |
| `Can't reach database server` | `localhost` بدل `127.0.0.1` | ✅ غيّر لـ `127.0.0.1` |
| `Access denied` | بيانات DB خاطئة | تحقق `DATABASE_URL` |
| `Table doesn't exist` | migrations لم تُشغّل | `npx prisma migrate deploy` |
| `Module not found: .prisma/client` | generate لم يعمل | `npx prisma generate` |
| `502 Bad Gateway` | process يتعثر | Runtime Logs → اقرأ الخطأ |
| Build نجح لكن الموقع قديم | cache | Clear Hostinger cache + browser |
| `ENOMEM` / OOM | build كبير | `NODE_OPTIONS=--max-old-space-size=2048` |
| Env var undefined | لم تُضبط / تحتاج redeploy | hPanel → Save → Redeploy |
| Site works locally fails prod | إصدارات مختلفة | طابق `engines.node` |

### 9.2 Diagnostic Commands

```bash
# حجم المشروع
du -sh ~/domains/YOUR_DOMAIN/hbuilds/current/nodejs

# node_modules حجم
du -sh ~/domains/YOUR_DOMAIN/hbuilds/current/nodejs/node_modules

# اتصال DB (اختبار)
cd ~/domains/YOUR_DOMAIN/hbuilds/current/nodejs
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRaw\`SELECT 1\`.then(()=>console.log('DB OK')).catch(e=>console.error(e.message))"

# حالة hbuilds
ls -la ~/domains/YOUR_DOMAIN/hbuilds/
ls -la ~/domains/YOUR_DOMAIN/hbuilds/versions/
```

### 9.3 Logs

```text
Build logs:  hPanel → Deployments → (row) → Build log
Runtime logs: hPanel → Runtime Logs

Runtime logs نصائح:
✅ اكتب لـ console.log / console.error — لا لملف
✅ buffer = 5,000 سطر — راقب العداد
✅ كل redeploy يبدأ buffer جديد
```

### 9.4 Performance Tuning

```text
┌─────────────────────────────────────────────────────┐
│  1. Instrumentation أولاً                            │
│     hPanel → Performance → Usage → راقب CPU/RAM       │
│     hPanel → Runtime Logs → راقب أخطاء و بطء          │
│                                                      │
│  2. Optimizations حسب القياس:                        │
│     · DB indexes → راجع DATABASE-DESIGN §10          │
│     · Pagination → كل قائمة                          │
│     · Eager loading → Prisma include                 │
│     · caching → next: { revalidate } للمنيو          │
│     · images → next/image                            │
│                                                      │
│  3. لا تحسّن قبل القياس ❌                           │
└─────────────────────────────────────────────────────┘
```

> ❓ **OPcache غير منطبق** — OPcache خاص بـ PHP. Next.js يستخدم V8 compile cache داخلياً.

---

## 10. Post-Deployment Checklist

### 10.1 وظيفي
```text
☐  فتح المنيو عبر QR يعمل
☐  إرسال طلب من QR ينجح
☐  الطلب يظهر في شاشة المطبخ
☐  Accept → Preparing → Ready يعمل
☐  Ready يظهر في شاشة الويتر
☐  تسجيل الدفع يعمل
☐  الفاتورة تُطبع
☐  Dashboard يعرض أرقاماً صحيحة
☐  تسجيل دخول الموظف يعمل
☐  RTL/LTR يعمل
```

### 10.2 أمني
```text
☐  HTTPS مفعّل ويُجبَر
☐  NODE_ENV = production
☐  .env غير متاح عبر web
☐  hbuilds غير قابل للوصول
☐  uploads لا ينفّذ PHP
☐  DB password قوية
☐  AUTH_SECRET 32+ chars
☐  .env الحقيقي ليس في Git
```

### 10.3 تقني
```text
☐  Build ينجح خلال 15 د
☐  Runtime Logs يعرض stdout
☐  GitHub auto-deploy مربوط
☐  DATABASE_URL = 127.0.0.1
☐  prisma migrate deploy نجح
☐  cron يعمل
☐  Backup مجدول مفعّل
☐  .env.example في Git
```

---

## 11. Summary

| المرحلة | التفاصيل |
|---|---|
| **0. Verify** | §0.1 checklist |
| **1. Prepare** | DB + SSL + GitHub repo |
| **2. First deploy** | GitHub App → build → standalone server |
| **3. Migrations** | `npx prisma migrate deploy` عبر SSH |
| **4. Configure** | Env vars + cron + backups |
| **5. Test** | §10 checklist كامل |
| **6. Monitor** | Runtime Logs + Performance Usage |
| **7. Maintain** | deploy دوري + weekly external backup |

---

> **انتهى دليل النشر.** لم يُنفّذ أي deploy.

**المراجع:**
- [NEXTJS-HOSTINGER-VALIDATION.md](./NEXTJS-HOSTINGER-VALIDATION.md)
- [CAFE-SYSTEM-ARCHITECTURE.md](./CAFE-SYSTEM-ARCHITECTURE.md)

---
---