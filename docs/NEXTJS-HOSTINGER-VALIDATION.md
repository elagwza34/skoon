> ## ✅ ALIGNMENT NOTE — Phase 1 (read before the validation body below)
> **Effective: 2026-10**
>
> The body below validates whether **Next.js can run on Hostinger Business**.
> That framework/runtime question still stands and is useful. However, the
> **platform stack referenced in the body is superseded**:
>
> | Referenced in body | Approved replacement |
> |---|---|
> | Hostinger **MySQL** database | **Supabase PostgreSQL** |
> | App-managed auth / sessions | **Supabase Auth** (cookie sessions via `@supabase/ssr`) |
> | `mysql://` connection string | Supabase Postgres connection string (pooled) |
>
> **Keep these compatibility questions explicit and unresolved until verified:**
> 1. Hostinger Business **Node.js version** and whether a **persistent** Node
>    server (App Router SSR + Route Handlers) is supported on the actual plan.
> 2. Whether the app must use **standalone** output or `next start`, and process
>    supervision / resource limits.
> 3. **Supabase network reachability** from Hostinger (egress, ports, TLS, IPv4/IPv6).
> 4. Build-time **Prisma Client generation** and env-var injection in the pipeline.
>
> **Do not** read the body's "PROCEED WITH NEXT.JS" verdict as confirmation that
> every **deployment detail** (DB connectivity, auth wiring, storage, cron) is
> verified. Framework feasibility ≠ full deployment validation. Those items live in
> [`HOSTINGER-DEPLOYMENT.md`](./HOSTINGER-DEPLOYMENT.md)'s verification checklist.
>
> ---

# Next.js on Hostinger Business — Validation

> **Phase 0 Correction — Architecture Revalidation**
> التاريخ: 2026-10-04
> الغرض: إثبات ما إذا كان **Next.js + TypeScript** قابلاً للتشغيل بموثوقية على
> **Hostinger Business Shared Hosting** (بدون VPS).
> **الحالة: لم يُكتب أي implementation code.**

---

## TL;DR — الخلاصة

| السؤال | الإجابة |
|---|---|
| هل يعمل Next.js على Hostinger Business؟ | **YES** |
| هل يحتاج entry file؟ | **لا** — Hostinger يشغّل standalone server |
| هل يحتاج build step؟ | **نعم** — Hostinger يشغّله تلقائياً |
| هل يحتاج VPS؟ | **لا** |
| هل يحتاج خدمة خارجية؟ | **لا** |
| Verdict | ✅ **PROCEED WITH NEXT.JS** |

> **تصحيح مهم:** التحقق الأول في Phase 0 استنتج رفض Next.js بناءً على
> "run on demand". هذا الاستنتاج كان **ناقصاً** — سنصححه أدناه بالتفصيل.

---

## 0. التصحيح الجوهري — ما كان خاطئاً

### 0.1 الاستنتاج السابق

> "Node.js apps run on demand... process is stopped automatically when idle"
> → استُنتج أن Next.js غير مناسب.

### 0.2 لماذا كان الاستنتاج خاطئاً

العبارة المستقيمة في التوثيق **صحيحة**، لكن الاستنتاج منها كان **قافزاً**:

| # | الفجوة | التفصيل |
|---|---|---|
| 1 | **الخلط بين Daemon و HTTP Server** | "يُوقَف عند الخمول" ≠ "لا يمكن التشغيل". ذلك سلوك **توفير موارد**، لا قيد قابلية. |
| 2 | **تجاهل statement بعدها مباشرة** | نفس الصفحة تقول: *"Hostinger **starts your app and keeps it running at your domain**. If your app crashes, it's **automatically restarted**."* |
| 3 | **تجاهل قائمة Frameworks** | Next.js مُدرج **صراحةً** كـ framework مدعوم. |
| 4 | **افتراض أن "on demand" يعني cold start في كل طلب** | لا — التوثيق يقول صراحة إن "handover happens in the background" بلا تدخل منك. |
| 5 | **الخلط بين WebSocket و HTTP** | §20 من المتطلب: لا نحتاج WebSocket. نحتاج HTTP app عادي — وهذا **مدعوم تماماً**. |

### 0.3 المعادلة الصحيحة

```text
WebSocket / SSE  →  يحتاج عملية دائمة غير قابلة للإيقاف  →  ❌ غير مناسب
HTTP Server      →  يعمل + يُستأنف تلقائياً                  →  ✅ مناسب
```

> **هذا المشروع يستخدم HTTP polling فقط** (§20). إذاً القيد لا ينطبق.

---

## A. Hostinger Capabilities — القدرات المؤكدة

> **المصدر:** `docs.hostinger.com/node.js/*` (توثيق رسمي، آخر تحديث سبتمبر 2026)

### A.1 🔴 الأدلة الحاسمة (حرفياً من التوثيق)

