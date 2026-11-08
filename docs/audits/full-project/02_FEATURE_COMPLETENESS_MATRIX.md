# مصفوفة اكتمال الميزات
COMPLETE: سلوك محدد أثبتته اختبارات ذات معنى. IMPLEMENTED: كود موجود دون قبول runtime شامل. PARTIAL: wiring/سلوك ناقص. BROKEN: عيب مؤكد. MISSING: متطلب غير منفذ. BLOCKED: يعتمد على وصول/اختبار ممنوع. NOT APPLICABLE: خارج النطاق.
**لا وحدة تشغيلية كاملة مصنفة COMPLETE**؛ COMPLETE أدناه لسياسات منفردة فقط. لا نسبة تقديرية.

الإحصاء:125 بندًا؛95 IMPLEMENTED،19 BROKEN،3 PARTIAL،3 COMPLETE،2 MISSING،2 BLOCKED،1 NOT APPLICABLE. Feature BROKEN قد يغطي عدة عيوب أو العكس؛ لا تساوي هذه الأعداد عدد incidents أو حجم العمل.

| Module | Feature | Status | Evidence | Missing Work | Risk | Priority |
|---|---|---|---|---|---|---|
|الهوية|Login|IMPLEMENTED|src/lib/session.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الهوية|Supabase Auth|IMPLEMENTED|src/lib/session.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الهوية|username|IMPLEMENTED|src/lib/session.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الهوية|logout|IMPLEMENTED|src/lib/session.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|التفويض|Page guards|IMPLEMENTED|src/lib/authz.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|التفويض|API sessions|IMPLEMENTED|src/lib/authz.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|التفويض|branch isolation|IMPLEMENTED|src/lib/authz.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الفروع|Branch bootstrap|IMPLEMENTED|src/lib/branch-bootstrap.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الفروع|branch settings|IMPLEMENTED|src/lib/branch-bootstrap.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الموظفون|Account provisioning|IMPLEMENTED|src/lib/staff-provision-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الموظفون|role assignment|IMPLEMENTED|src/lib/staff-provision-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الموظفون|activation|IMPLEMENTED|src/lib/staff-provision-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الموظفون|archive|IMPLEMENTED|src/lib/staff-provision-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الموظفون|contracts|IMPLEMENTED|src/lib/staff-provision-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|HR والرواتب|Scheduling|IMPLEMENTED|src/lib/staff-payroll-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|HR والرواتب|attendance|IMPLEMENTED|src/lib/staff-payroll-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|HR والرواتب|leave|IMPLEMENTED|src/lib/staff-payroll-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|HR والرواتب|holidays|IMPLEMENTED|src/lib/staff-payroll-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|HR والرواتب|overtime|IMPLEMENTED|src/lib/staff-payroll-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|HR والرواتب|documents|IMPLEMENTED|src/lib/staff-payroll-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|HR والرواتب|payroll|IMPLEMENTED|src/lib/staff-payroll-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|HR والرواتب|advances|IMPLEMENTED|src/lib/staff-payroll-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الكتالوج|Products|IMPLEMENTED|src/lib/staff-catalog-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الكتالوج|categories|IMPLEMENTED|src/lib/staff-catalog-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الكتالوج|variants|IMPLEMENTED|src/lib/staff-catalog-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الكتالوج|modifiers|IMPLEMENTED|src/lib/staff-catalog-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الكتالوج|availability|IMPLEMENTED|src/lib/staff-catalog-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الكتالوج|archive|IMPLEMENTED|src/lib/staff-catalog-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|POS|Search|IMPLEMENTED|src/lib/staff-pos.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|POS|catalog|IMPLEMENTED|src/lib/staff-pos.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|POS|cart|IMPLEMENTED|src/lib/staff-pos.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|POS|drafts|IMPLEMENTED|src/lib/staff-pos.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|POS|creation|IMPLEMENTED|src/lib/staff-pos.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|POS|discount controls|IMPLEMENTED|src/lib/staff-pos.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الفواتير|Invoice list|IMPLEMENTED|src/lib/staff-invoices.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الفواتير|item add|BROKEN|src/lib/staff-invoices.ts؛ التقرير الموضوعي|إصلاح D16 واختبار تكامل|مرتفع|P1|
|الفواتير|quantity|IMPLEMENTED|src/lib/staff-invoices.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الفواتير|line discount|IMPLEMENTED|src/lib/staff-invoices.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الفواتير|invoice discount|IMPLEMENTED|src/lib/staff-invoices.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الفواتير|cancellation|IMPLEMENTED|src/lib/staff-invoices.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الفواتير|delete protection|IMPLEMENTED|src/lib/staff-invoices.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الطاولات|Occupancy|BROKEN|src/lib/staff-tables.ts؛ التقرير الموضوعي|إصلاح D05/D06 واختبار تكامل|مرتفع|P1|
|الطاولات|table detail|IMPLEMENTED|src/lib/staff-tables.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الطاولات|QR print|IMPLEMENTED|src/lib/staff-tables.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الطاولات|floor plan|IMPLEMENTED|src/lib/staff-tables.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الطاولات|reservations|IMPLEMENTED|src/lib/staff-tables.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|النادل|Table grid|IMPLEMENTED|src/lib/staff-waiter.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|النادل|current order|BROKEN|src/lib/staff-waiter.ts؛ التقرير الموضوعي|إصلاح D06/D14 واختبار تكامل|مرتفع|P1|
|النادل|append|IMPLEMENTED|src/lib/staff-waiter.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|النادل|responsibility|IMPLEMENTED|src/lib/staff-waiter.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|النادل|transfer|IMPLEMENTED|src/lib/staff-waiter.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|النادل|handover|IMPLEMENTED|src/lib/staff-waiter.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|النادل|owner monitor|IMPLEMENTED|src/lib/staff-waiter.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|QR العام|Public menu|IMPLEMENTED|src/lib/public-menu.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|QR العام|submit|BROKEN|src/lib/public-menu.ts؛ التقرير الموضوعي|إصلاح D07 واختبار تكامل|مرتفع|P1|
|QR العام|tracking|IMPLEMENTED|src/lib/public-menu.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|QR العام|claim|BROKEN|src/lib/public-menu.ts؛ التقرير الموضوعي|إصلاح D08 واختبار تكامل؛ توصيل UI|مرتفع|P1|
|QR العام|approve|BROKEN|src/lib/public-menu.ts؛ التقرير الموضوعي|إصلاح D08 واختبار تكامل؛ توصيل UI|مرتفع|P1|
|QR العام|reject|BROKEN|src/lib/public-menu.ts؛ التقرير الموضوعي|إصلاح D08 واختبار تكامل؛ توصيل UI|مرتفع|P1|
|QR العام|merge|IMPLEMENTED|src/lib/public-menu.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المطبخ|Kitchen queue|IMPLEMENTED|src/lib/staff-orders.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المطبخ|preparation|IMPLEMENTED|src/lib/staff-orders.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المطبخ|ready|IMPLEMENTED|src/lib/staff-orders.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المطبخ|serve|IMPLEMENTED|src/lib/staff-orders.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المطبخ|timers|IMPLEMENTED|src/lib/staff-orders.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المطبخ|alerts|IMPLEMENTED|src/lib/staff-orders.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|Recipes|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|stock|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|reserve|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|consume|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|release|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|batches|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|waste|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|accountability|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المخزون|stock counts|IMPLEMENTED|src/lib/staff-inventory-engine.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المدفوعات والاستردادات|Cash|IMPLEMENTED|src/lib/staff-payments-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المدفوعات والاستردادات|electronic attestation|IMPLEMENTED|src/lib/staff-payments-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المدفوعات والاستردادات|references|IMPLEMENTED|src/lib/staff-payments-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|المدفوعات والاستردادات|refund request|BROKEN|src/lib/staff-payments-write.ts؛ التقرير الموضوعي|إصلاح D04 واختبار تكامل؛ توصيل UI|مرتفع|P1|
|المدفوعات والاستردادات|decision|PARTIAL|src/lib/staff-payments-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال؛ توصيل UI|غير محسوم runtime|P2|
|المدفوعات والاستردادات|execution|BROKEN|src/lib/staff-payments-write.ts؛ التقرير الموضوعي|إصلاح D04 واختبار تكامل؛ توصيل UI|مرتفع|P1|
|المدفوعات والاستردادات|cancellation|PARTIAL|src/lib/staff-payments-write.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال؛ توصيل UI|غير محسوم runtime|P2|
|الورديات والتسليم|Open|IMPLEMENTED|src/lib/staff-shifts.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الورديات والتسليم|close|IMPLEMENTED|src/lib/staff-shifts.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الورديات والتسليم|expected cash|BROKEN|src/lib/staff-shifts.ts؛ التقرير الموضوعي|إصلاح D03 واختبار تكامل|مرتفع|P0|
|الورديات والتسليم|variance|IMPLEMENTED|src/lib/staff-shifts.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الورديات والتسليم|accept|PARTIAL|src/lib/staff-shifts.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال؛ توصيل UI|غير محسوم runtime|P2|
|الورديات والتسليم|dispute|BROKEN|src/lib/staff-shifts.ts؛ التقرير الموضوعي|إصلاح D01 واختبار تكامل|مرتفع|P0|
|الورديات والتسليم|resolve|BROKEN|src/lib/staff-shifts.ts؛ التقرير الموضوعي|إصلاح D02 واختبار تكامل|مرتفع|P0|
|العهدة والخزنة|Baseline|IMPLEMENTED|src/lib/staff-float.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|العهدة والخزنة|advance|IMPLEMENTED|src/lib/staff-float.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|العهدة والخزنة|return|IMPLEMENTED|src/lib/staff-float.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|العهدة والخزنة|settlement|IMPLEMENTED|src/lib/staff-float.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|العهدة والخزنة|withdrawal|IMPLEMENTED|src/lib/staff-float.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|العهدة والخزنة|reversal|IMPLEMENTED|src/lib/staff-float.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|العهدة والخزنة|main safe|IMPLEMENTED|src/lib/staff-float.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|العهدة والخزنة|transfer|IMPLEMENTED|src/lib/staff-float.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|التقارير والضريبة|Sales|IMPLEMENTED|src/lib/staff-reports.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|التقارير والضريبة|collections|BROKEN|src/lib/staff-reports.ts؛ التقرير الموضوعي|إصلاح D10/D12 واختبار تكامل|مرتفع|P1|
|التقارير والضريبة|refunds|IMPLEMENTED|src/lib/staff-reports.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|التقارير والضريبة|net|BROKEN|src/lib/staff-reports.ts؛ التقرير الموضوعي|إصلاح D10/D12 واختبار تكامل|مرتفع|P1|
|التقارير والضريبة|VAT|BROKEN|src/lib/staff-reports.ts؛ التقرير الموضوعي|إصلاح D09/D10 واختبار تكامل|مرتفع|P1|
|التقارير والضريبة|products|IMPLEMENTED|src/lib/staff-reports.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|التقارير والضريبة|customers|IMPLEMENTED|src/lib/staff-reports.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|التقارير والضريبة|HR reports|IMPLEMENTED|src/lib/staff-reports.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الإشعارات والطباعة والتشغيل|Notifications|IMPLEMENTED|src/lib/notifications.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الإشعارات والطباعة والتشغيل|receipt|IMPLEMENTED|src/lib/notifications.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الإشعارات والطباعة والتشغيل|thermal CSS|IMPLEMENTED|src/lib/notifications.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الإشعارات والطباعة والتشغيل|kitchen print|IMPLEMENTED|src/lib/notifications.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الإشعارات والطباعة والتشغيل|CI|IMPLEMENTED|src/lib/notifications.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الإشعارات والطباعة والتشغيل|backup scripts|IMPLEMENTED|src/lib/notifications.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|الإشعارات والطباعة والتشغيل|deploy|IMPLEMENTED|src/lib/notifications.ts؛ التقرير الموضوعي|PostgreSQL/Browser قبول حسب المجال|غير محسوم runtime|P2|
|سياسات الهوية|safe redirect/known role|COMPLETE|tests/offline.test.ts؛267 run total|E2E منفصل|منخفض داخل السياسة|P2|
|سياسات السعر|خصومات cents وsnapshot labels|COMPLETE|tests/offline.test.ts|تكامل snapshots مع API|متوسط|P1|
|الموظفون|provision mocks وrollback|COMPLETE|tests/staff-provision-offline.test.ts:117|Auth/DB end-to-end|متوسط|P1|
|QR العام|Variants وmodifiers|BROKEN|public-orders.ts:9؛ public-menu.ts:29|D25: إكمال العقد والتكوين|مرتفع|P1|
|النادل|أزرار الحالة|BROKEN|waiter-board.tsx:226؛ status/route.ts:62|D23: تصحيح payload وفحص HTTP|مرتفع|P1|
|النادل|نافذة نقل مسؤولية الطاولة|BROKEN|waiter-board.tsx:145 و345|D24: توصيل dialog وAPI|تشغيلي|P2|
|الطباعة|نسختان آليًا|MISSING|thermal-receipt-preview.tsx:62|تنفيذ واعتماد hardware|تشغيلي|P1|
|الطباعة|XP80TS hardware acceptance|BLOCKED|لا جهاز/قبول فعلي في الجولة|اختبار ورقي|تشغيلي|P1|
|التشغيل|Browser responsive E2E|MISSING|لا Playwright/Cypress config مكتشف|إضافة suites وبيئة|مرتفع|P1|
|النشر|deployment HEAD|IMPLEMENTED|Hostinger completed cfe1b23|smoke authenticated|متوسط|P1|
|قاعدة البيانات|rebuild migration chain|BROKEN|5 local directories بلا سجل مطابق وآثار متداخلة|baseline/diff/restore|مرتفع|P0|
|الأمان|external npm audit|BLOCKED|auto-review rejection|موافقة تصدير dependency metadata|غير مقاس|P1|
|واجهة|demo WaiterView/PosView|NOT APPLICABLE|غير متصلين production|حسم الاحتفاظ لاحقًا|صيانة|P3|

المصفوفة فهرس features وليست نتيجة اختبار live لكل سطر. الأدلة الدقيقة بالأسطر في architecture inventory والسجل13 والتقارير03–12. الوظيفة المحتوية عيبًا قد تملك أجزاء تعمل؛ BROKEN لا يعني تعطل كل الوحدة.
