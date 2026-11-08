# الاختبارات والجودة
## فحوص نُفذت في هذه الجولة
| الفحص | النتيجة |
|---|---|
| tsc --noEmit --incremental false | PASS، exit0 |
| npm run lint | PASS، exit0، max-warnings=0 |
| npm test | PASS:258، fail0، skipped0 |
| staff-provision-offline مستقل | PASS:9، fail0، skipped0 |
| prisma validate | PASS، schema valid؛ تحذير package.json#prisma deprecated |
| git diff --check قبل التقارير | PASS |
| local next build | BLOCKED بقيد عدم تغيير ملفات خارج التقارير؛ يكتب .next/next-env |
| PostgreSQL integration | BLOCKED، لم تُشغّل fixtures أو migrations |
| Browser/E2E/responsive | NOT TESTED |
| XP80TS | NOT TESTED |
| npm audit live | BLOCKED من auto-review قبل اتصال التصعيد |

267 اختبارًا منفذًا ناجحًا. يوجد277 test(...) declaration في8 ملفات:258 offline،9 staff-provision-offline و10 Postgres عبر6 ملفات. عدد assertions/subtests قد يزيد runtime؛277 تعداد declarations لا نتيجة تشغيل شاملة. لا تخلط10 integration غير المنفذة مع skipped داخل267 المنفذة، التي تخطيها صفر.

## نوع التغطية
offline يختبر سياسات pure وحسابات خصومات/فواتير/route roles/idempotency inputs ومخزون نسبي وبعض negative authorization قبل DB. staff-provision يستبدل global prisma وAuth mocks ويختبر rollback scenarios. نجاحها لا يثبت transaction isolation أو RLS أو وجود جدول production.
بعض tests تعتمد readFileSync/مطابقة code، فلا تعادل تنفيذ API أو lifecycle.
tests/financial-postgres وcashier-postgres وinventory-postgres وhr-postgres وservice-requests-postgres وshift-concurrency-postgres تنشئ بيانات حقيقية؛ لم تُشغل ضمن read-only.

## خطر بيئة الاختبار
`tests/shift-concurrency-postgres.test.ts:6` يستخدم تصريح test-data-only مع ref يطابق مشروع skoon المقروء. وجود اسم test أو متغير authorization لا يثبت عزل production. يلزم مشروع staging منفصل والتحقق من hostname/ref والبيانات والـcredentials قبل الاختبار.
`scripts/with-staging-env.cjs:8` لا يرجع إلى .env عند غياب staging، وهذا جيد. inspect scripts قبل التشغيل؛ لم نشغّل scripts cleanup أو restore أو seed.

## CI
`.github/workflows/quality.yml:1`: npm ci → prisma validate → typecheck → lint → offline tests → build على Node22. لا job PostgreSQL isolated أو E2E، وstaff-provision-offline ليس داخل npm test الأساسي.
Hostinger deployment report يذكر build completed لنفس HEAD؛ هذا دليل خارجي مستقل لا إعادة build محلية لهذه الجولة.

## الاختبارات الحرجة الغائبة عن قبول الإطلاق
D01 رفض النزاع لا يغير الصف؛ D02 role matrix resolve؛ D03 Refund→expected→close؛ D04 request/execute concurrency؛ QR occupied/pending/epoch؛ occupancy نفسه بكل UI؛ جلب فاتورة قديمة بعد تحصيل؛ tax settings على إنشاء POS؛ restore clean DB؛ full responsive snapshots.
تقييم الجودة: أدوات static جيدة، لكن تغطية wiring والمعاملات الحديثة أضعف من تغطية السياسات. لا تُرفع أي ميزة مالية إلى COMPLETE اعتمادًا على وجود endpoint أو258 test فقط.