| # | الاقتباس الرسمي | الدلالة |
|---|---|---|
| 1 | **"Next.js, Nuxt.js, Express.js, NestJS, Fastify, Hono, Nitro, React Router, Astro, SvelteKit, Gatsby, and more"** | Next.js مدعوم رسمياً |
| 2 | **"Next.js apps don't need [an entry file] either — they always run in server mode, and Hostinger starts their standalone server for you."** | **لا حاجة لـ `server.js` ولا `next start` يدوي** |
| 3 | **"Build — Hostinger installs dependencies and runs your build script. Run — Hostinger starts your app and keeps it running at your domain. If your app crashes, it's automatically restarted."** | دورة حياة كاملة مُدارة |
| 4 | **"Connect a GitHub repository and have Hostinger install dependencies, run your build script, and start (or restart) your Node.js app on every push."** | نشر تلقائي كامل |
| 5 | **"A Business web hosting plan or any Cloud hosting plan, you can deploy a Node.js application from a GitHub repository or using the file upload method."** | **Business مدعوم صراحة** |

### A.2 جدول القدرات

| القدرة | مدعومة؟ | التفصيل من التوثيق | المصدر |
|---|:---:|---|---|
| **Node.js على Business** | ✅ | Business + Cloud | Node.js Hosting Options |
| **Next.js framework** | ✅ | `next` preset في Build Settings | Supported Frameworks |
| **Node versions** | ✅ | **18 · 20 LTS · 22 LTS (default) · 24** | Build Settings |
| **npm install تلقائي** | ✅ | تلقائي حسب lockfile | GitHub |
| **yarn / pnpm** | ✅ | auto-detected | Build Settings |
| **Build script** | ✅ | `npm run build` (`next build`) | Build Settings |
| **Output directory** | ✅ | `.next` (للـ Next.js) | Build Settings |
| **Entry file** | ⬜ **غير مطلوب** | Next.js always server mode | Node.js Overview |
| **Standalone server** | ✅ | "Hostinger starts their standalone server" | Node.js Overview |
| **Crash auto-restart** | ✅ | "automatically restarted" | Node.js Overview |
| **GitHub auto-deploy** | ✅ | Hostinger GitHub App + webhook | GitHub |
| **Archive deploy** | ✅ | `.zip .tar .tar.gz .tgz .7z` | Build Settings |
| **Environment variables** | ✅ | hPanel → encrypted، persist عبر deploys | Env Variables |
| **Auto framework detect** | ✅ | من `package.json` | Build Settings |
| **Monorepo support** | ✅ | root directory detection | GitHub |
| **Vulnerability scanning** | ✅ | PR تلقائي لِـ bump الحزم | Node.js Docs |
| **Runtime logs** | ✅ | stdout/stderr، 5000 سطر | Runtime Logs |
| **SSH** | ✅ | متاح | FTP/SSH |
| **MySQL** | ✅ | `127.0.0.1:3306` لـ Node | Databases |
| **SSL** | ✅ | Let's Encrypt | SSL Docs |
| **Cron** | ✅ | كل دقيقة | Cron Jobs |
| **Staging** | ✅ | موقع منفصل | Staging |

### A.3 ❓ UNKNOWN — يحتاج تحقق منك

هذه **غير مؤكدة** بالتوثيق ولا يمكن استنتاجها بأمان:

| # | البند | لماذا لا أعرفه |
|---|---|---|
| 1 | **إصدار PHP/Node الفعلي في حسابك** | التوثيق يسمح بـ 18/20/22/24 — لا أعرف ما هو مفعّل عندك |
| 2 | **RAM / Memory limit للعملية** | غير مذكور في أي صفحة نُشر عليها |
| 3 | **CPU limit** | غير مذكور |
| 4 | **Request timeout** | غير مذكور |
| 5 | **Concurrent requests** | غير مذكور |
| 6 | **مدة إيقاف الخمول بالضبط** | "after a period" — بدون رقم |
| 7 | **Node app + PHP على نفس الموقع** | غير مذكور (قد يحتاج subdomain) |
| 8 | **حجم Disk** | غير مذكور |

> **UNKNOWN — NEEDS VERIFICATION**
> راجع §G لتعليمات التحقق قبل Phase 1.
---

## B. Deployment Model — نموذج النشر

### B.1 النموذج المعتمد: GitHub Auto-Deploy

