# خطة التطوير ذات الأولوية
لا تنفيذ ضمن التدقيق ولا تواريخ مفترضة. S/M/L/XL تعقيد نسبي.

|#|الأولوية|المهمة ولماذا|الملفات/الوحدات|التبعيات|الحجم|معيار القبول والاختبار|Migration|
|---|---|---|---|---|---|---|---|
|1|P0|إغلاق D01/D02 لمنع تحريك النقد بلا تفويض|staff-shifts، handover route|سياسة Owner/Manager|M|كل رفض بلا كتابة؛ role×branch Postgres|لا|
|2|P0|ربط Cash Refund بورديته وexpectedCash|payments-write، shifts، schema|سياسة إسناد الوردية|L|تحصيل100 واسترداد30 يعطي70 في close والدفتر|غالبًا|
|3|P0|قفل Payment/Refund وتثبيت الانتقالات|staff-payments-write|#2 ومفاتيح ثابتة|L|توازي request/execute/cancel لا يتجاوز الأصل|قيود داعمة محتملة|
|4|P0|تسوية histories وتوفير staging مستقل|prisma، supabase، scripts|schema snapshot ومراجعة المطبق|XL|قاعدة خالية تبنى دون تعارض وتوافق metadata|نعم، مراجع|
|5|P1|توحيد predicate إشغال الطاولة|staff-tables، pos، waiter|#4|M|served/partial/pending/takeaway/paid متسقة|لا|
|6|P1|إشغال الفرع وCurrent Order مشترك|cashier page، staff-waiter، details|#5 وسياسة الملكية|M|Cashier ونادلان يفتحون نفس orderId|لا|
|7|P1|إكمال QR submission والواجهة والاعتماد|public-orders، waiter-board/operations|#5/#6|L|القواعد التسع للـQR تنجح E2E وPostgres|قد يلزم|
|8|P1|ربط QR بجلسة الطاولة وقفل target|schema، waiter-operations|#7|L|طلب قديم لا ينتقل لعميل جديد؛ merge/payment آمن|نعم|
|9|P1|مصدر ضريبة وتكوين منتج موحد|pos-write، invoices، settings|حسم inclusive/mixed rates|L|نفس complex product والضريبة بكل entrypoint|حسب snapshots|
|10|P1|توحيد Refund وgross/net والتواريخ|finance-metrics، finance، VAT|#2/#9|L|100/30/70 وexecutedAt وحدود Cairo متطابقة|ربما tax ledger|
|11|P1|Aggregate مستقل وpagination وجلب بالID|finance، invoices، pay route|#10|M|أكثر من300/150 صف دون نقص و503 بعد التحصيل|لا|
|12|P1|واجهة دورة Refund وتسليم النقد|InvoiceBoard، CashierDashboard|#1–3|L|اعتماد وتنفيذ وقبول ونزاع وحل مع الإثبات والأدوار|ليست واجهة فقط|
|13|P1|Postgres integration وBrowser E2E معزول|tests، quality workflow|#4|XL|إغلاق بوابات14 بأدلة roles/concurrency/render|fixtures فقط|
|14|P1|اعتماد backup/restore وrollback|scripts والتشغيل|#4 ونسخة محمية|L|استعادة مستقلة حديثة وقياس RPO/RTO|لا على production|
|15|P1|حماية Public QR وفحص الاعتمادات|public routes، middleware، CI|إذن npm export وحدود موزعة|M|429 تحت burst وأخطاء عامة وتقرير ثغرات موثق|حسب store|
|16|P2|إصلاح edit النادل والمودال ورسائل HTTP|waiter-board، table-workspace|#6/#9|M|نفس orderId وdialog واحد ولا نجاح وهمي|لا|
|17|P2|قبول POS full-height وRTL وaccessibility|pos-checkout، shared modals|Browser harness|M|العروض التسعة وTab/ESC/focus دون overflow|لا|
|18|P1|XP80TS ونسختان وفاتورة طويلة|thermal preview، globals|جهاز واكتمال #9|M|نسختان60 سطرًا دون clipping أو دفع جديد|لا|
|19|P2|Idempotency للخزنة وAudit ذري|staff-float، staff-shifts|#1/#4|M|فقد الرد لا يكرر النقد وفشل audit يعيد rollback|قد يلزم|
|20|P2|إضافة provision-offline إلى CI|package، quality، tests|#13|S|تشغيل الاختبارات التسعة في كل PR|لا|
|21|P3|حسم demo/dead code وsession library|WaiterView، PosView، single-active-session|قبول الوظائف الأساسية|M|لا ميزة يوحي وجودها بتكامل غير موجود|حسب سياسة الجلسات|
|22|P3|قياس الحمل ثم تحسين polling/queue|cashier، waiter، kitchen، services|metrics وقبول أساسي|L|Pool budget وlatency مقاسان وack للطباعة إن اعتمدت|ربما queue|

## التسلسل
ابدأ بالتفويض والنقد والتزامن (#1–3) بالتوازي المنطقي مع تجهيز البيئة (#4)، دون كتابة production. بعدها الطاولات وQR والتكوين (#5–9)، ثم التقارير والواجهة المالية (#10–12). بيئة الاختبار والاستعادة تُبنى مبكرًا وتغلق قبول كل خطوة.
أي تصحيح مالي تاريخي يحتاج reconciliation مستقلة بأدلة وموافقة؛ لا backfill تلقائيًا ولا إعادة حساب فواتير مدفوعة من أسعار اليوم.