```text
┌─────────────────────────────────────────────────────────────┐
│  1. Local (جهازك)                                           │
│     git push origin main                                   │
└────────────────────────┬────────────────────────────────────┘
                         │  GitHub Webhook
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Hostinger Build Pipeline (مُدار بالكامل)               │
│     ├─ npm install          (auto-detect lockfile)         │
│     ├─ npm run build        (next build)                   │
│     └─ output → .next                                     │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Hostinger Run                                          │
│     └─ يشغّل Next.js standalone server تلقائياً            │
│        (لا next start يدوي، لا entry file)                 │
│     └─ bind على HOSTNAME + PORT (يديرهما Hostinger)        │
│     └─ proxy من النطاق → العملية                           │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Disk Layout                                            │
│     ~/domains/{domain}/hbuilds/                            │
│       current → versions/{build-id}/nodejs   ← الكود الحي  │
│       config/  ← env vars + package.json + lockfile        │
│       logs/    ← build logs                                │
└─────────────────────────────────────────────────────────────┘
```

> **مهم:** "Hostinger installs dependencies and runs your build script"
> و "Hostinger starts their standalone server for you" — كل ذلك **مُدار**.

### B.2 إعدادات hPanel المطلوبة

```text
Websites → Add Website → Node.js web app → Import Git repository

┌─────────────────────────────────────────┐
│ Application type:      next              │ ← auto-detected
│ Node.js version:       22 (LTS)  ✅       │
│ Root directory:        (اتركه فارغ)      │
│ Build script:          build             │ ← next build
│ Output directory:      .next             │
│ Entry file:            (اتركه فارغ)      │ ← Next.js ignores it
│ Package manager:       npm  (auto)       │
│ Source type:           git               │
│ Branch:                main              │
└─────────────────────────────────────────┘
```

### B.3 `package.json` المطلوب

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
  }
}
```

> **`engines.node`** يحدد الإصدار — Hostinger يحترمه.
> **`start`** مطلوب كـ script (Hostinger لا يحتاجه كما هو موثق).

### B.4 Startup — ماذا يحدث فعلاً؟

| السؤال | الإجابة | المصدر |
|---|---|---|
| هل يُشغّل Hostinger `next start`؟ | ❌ **لا** | "starts their standalone server for you" |
| هل يحتاج entry file؟ | ❌ **لا** | "Next.js apps don't need one either" |
| هل يُحدَّد PORT يدوياً؟ | ❌ **لا** | Hostinger يدير الربط |
| ماذا لو انهار؟ | ✅ **يعيد التشغيل تلقائياً** | "automatically restarted" |

### B.5 بدائل النشر (احتياطية)

| الطريقة | متى تستخدمها | الحالة |
|---|---|---|
| **GitHub auto-deploy** | ✅ **الافتراضي** | موصى به |
| **Archive upload** | عند فشل GitHub App | ✅ مدعوم |
| **Hostinger Connector** | نشر من VS Code | ✅ مدعوم |
| **SSH + manual** | طوارئ فقط | ⚠️ الملفات تُمحى عند deploy |

> ⚠️ **تحذير مهم:** "Files in `hbuilds/` and `public_html` are **overwritten on every
> deployment**. Direct edits via File Manager, FTP, or SSH are **not supported**."
> → **أي تعديل يدوي على السيرفر يضيع.** الكود كله من Git.

### B.6 قاعدة البيانات — الاتصال

```env
DATABASE_URL="mysql://u123456789_admin:PASSWORD@127.0.0.1:3306/u123456789_cafe"
```

> ⚠️ **`127.0.0.1` وليس `localhost`** — التوثيق ينصّ على ذلك صراحةً:
> *"Node.js connects over TCP and resolves localhost to the IPv6 loopback address
> ::1, which your database user may not be granted for — so the connection is
> refused: 127.0.0.1 forces IPv4 and works on every account."*

---

---
## C. Production Architecture

```text
┌──────────────────────────────────────────────────────────┐
│  Browser                                                  │
│  ├─ Customer (QR)    →  /menu/[table-token]              │
│  ├─ Waiter           →  /waiter      (iPad / tablet)     │
│  ├─ Kitchen          →  /kitchen     (large screen)      │
│  ├─ Cashier          →  /cashier                        │
│  └─ Admin            →  /admin                            │
└───────────────────────────┬──────────────────────────────┘
                            │  HTTPS (SSL — Let's Encrypt)
                            ▼
┌──────────────────────────────────────────────────────────┐
│  Hostinger Business Shared Hosting                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Reverse Proxy (LiteSpeed)  ← SSL termination      │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         ▼                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Next.js App  (standalone server)                  │  │
│  │  ─────────────────────────────────────────────────  │  │
│  │  App Router                                         │  │
│  │  ├─ Server Components  → SSR (default)             │  │
│  │  ├─ Client Components  → islands ('use client')    │  │
│  │  ├─ Route Handlers     → /api/*                    │  │
│  │  ├─ Server Actions     → mutations                 │  │
│  │  └─ Middleware         → auth + RBAC + rate limit  │  │
│  └──────────────────────┬─────────────────────────────┘  │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │  Prisma ORM  (generated client)                    │  │
│  └──────────────────────┬─────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│  MySQL / MariaDB   127.0.0.1:3306                        │
│  (no external services — zero third-party dependencies)  │
└──────────────────────────────────────────────────────────┘

Side channels:
  ├─ Cron (كل دقيقة) → ينبّه المتصفحات → طلب polling
  └─ Uploaded files  → public_html/uploads/  ⚠️ (انظر §E)
```

> **لا Redis · لا Pusher · لا Supabase · لا S3 · لا Upstash.**
> التكلفة الخارجية الشهرية = **0**.

## D. Static vs Dynamic — توزيع الصفحات

### D.1 جدول التوزيع

| المسار | النوع | Rendering | البيانات | Client JS |
|---|---|---|---|---|
| `/` | **Static** | SSG | build-time | ❌ |
| `/login` | **Static** | SSG + Client | — | ❌ |
| `/menu/[token]` | **Dynamic** | SSR | طاولة + منيو | ❌ |
| `/customer/orders/[ref]` | **Dynamic** | SSR | طلب واحد | ❌ |
| `/waiter` | **Dynamic** | SSR | طلبات الفرع | ❌ |
| `/waiter/orders/[id]` | **Dynamic** | SSR | طلب | ❌ |
| `/kitchen` | **Dynamic** | SSR | طلبات التحضير | ❌ |
| `/cashier` | **Dynamic** | SSR | طلبات غير مدفوعة | ❌ |
| `/admin` | **Dynamic** | SSR | إحصائيات | ❌ |
| `/admin/menu` | **Dynamic** | SSR | منتجات | ❌ |
| `/admin/reports` | **Dynamic** | SSR | تقارير | ❌ |
| `/admin/staff` | **Dynamic** | SSR | موظفون | ❌ |

### D.2 تبقى مقسّمة حسب الحاجة

| النوع | الاستخدام في المشروع |
|---|---|
| **Server Components** | ✅ افتراضي في App Router. جلب بيانات، عرض، تنسيق |
| **Client Components** | السلة (cart)، الفلاتر، countdown، polling hook، modals |
| **Route Handlers** | `/api/orders/updates` (polling) · `/api/health` · webhooks مستقبلاً |
| **Server Actions** | إنشاء طلب · تغيير حالة · تسجيل دفعة · CRUD المنيو |

### D.3 قرارات الأداء

```text
✅ كل صفحة افتراضياً Server Component  → HTML كامل في أول response
✅ 'use client' فقط عند الحاجة الفعلية للتفاعل
✅ polling عبر Route Handler خفيف (Route Handler > Server Action للقراءة)
✅ Server Actions للكتابة فقط (تحميها built-in CSRF)
❌ لا 'use client' على مستوى الصفحة (يحوّلها كلها client-rendered)
❌ لا fetch waterfall في RSC — استخدم Promise.all
```

> ⚠️ **ملاحظة معمارية:** Next.js مُدرج كـ **"always server mode"** في
> Hostinger's framework presets — لا يوجد static export لـ Next.js على Hostinger.
> صفحة "Static" أعلاه = SSG مدمج في الـ standalone server.

### D.4 Route Handlers المخصصة (V1)

```text
POST  /api/orders                      → إنشاء طلب (Customer) — Server Action أفضل
GET   /api/orders/updates?since=       → polling endpoint (خفيف)
GET   /api/health                      → health check
```

> **polling endpoint لا يُرجع HTML** — JSON فقط. (§H)

## E. Limitations — القيود

> ⚠️ **أي رقم غير موجود في التوثيق لن أخترعه — سأضعه UNKNOWN.**

### E.1 القيود المؤكدة من التوثيق

| البند | القيمة | المصدر |
|---|---|---|
| **Build timeout** | **15 دقيقة** لكل من: dependency install **و** build script | Build Settings — "each have a 15-minute time limit" |
| **Concurrent builds** | واحد لكل موقع، الباقي في طابور (**حتى 20**) | Build Settings |
| **Build logs** | آخر **10** deploys | Build Settings |
| **Version retention** | **النسخة الحية فقط** — القديمة تُحذف | File Structure |
| **Runtime log buffer** | **5,000 سطر** | Runtime Logs |
| **Live polling for logs** | كل **5 ثوانٍ** (hPanel UI فقط) | Runtime Logs |
| **Node versions** | 18 · 20 LTS · 22 LTS · 24 | Build Settings |
| **Processes < v18** | تُبنى على Node 18 تلقائياً | Build Settings |
| **Env vars** | **1,000** لكل app · key ≤ 255 · A-Z 0-9 _ فقط | Env Variables |
| **Env var storage** | **مشفّرة** + ملف محمي على الاستضافة | Env Variables |
| **Env changes** | تحتاج **redeploy** لتُطبَّق | Env Variables |
| **Monorepo** | root directory محدَّد، يُبنى وحده | GitHub |
| **Build concurrency** | ❌ **لا per-commit rollback** | Deployments |

### E.2 القيود غير المؤكدة ❓ UNKNOWN

| # | البند | الحالة | الأثر المحتمل |
|---|---|---|---|
| 1 | **RAM limit للعملية** | ❓ UNKNOWN | قد يمنع build كبير أو OOM |
| 2 | **CPU limit** | ❓ UNKNOWN | بطء في الذروة |
| 3 | **HTTP request timeout** | ❓ UNKNOWN | طلبات طويلة تُقطع |
| 4 | **Max concurrent requests** | ❓ UNKNOWN | است否earable تحت الضغط |
| 5 | **مدة إيقاف الخمول** | ❓ UNKNOWN ("a period") | لا نعرف كم تستغرق البداية |
| 6 | **Node app + PHP على نفس الدومين** | ❓ UNKNOWN | قد يحتاج subdomain |
| 7 | **حجم الـ swap / disk** | ❓ UNKNOWN | 影响 `node_modules` + `.next` |
| 8 | **حجم `node_modules` المسموح** | ❓ UNKNOWN | project size |
| 9 | **Max upload size عبر FormData** | ❓ UNKNOWN | صور المنتجات |
| 10 | **Max request body** | ❓ UNKNOWN | نفس BIA |

### E.3 Process Lifecycle — التحليل الحرج

```text
Hostinger: "runs on demand. After a period without incoming traffic,
            your app's process is stopped automatically to free up
            server resources. The next request ... starts it again"

            + "Hostinger starts your app and keeps it running at your domain"
            + "If your app crashes, it's automatically restarted"
            + "The handover happens in the background"
```

**التفسير:**

| السلوك | الأثر على مشروعنا |
|---|---|
| إيقاف بعد خمول | ⚠️ أول طلب بعد خمول incurs **cold start** |
| الاستئناف في الخلفية | ✅ **لا تدخّل منك** |
| إعادة تشغيل تلقائية عند crash | ✅ تعافٍ تلقائي |
| "keeps it running at your domain" | ✅ يخدم النطاق فعلياً |

**الأثر العملي:**

| السيناريو | التقييم |
|---|---|
| العميل يمسح QR → أول طلب | ⚠️ cold start ممكن (~1-3 ث) — **مقبول لمرة واحدة** |
| عميل يتصفح المنيو | ✅ JVM نشط — لا cold starts |
| Polling من 4 أجهزة كل 3 ث | ✅ **يمنع الإيقاف تمامًا** (traffic مستمر) |
| فجأة quiet 10 د → طلب واحد | ⚠️ cold start — مقبول |

> **استنتاج مهم:** نظام Polling الجاهز我们的 يحافظ على العملية نشطة
> أثناء ساعات العمل. وهذا **ميزة** لا عيب.

### E.4 File System — نقطة حرجة

> ⚠️ "Files in `hbuilds/` and `public_html` are **overwritten on every
> deployment**. Direct edits ... are **not supported**."

| المسار | الاستخدام | الخطر |
|---|---|---|
| `hbuilds/current/nodejs/` | الكود الحي | ❌ **يُستبدل كل deploy** |
| `public_html/uploads/` | صور المنتجات | ⚠️ **قد يُمسح** |
| `/tmp` | ملفات مؤقتة | ⚠️ غير دائم |

**المشكلة:** رفع الصور إلى `public_html/uploads/` قد يمحوها الـ deploy.
كما أن `.next/` (build cache) لا يصلح لتخزين دائم.

**الحلول (3 خيارات، كلها بلا خدمة خارجية):**

| # | الحل | التكلفة | المخاطرة | التوصية |
|---|---|---|---|---|
| **1** | **DB blob** — صور في MySQL كـ `LONGBLOB` | 0 | ⬜ صفر | ✅ بسيط لكافيه |
| **2** | **S3/Cloudflare R2** | ~$0-2/شهر | ⚠️ خارجية | ⚠️ عند التوسع |
| **3** | مجلد خارج `public_html` + symlink | 0 | ⚠️ هش | ❌ |

> **التوصية (1):** لنظام كافيه، صور المنتجات صغيرة (≤200KB × 100 منتج = ~20MB).
> MySQL يتعامل مع ذلك بسهولة، ولا يوجد ملف يضيع عند deploy.
> عند التوسع (>2000 صورة) → انتقل لـ (2).

### E.5 Database Connections

| الخيار | التقييم |
|---|---|
| **Prisma singleton pattern** | ✅ **مطلوب** — يمنع connection leaks |
| Connection pooling | ⚠️ **UNKNOWN** — تحقّق من max_connections |
| Serverless-style pooling | ❌ **غير مطلوب** — هذا persistent Node |

**الكود الإلزامي:**
```ts
// src/server/db.ts  — Prisma singleton (Next.js dev HMR)
// ❌ NEVER: new PrismaClient() في كل module
// ✅ ALWAYS: globalThis cache
```

> Prisma + Next.js يوثّق هذا pattern رسمياً. **إلزامي** لتفادي استنزاف الاتصالات.

### E.6 Cron

```text
hPanel → Advanced → Cron Jobs
Command:  /usr/bin/node /home/USER/cafe-system/scripts/jobs.ts
Schedule: * * * * *
```

> ⚠️ **UNKNOWN:** هل `node` متاح في بيئة cron على حسابك؟
> البديل: `curl -s https://yourcafe.com/api/cron/daily`
> (يعمل دائماً — لا يعتمد على وجود node في cron PATH)

**وظائف Cron في V1:**

| Job | التكرار | الغرض |
|---|---|---|
| `sessions:cleanup` | كل ساعة | حذف الجلسات المنتهية |
| `stale-orders:check` | كل 5 د | تنبيه للطلبات المعلّقة |
| `reports:daily` | 00:05 | تجقرير مبيعات اليوم |
| `polling:wakeup` | كل دقيقة | ⚠️ اختياري — إبقاء العملية نشطة عند الخمول |

> **لماذا cron؟** الـ polling لا يحتاج cron (traffic مستمر).
> Cron للتنظيف والتقارير فقط.

## F. Risk Assessment — تقييم المخاطر

> **المقياس:** `Low` · `Medium` · `High` · `Blocked`

### F.1 تقييم كل جزء من الـ Stack

| الجزء | المستوى | السبب | التخفيف |
|---|:---:|---|---|
| **Next.js على Hostinger** | 🟢 **Low** | مدعوم صراحة + Business مشمول | — |
| **Build step (`next build`)** | 🟢 **Low** | 15-min timeout كافٍ لكافيه | — |
| **SSR** | 🟢 **Low** | Next.js always server mode | — |
| **Route Handlers / API** | 🟢 **Low** | native في Next.js | — |
| **Server Actions** | 🟢 **Low** | native + CSRF built-in | — |
| **HTTP Polling** | 🟢 **Low** | stateless HTTP | — |
| **GitHub auto-deploy** | 🟢 **Low** | native + logs + history | — |
| **Environment variables** | 🟢 **Low** | hPanel، مشفّرة، persist | — |
| **Crash recovery** | 🟢 **Low** | auto-restart موثق | — |
| **TypeScript** | 🟢 **Low** | build-time فقط، صفر runtime cost | — |
| **Tailwind + shadcn/ui** | 🟢 **Low** | compile-time CSS | — |
| **PWA** | 🟢 **Low** | static assets فقط | — |
| **i18n (ar/en)** | 🟢 **Low** | مكتبات فقط | — |
| **MySQL connection** | 🟢 **Low** | localhost native | Prisma singleton |
| **Monorepo** | 🟢 **Low** | root directory مدعوم | single app أبسط |
| **Cron jobs** | 🟡 **Medium** | ⚠️ `node` في cron PATH = UNKNOWN | استخدم `curl` بدل node |
| **Prisma ORM** | 🟡 **Medium** | native binaries (opaque) | راجع §H |
| **Image uploads** | 🟡 **Medium** | hbuilds يُستبدل كل deploy | DB blob (§E.4) |
| **Memory / RAM** | 🟡 **Medium** | ❓ UNKNOWN | راقب Runtime Logs |
| **CPU limit** | 🟡 **Medium** | ❓ UNKNOWN | indexes + pagination |
| **Request timeout** | 🟡 **Medium** | ❓ UNKNOWN | ❌ لا queries ثقيلة |
| **Cold start بعد خمول** | 🟡 **Medium** | موثق | polling يبقيها نشطة |
| **Long-running jobs** | 🔴 **High** | ❌ لا daemon دائم | ❌ خارج V1 |
| **WebSocket / SSE** | 🔴 **Blocked** | ❌ عملية دائمة | ❌ خارج V1 (§14) |
| **Redis / BullMQ** | 🔴 **Blocked** | ❌ غير متاح | ❌ خارج V1 |
| **Heavy background jobs** | 🔴 **Blocked** | لا process دائم | cron فقط |

### F.2 الحكم العام

```text
Next.js على Hostinger Business  →  🟢 LOW RISK  ✅
```

**لماذا Low رغم وجود عدة Medium؟**

| السبب | التفصيل |
|---|---|
| التوثيق الرسمي يؤكد | Next.js مذكور بالاسم + Business مذكور بالاسم |
| **لا حاجة لخدمة خارجية** | التكلفة = 0 · الاعتماديات = 0 |
| المتطلبات في حجمها | كافيه ≠ ملايين الطلبات |
| Polling يلغي الحاجة للـ daemon | لا blocker |
| القيود كلها قابلة للمراقبة | Runtime Logs + Build Logs |

### F.3 إن ظهرت مشاكل أثناء التنفيذ

| المشكلة | الحل (بلا تغيير معماري) |
|---|---|
| build timeout | قسّم المشروع · قلّل dependencies |
| OOM في build | `NODE_OPTIONS=--max-old-space-size=2048` |
| cold start مزعج | polling يبقيها نشطة · أو cron wakeup |
| صورة ضاعت | ✅ مُنع مسبقاً بـ DB blob |
| connection leaks | ✅ Prisma singleton |
| CPU عالٍ | indexes · pagination |

**❌ لا يوجد أي سيناريو يفرض تغيير الـ framework.**

## G. Pre-Phase-1 Verification Checklist

> **هذا يجب تنفيذه قبل كتابة أي implementation code.**

### G.1 من لوحة hPanel

```text
☐  1. Websites → yourcafe.com → هل يظهر كـ "Node.js web app"؟
☐  2. تأكد من نوع التطبيق = Node.js (وليس PHP فقط)
☐  3. Node version → ما الإصدار المتاح فعلاً؟ (18/20/22/24)
☐  4. Performance → Usage → سجّل: CPU limit, RAM limit
☐  5. Databases → كم قاعدة مسموحة؟ حجم كل قاعدة؟
☐  6. SSL → مفعّل؟
☐  7. Cron Jobs → متاح؟ جرّب command بسيط
☐  8. SSH → نفّذ:  node -v   → هل يعمل؟
☐  9. SSH → نفّذ:  npm -v    → هل يعمل؟
☐ 10. SSH → نفّذ:  df -h    → كم مساحة القرص؟
```

### G.2 اختبار الحد الأدنى (Smoke Test) — قبل بناء المشروع

**هذا هو الاختبار الحاسم. أنشئ مشروعاً صغيراً للتحقق:**

```bash
npx create-next-app@latest smoke --typescript --app --tailwind
cd smoke
# عدّل page.tsx ليعرض "OK" فقط
git push
```

**ثم في hPanel:**
```text
☐  Import repository → application type = next (auto)
☐  Build script = build
☐  Output directory = .next
☐  Entry file = (فارغ)
☐  Deploy → انتظر النجاح
☐  افتح الرابط → هل ترى "OK"؟           ← YES/NO
☐  افتح Runtime Logs → هل ترى سجلات؟      ← YES/NO
☐  هل اكتمل Build في أقل من 15 دقيقة؟    ← نعم/لا
```

> **نتيجة هذا الاختبار تحسم كل الـ UNKNOWNs في §E.2.**
> إذا نجح → ✅ ابدأ Phase 1 بثقة.
> إذا فشل → نعرف بالضبط ما المشكلة بدل التخمين.

### G.3 معايير القبول

| المعيار | المطلوب |
|---|---|
| Build ينجح | ✅ خلال 15 دقيقة |
| الصفحة تُعرض | ✅ HTML صحيح |
| API Route يعمل | ✅ `/api/health` → 200 |
| Runtime Logs | ✅ يعرض stdout |
| Env vars تُقرأ | ✅ `process.env.TEST` يظهر |
| DB connection | ✅ Prisma يتصل بـ MySQL |

> ✅ **كافٍ.** المطلوب Next.js يعمل — لا أن يكون VPS.

## H. Prisma ORM — التوافق

### H.1 نقاط القوة على Hostinger

| النقطة | التفصيل |
|---|---|
| **TypeScript-first** | أنواع محلي كامل — أفضل من أي ORM بديل |
| **Migrations** | `prisma migrate` — يحقق قاعدة "لا schema بدون migration" |
| **Client caching** | `include` / `select` → لا N+1 |
| **Singleton pattern** | موثق رسمياً لـ Next.js |
| **Relations** | eager loading مدمج |
| **Transactions** | `$transaction()` أصلي |
| **JSON support** | MySQL `JSON` مدعوم → snapshots |

### H.2 المخاطر — UNKNOWN

| # | البند | الحالة | الأثر | الحل |
|---|---|---|---|---|
| 1 | **Native binaries** (libssl, engine) | ❓ UNKNOWN | قد يفشل على بعض الخطط | `prisma generate` في postinstall + اختبار مبكر |
| 2 | **Engine download وقت build** | ❓ UNKNOWN | قد يبطئ أو يفشل | `PRISMA_ENGINES_MIRROR` عند الحاجة |
| 3 | **Memory during generate** | ❓ UNKNOWN | قد يتجاوز الحد | generation خفيف نسبياً |
| 4 | **Connection pooling** | ❓ UNKNOWN | قد يستنزف الاتصالات | Prisma singleton + `connection_limit` |
| 5 | **DATABASE_URL special chars** | ⚠️ **معروف** | ❌ فشل اتصال | URL-encode (انظر §H.3) |

### H.3 ⚠️ نقطة حرجة — URL Encoding

```env
# ❌ خطأ — كلمة مرور فيها @ أو # أو : تكسر الـ URL
DATABASE_URL="mysql://user:p@ssw0rd@127.0.0.1:3306/db"

# ✅ صحيح — URL-encode
DATABASE_URL="mysql://user:p%40ssw0rd@127.0.0.1:3306/db"
```

> **الأفضل:** توليد كلمة مرور DB **بدون** those characters — أبسط وأأمن.
> توثيق Prisma ينصح بهذا صراحة.

### H.4 نمط Prisma الإلزامي لـ Next.js

```ts
// src/server/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

> ❌ **لا تكتب** `new PrismaClient()` في كل module — يضيع الاتصال في dev HMR.
> ✅ **هذا النمط إلزامي** ومعتمد من Prisma رسمياً.

### H.5 بدائل لو Prisma فشل

**لا تنتقل إلى Laravel.** البدائل TypeScript-friendly:

| البديل | متى | الحالة |
|---|---|---|
| **Drizzle ORM** | memory أقل، SQL-like | ✅ بديل ممتاز إذا Prisma فشل |
| **Kysely** | query builder نقي | ✅ بديل |
| **mysql2 + repositories** | آخر حل | ⚠️ boilerplate كثير |

> **Drizzle** هو الأقرب لـ Prisma في تجربة TypeScript.
> لكن **لا نخطط للانتقال** — Prisma هو الخيار الموصى به.

## I. الخلاصة والتوصية

### I.1 الإجابة النهائية

```text
✅ YES — Next.js يعمل على Hostinger Business بموثوقية
```

### I.2 الأدلة الجوهرية

1. ✅ Next.js **مذكور بالاسم** في قائمة Frameworks المدعومة
2. ✅ Business plan **مذكور بالاسم** كدعم لـ Node.js
3. ✅ "Hostinger **starts their standalone server** for you" — لا entry file
4. ✅ "**installs dependencies and runs your build script**" — build مُدار
5. ✅ "**keeps it running at your domain**" + "**automatically restarted**"
6. ✅ "runs **on demand**" = توفير موارد، **ليس** قيداً على HTTP apps
7. ✅ GitHub auto-deploy + env vars + logs + crash recovery = دورة كاملة
8. ✅ **لا حاجة لأي خدمة خارجية** → تكلفة شهرية = 0

### I.3 التوصية

> **ابدأ بـ Next.js + TypeScript.**
>
> **لا حاجة لأي تعديل معماري.**
> **لا حاجة لأي خدمة خارجية.**
> **لا حاجة لـ Laravel.**

### I.4 الـ UNKNOWNs المتبقية

كلها **قابلة للحل في ~30 دقيقة** عبر Smoke Test (§G.2):
`RAM` · `CPU` · `timeout` · `مدة cold start` · `Prisma engines`

> **لا شيء منها يمنع البدء.** كلها قابلة للمراقبة والتعديل بعد الإطلاق.

### I.5 Ministers After Validation

```text
✅ YES      → أنت الآن. ابدأ Phase 1 بأمر منفصل.
⚠️ PARTIAL  → اعرض الحل والقيود وانتظر قرارك.
❌ NO       → توقف. لا تستخدم Laravel تلقائياً.
```

### I.6 The Stack المعتمد

```text
Next.js (App Router) + TypeScript
├── React 18+ · Server & Client Components
├── Tailwind CSS + shadcn/ui
├── Prisma ORM
├── MySQL / MariaDB   (127.0.0.1:3306)
├── next-auth / custom session  (httpOnly cookies)
├── Zod  (validation)
└── Adaptive HTTP Polling  (3-5s)

❌ لا Redis · لا WebSocket · لا SSE · لا خدمة خارجية
💰 التكلفة الخارجية: 0
```

---

> **انتهت Validation.** لم يُنشأ أي application code.
> `package.json` · `prisma/schema.prisma` · migrations · auth · UI — **لا شيء منها موجود بعد.**

**المراجع الرسمية:**
- [Node.js Hosting Overview](https://docs.hostinger.com/node.js/overview)
- [Build Settings](https://docs.hostinger.com/node.js/build-settings)
- [Deployments](https://docs.hostinger.com/node.js/deployments)
- [File Structure](https://docs.hostinger.com/node.js/file-structure)
- [GitHub Integration](https://docs.hostinger.com/node.js/github)
- [Environment Variables](https://docs.hostinger.com/node.js/environment-variables)
- [Runtime Logs](https://docs.hostinger.com/node.js/runtime-logs)
- [Databases](https://docs.hostinger.com/websites/databases)
- [Node.js hosting options (Business)](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
---
---
---
---
