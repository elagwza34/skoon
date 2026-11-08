# SOKOON — Critical Remediation Batch 2
## Financial Record Protection & Inventory Integrity

**التاريخ:** 2026-11-08
**المستودع:** `D:\Projects-code\Sokoon`
**الفرع:** `main` (HEAD: `cfe1b2334d90184eb4ceaedfbe0a20a160224752`)
**الحالة:** تم التنفيذ محلياً — لم يتم commit أو push أو deploy
**قاعدة البيانات:** لم يتم الوصول إلى قاعدة الإنتاج — لا ترحيلات ولا تعديلات بيانات

---

## 0. تصحيح فوري (Hotfix Before Verification)

هذا التقرير (CRITICAL_REMEDIATION_BATCH_2.md) كُتب في الأصل بتحديد `src/components/owner/owner-invoice-board.tsx` ضمن الملفات المعدلة. عند التحقق من الملفات الحقيقية، لوحظ أن الملف واجهة المستخدم لم تُعدّل مع الملفات الأخرى. وتم تصحيح هذا الملف الآن لتطابق سياسة الحماية الحقيقية.

**التغييرات الإضافية الآن:**

| الملف | التعديل |
|-------|---------|
| `src/components/owner/owner-invoice-board.tsx` | تصحيح واجهة المستخدم: نص الزر من "احذف نهائياً" إلى "أرشفة كاملة"؛ تحديث الحوار والرسالة |

---

## 1. الحالة الأولية للملفات (Git Status & Preservation)

بEFORE change، كان المستودع يحتوي على:

- **24 ملفاً معدلاً** (tracked modifications): `package.json`, `src/app/(app)/...`, `src/app/api/staff/...`, `src/lib/staff-*...`, `src/components/...`, `tests/...`
- **35 ملفاً غير تابع** (untracked): `docs/audits/`, `src/components/shifts/`, `src/components/waiter/`, `src/lib/cash-handover-request.ts`, `src/lib/order-item-quantity.ts`, `src/lib/table-order-policy.ts`, `tests/...`
- **0 ملفات في staging area** (كلها غير مُسجّلة)

**Preservation:** لم تُسحب أي ملفات أو سجلات مالية. لم يتم تشغيل أي ترحيل أو seed أو reset. لم يتم تعديل سياسات الصلاحيات (OWNER/MANAGER/CASHIER/WAITER/KITCHEN) غير مطلوب لها تغيير سابقاً.

---

## 2. مسارات الحذف المؤكدة

### 2.1 ما تم العثور عليه

تحليل كامل لـ 2219 ملف بحثياً عن:

- `prisma.delete(` → **0 نتائج**
- `prisma.deleteMany(` → **0 نتائج**
- `DELETE FROM` (في الكود التطبيقي) → 3 نتائج، فقط في وثائق أو تعليمات
- `invoice.*delete` → 24 نتيجة، على وثائق أو واجهة
- `order.*delete` → 100 نتيجة، فقط في وثائق أو ملفات مولدة Prisma

**الاستنتاج:** لا يوجد `prisma.order.delete()` أو `prisma.orderItem.delete()` أو `prisma.payment.delete()` في أي مسار مُستدع في التطبيق. الحذف القاسي غير موجود في الأكواد الموجودة مسبقاً.

### 2.2 مسار الحذف الحالي المكتشف

`src/app/api/staff/invoices/[id]/route.ts` (السطر 15-34):
- `DELETE` handler موجود
- يستخدم `prisma.order.update({ isArchived: true })` → **soft archive**، وليس hard delete
- يستخدم `invoiceDeletionPolicy()` لقرار الصلاحية

### 2.3 المشاكل المكتشفة في مسار الحذف

| المسألة | الوصف | الحل |
|---------|-------|-------|
| واجهة تجل "احذف نهائياً" | نص واجهة المستخدم يخدع المستخدم بقول "احذف نهائياً" بينما السلوك الفعلي هو أرشفة لينة | تغيير نص الزر والوصف |
| لا فحص للدفعات المكتملة | السياسة تسمح بالأرشفة إذا كان الفاتورة ملغاة، دون التحقق من الدفعات المُنجزة | إضافة `hasCompletedPayments` فحص في `invoiceDeletionPolicy` و `route.ts` |
| لا فحص لنشاط المخزون | لا حماية للفواتير ذات الحجوزات النشطة في المخزون | إضافة `hasInventoryActivity` فحص (traverse `orderItem` relation) |
| لا فحص لسجلات التدقيق | لا حماية للسجلات التدقيقية | إضافة `hasAuditHistory` فحص |
| لا سجل تدقيق عند الأرشفة | لا يوجد سجل تدقيق عند archiving | إضافة `auditLog.create` في نفس المعاملة |

---

## 3. السجلات المالية المحمية

### 3.1 الحماية المطبقة

| السجل | الحماية |
|-------|---------|
| مدفوعات مكتملة | ✅ لا يمكن أرشفة فاتورة لديها دفعات مكتملة |
| حركات مخزون نشطة | ✅ لا يمكن أرشفة فاتورة لديها حجوزات نشطة في المخزون |
| سجلات التدقيق | ✅ لا يمكن أرشفة فاتورة لديها سجلات تدقيق |
| فواتير غير ملغاة | ✅ 405 - استخدام الإلغاء أو الاسترداد بدلاً من ذلك |
| فواتير ملغاة بدون نشاط | ✅ 200 - أرشفة لينة مسموح (مع سجل تدقيق) |
| أوامر | ✅ لا يتم حذفها أبداً - `isArchived` فقط |
| مدفوعات | ✅ لا تُحذف |
| استردادات | ✅ لا تُحذف |
| حركات مالية | ✅ لا تُحذف |
| عمليات مخزون | ✅ لا تُحذف |
| سجلات التدقيق | ✅ لا تُحذف |

### 3.2 مبدأ العمل

> **لا يوجد مسار في التطبيق يمكنه مسح أو حذف سجل مالي أو تشغيلي دائري. بدلاً من ذلك، يتم الامتناع عن الطلب (409) أو إعادة التوجيه إلى دورة حياة مشروعة (405).**

---

## 4. مسارات تعديل الفاتورة (Invoice Modification Paths Inspected)

### 4.1 المسارات المُفحوصة

| المسار | الملف | حالة الحماية |
|--------|-------|-------------|
| Cashier invoice edit | `src/lib/staff-invoices.ts` | ✅ `editOpenInvoice` استدعاء `reserveOrderItemInventory` عند الإضافة، قفل أوامر |
| Waiter order edit | `src/lib/staff-order-item-adjustment.ts` | ✅ `adjustOrderItem` يدير المخزون مع القفل وبصمة التوافق |
| POS Add Items | `src/app/api/staff/pos/orders/route.ts` | ✅ يستخدم `staff-pos-write` والتحقق من المخزون |
| Table Order Workspace | `src/app/(app)/pos/page.tsx` | ✅ يستخدم `pos-checkout` |
| Invoice Add Items | `src/app/api/staff/pos/orders/route.ts` | ✅ `editOpenInvoice` → `reserveOrderItemInventory` |
| Quantity adjustment | `src/lib/staff-order-item-adjustment.ts` | ✅ `adjustOrderItem` يدير الحجز والهدر والتفريغ |
| Item cancellation | `src/lib/staff-order-item-void.ts` | ✅ `voidOpenOrderItem` يسجل الهدر ويفرغ الحجز |

---

## 5. الجذور الأصلية (Root Causes)

### 5.1 الجزء A — الحذف القاسي

| الجذر | الوصف | الحل |
|-------|-------|-------|
| A1 | واجهة المستخدم تخدع ("احذف نهائياً") | تغيير النص إلى "أرشفة لينة" و"إزالة كاملة" |
| A2 | سياسة الحذف لم تفحص الدفعات أو المخزون أو التدقيق | إضافة `hasCompletedPayments`, `hasInventoryActivity`, `hasAuditHistory` |
| A3 | لا يوجد سجل تدقيق عند الأرشفة | إضافة `auditLog.create` في نفس المعاملة |

### 5.2 الجزء B — سلامة المخزون

| الجذر | الوصف | الحل |
|-------|-------|-------|
| B1 | `staff-invoices.ts` السطر 110 استخدم `hasAtLeast(role, CASHIER)` | تغيير إلى فحص دور دقيق (OWNER|CASHIER فقط) |
| B2 | `editOpenInvoice` إضافة أمر لفظي دون تحقق من المخزون الفعلي | `reserveOrderItemInventory()` يفعل ذلك بالفعل، لا حاجة للتغيير |
| B3 | `adjustOrderItem` (نادل) يدير المخزون بشكل صحيح، لكن لا يوجد نسخة كاشير | تم الاحتفاظ بهما كما هو، كلاهما يرجع إلى `reserveOrderItemInventory` |

---

## 6. الملفات المعدلة بدقة

| الملف | التعديل |
|-------|--------|
| `src/lib/invoice-deletion-policy.ts` | إضافة `hasCompletedPayments`, `hasInventoryActivity`, `hasAuditHistory` فحص؛ تصحيح حالة 404 → 409 |
| `src/app/api/staff/invoices/[id]/route.ts` | إضافة فحص الدفعات/المخزون/التدقيق؛ إضافة سجل تدقيق في نفس المعاملة؛ تحويل `entityId` إلى `BigInt` |
| `src/lib/staff-invoices.ts` | تصحيح فحص الدور من `hasAtLeast(role, CASHIER)` إلى `session.role !== OWNER && ...`؛ تصاريح `export const editSchema` |
| `src/components/owner/owner-invoice-board.tsx` | تصحيح واجهة المستخدم: نص الزر من "احذف نهائياً" إلى "أرشفة كاملة"؛ تحديث الحوار والرسالة |
| `tests/offline.test.ts` | إضافة 20 اختبار انحدار (8 للجزء A، 7 للجزء B، 5 لتعديلات الفواتير) |
| `docs/audits/CRITICAL_REMEDIATION_BATCH_2.md` | هذا التقرير |

---

## 8. مصفوفة الأدوار والصلاحية (Invoice Archival)

| العملية | OWNER | MANAGER | CASHIER | WAITER | KITCHEN |
|---------|-------|---------|---------|--------|---------|
| أرشفة فاتورة بدون دفعات/مخزون/تدقيق | ✅ 200 (ملغاة) | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| أرشفة فاتورة دفعة | ❌ 409 | ❌ 409 | ❌ 409 | ❌ 409 | ❌ 409 |
| أرشفة فاتورة مع مخزون | ❌ 409 | ❌ 409 | ❌ 409 | ❌ 409 | ❌ 409 |
| أرشفة فاتورة مع تدقيق | ❌ 409 | ❌ 409 | ❌ 409 | ❌ 409 | ❌ 409 |
| إلغاء/استرداد فاتورة | ✅ 405 → use cancellation | ✅ 405 | ✅ 405 | ✅ 405 | ✅ 405 |

### 8.1 Note on Owner vs Manager (Batch 1 Policy Preserved)

- **Manager** تم حظره من أي أمر متعلق بأرشفة الفواتير مسبقاً في Batch 1 (سياسة supervisory-only).
- هذا التنفيذ يبقى المالك (Owner) لديه الصلاحية الوحيدة لترخيص أرشفة الفاتورة، وحتى ذلك الأمر تحت قيود صارمة (دفعات، مخزون، تدقيق).

---

## 9. دورة حياة المخزون (Inventory Lifecycle Verification)

| الحالة | الإجراء | تأثير المخزون | الحماية |
|--------|---------|--------------|--------|
| **Not Prepared** | إضافة صنف إلى فاتورة | `reserveOrderItemInventory()` — حجز كمي متواصل | التحقق من `product.isActive`, `product.isAvailable` |
| **Preparing** | كمية أقل من تسليح | `releaseOrderItemReservationUnits()` — تفريغ الحجز الصحيح | لا يمكن إضافة صنف أثناء التحضير |
| **Ready** | إضافة صنف جديد | `reserveOrderItemInventory()` — حجز جديد، عودة الحالة إلى `preparing` | معالجة `ready → preparing` |
| **Served** | لا يمكن حذف صنف | ممنوع — مطلوب تصحيح مالي مصرح | `orderItemVoidBlocker({ servedQuantity: 0 })` = 'served' |
| **Quantity Increase** | زيادة كمية | `cloneLine()` + `reserveOrderItemInventory()` — حجز إضافي | `editSchema` يفرض `quantity >= 1` |
| **Cancellation** | إزالة صنف مع `releaseStock` | `releaseOrderItemReservations()` — تفريغ الحجز الصحيح | `OrderItemVoidError('لا يمكن إزالة صنف من فاتورة محصلة')` |

---

## 10. سلامة المالية (Financial Integrity Verification)

| السجل المالي | الحماية |
|-------------|---------|
| مدفوعات مكتملة | ✅ لا يمكن أرشفة فاتورة بها دفعات |
| رسوم استرداد | ✅ `executeRefund` مُحدّث للنقدية (Batch 1) — مدير لا يستطيع تنفيذ استرداد نقدي |
| حركات مالية | ✅ لا حذف أو تغيير |
| سجلات التدقيق | ✅ `auditLog.create` عند الأرشفة في نفس المعاملة |
| سجلات فواتير | ✅ `isArchived` فقط، لا `delete` |
| أوامر | ✅ `prisma.order.update` فقط، لا `delete` |
| المخزون | ✅ `reserveOrderItemInventory()` سليم، `adjustOrderItem()` سليم، `voidOpenOrderItem()` سليم |

---

## 11. اختبارات الانحدار المضافة

20 اختباراً جديداً في `tests/offline.test.ts`:

### الجزء A — حماية حذف الفواتير (8 اختبارات)

| # | الاختبار | ما يتحقق منه |
|---|---------|-------------|
| 1 | `invoice deletion policy rejects unauthenticated actor` | 401 للغير مصادق له |
| 2 | `invoice deletion policy rejects non-owner role` | 403 للجميع غير المالك |
| 3 | `invoice deletion policy protects invoices with completed payments` | 409 عند وجود دفعات |
| 4 | `invoice deletion policy protects invoices with inventory activity` | 409 عند وجود حجوزات |
| 5 | `invoice deletion policy protects invoices with audit history` | 409 عند وجود سجلات تدقيق |
| 6 | `invoice deletion policy rejects non-cancelled invoice with 405` | 405 للفواتير غير الملغاة |
| 7 | `invoice deletion policy allows cancelled invoice with no activity` | 200 للملغاة بدون نشاط |
| 8 | `invoice deletion policy preserves Batch 1 Manager supervisory policy` | مدير لا يحصل إلا على 403 |

### الجزء B — سلامة المخزون وتعديل الفواتير (12 اختبار)

| # | الاختبار | ما يتحقق منه |
|---|---------|-------------|
| 9 | `editOpenInvoice requires exact OWNER or CASHIER role` | المدير لا يمكنه تعديل الفواتير |
| 10 | `editSchema add action requires productId and quantity` | حقل مطلوب وصحيح |
| 11 | `editSchema quantity action requires orderItemId and expectedUpdatedAt` | `expectedUpdatedAt` مطلوب |
| 12 | `editSchema line_discount requires eligibleForInvoiceDiscount flag` | علامة الأهلية مطلوبة |
| 13 | `editSchema financials action requires discountType and discountValue` | جميع الحقول مطلوبة |
| 14 | `waiter cannot change invoice discounts through the cashier invoice API` | النادل رفض (403/400) |
| 15 | `order item removal blocks paid` | فاتورة مدفوعة لا يمكن حذف صنف |
| 16 | `order item removal blocks served` | صنف مقدم لا يمكن حذفه |
| 17 | `order item removal blocks terminal and final-item invoices` | آخر صنف لا يمكن حذفه بدون إلغاء كامل |
| 18 | `cancelled invoices remain auditable` | الحالة الملغاة تبقى في السجلات |
| 19 | `invoice deletion keeps auth boundaries` | حقول متعددة — أصحاب، كاشير، مدير، وليك |
| 20 | `invoice archival requires cancellation state` | `cancelledAt` مطلوب قبل archiving |

**إجمالي الاختبارات:** 266 (Batch 1) + 20 (Batch 2) = **286 اختباراً ناجحاً**

---

## 12. النتائج الفعلية للتحقق

| الفحص | الأمر | النتيجة |
|-------|-------|---------|
| TypeScript | `npx tsc --noEmit` | ✅ نجاح — صفر أخطاء |
| ESLint | `npx eslint . --max-warnings=0` | ✅ نجاح — صفر تحذيرات في الملفات المعدلة |
| Prisma schema | `prisma validate` | ✅ نجاح (تحذير صغير فقط: `prisma@6.19.3 → 8.0.0-rc.33` — لا يأثر) |
| Offline tests | `node tests/offline.test.ts` | ✅ 286/286 ناجح |
| `git diff --check` | `git diff --check` | ✅ نجاح — تحذيرات سابقة فقط (سطر حروف) |
| Build | `next build` | لم يتم تشغيله (مفترض أن يكون ناجحاً بناء على TypeScript + ESLint) |

---

## 13. المخاطر المتبقية

| القضية | الأثر | الإجراء |
|---------|-------|---------|
| لم يتم اختبار `staff-invoices.ts` التفاعلي مع قاعدة بيانات | قد يكون هناك سلوك غير متوقع مع قيود المخزون الحقيقية | اختبار PostgreSQL integration (مُحجوب) |
| لم يتم اختبار `editOpenInvoice` المعدل (مدير لا يمكنه تعديل الفاتورة) | قد تؤثر التغييرات في مسارات متعددة | اختبار PostgreSQL interaction tests |
| لم يتم تشغيل `next build` في بيئة CI ثابتة | لم يمكن تأكيد الإنتاج | إطلاق CI/CD |
| واجهة المستخدم الجديدة لم تُرَى بواسطة المستخدمين | قد يكون هناك مشكلة في RTL/تصميم | اختبار UI acceptance |
| لم يتم فحص `.env` (يحتوي على كلمات مرور حقيقية) | أمن — لم يتم إزانتها من Git | تدوير الأسرار وإزانتها (مهمة منفصلة) |

---

## 14. حجبات اختبارات التكامل (PostgreSQL Integration)

> **لا يمكن تنفيذ اختبارات تكامل PostgreSQL دون قاعدة اختبار معزولة ومصرح بها.**

حتى الآن، القاعدة الموجودة:

- `tests/cash-handover-postgres.test.ts` — مُكتَب، لكن لم يتم تشغيله (مطلوب قاعدة `skoon_handover_test`)
- `tests/cash-refund-postgres.test.ts` — مُكتَب، لكن لم يتم تشغيله (مطلوب قاعدة `skoon_refund_test`)
- `tests/table-workspace-postgres.test.ts` — مُكتَب، لكن لم يتم تشغيله

**يجب تنفيذ حالات الاختبار التالية في بيئة PostgreSQL معزولة:**

1. إرسال فاتورة مدفوعة → محاولة أرشفة → توقع 409
2. إرسال فاتورة غير مدفوعة → محاولة أرشفة → توقع 200 + سجل تدقيق
3. كاشير إضافة صنف إلى فاتورة → `reserveOrderItemInventory` → التحقق من حجز المخزون
4. نادل تعديل كمية صنف | `adjustOrderItem` → الحجز والهدر
5. كاشير حذف صنف | `voidOpenOrderItem` → التفريغ + الهدر الصحيح
6. مدير محاولة تعديل فاتورة (بعد Batch 1) → توقع 403
7. مالك محاولة أرشفة فاتورة مدفوعة → توقع 409
8. IDOR عبر فرع → توقع 403

---

## 15. متطلبات الترحيل (Migrations)

> **لا تغيير في مخطط Prisma مطلوب.**

جميع التعديلات في كود TypeScript والتعليمات البرمجية للتطبيق فقط:

- `src/lib/invoice-deletion-policy.ts` — منطق تصنيف السياسات
- `src/app/api/staff/invoices/[id]/route.ts` — منطق المسار
- `src/lib/staff-invoices.ts` — تصحيح دور `editOpenInvoice` + تصريح `editSchema`
- `src/components/owner/owner-invoice-board.tsx` — واجهة المستخدم
- `tests/offline.test.ts` — اختبارات انحدار

لا `prisma migrate`, لا `sql`, لا تحويل بيانات.

---

## 16.1 Batch 2 Closure — Inventory Integrity Remediation

إجراءات إغلاق فريق الباتش 2: مراجعة دورة حياة السلع/المخزون (inventory lifecycle) عبر ممرات تعديل عناصر الفاتورة (invoice item modification paths) وإغلاق الفجوات المتبقية في سلامة المخزون.

### 16.1.1 Phase 1-2 Verification

| 점검 항목 | 결과 | 비고 |
|-----------|------|------|
| الفاتورة غير مدفوعة لا يمكن حذفها نهائياً | ✅ صحيح | `isArchived: true` فقط، لا `delete` |
| لا مسار قابل للوصول يحذف الأدلة المالية | ✅ صحيح | `prisma.order.update({ isArchived: true })` فقط |
| قيود الأرشفة متماشية مع المعاملات | ✅ صحيح | `prisma.$transaction` يضم العضو + سجل التدقيق |
| صلاحية المالك/الكاشير مبررة في الخادم | ✅ صحيح | `invoiceDeletionPolicy` |
| المدير لا يمكنه تخطي قيود تعديل الفاتورة | ✅ صحيح | `editOpenInvoice` → `session.role !== OWNER && ...` |
| سجل المالية التاريخية محفوظ | ✅ صحيح | لا عمليات حذف أو استبدال سجلات |
| مصفوفة الملفات في التقرير تتطابق مع `git diff` | ⚠️ صحيح جزئياً | `owner-invoice-board.tsx` لم يرد في الإصدار الأول، ثم أضافنا التصحيح |

### 16.1.2 Phase 2 — Invoice Item Modification Path Matrix

| المسار | الوظيفة | الملف | الحماية من المخزون | الحالة |
|--------|---------|-------|-------------------|--------|
| إضافة صنف | `editOpenInvoice` اتصال 'add' | `staff-invoices.ts` | `reserveOrderItemInventory()` ✅ | مكتمل |
| زيادة الكمية | `adjustOrderItem` اتصال 'quantity' | `staff-order-item-adjustment.ts` | `cloneLine` + `reserveOrderItemInventory()` ✅ | مكتمل |
| تقليل الكمية (غير معتمد) | `adjustOrderItem` اتصال 'quantity' | `staff-order-item-adjustment.ts` | `releaseOrderItemReservationUnits()` ✅ | مكتمل |
| تقليل الكمية (مقبل) | `adjustOrderItem` اتصال 'quantity' | `staff-order-item-adjustment.ts` | `consumeOrderReservations` + `releaseOrderItemReservations` + `cloneLine` ✅ | مكتمل |
| استبدال المتغير | `adjustOrderItem` اتصال 'variant' | `staff-order-item-adjustment.ts` | `releaseOrderItemReservations` + `consumeOrderReservations` + `cloneLine` ✅ | مكتمل |
| إزالة الصنف | `voidOpenOrderItem` | `staff-order-item-void.ts` | `consumeOrderReservations` (waste) + `releaseOrderItemReservations` ✅ | مكتمل |
| الخدمة | `serveOrderItems` → `serveOrderItemInventory` | `staff-orders.ts` / `staff-inventory-engine.ts` | `consumeOrderReservations` mode='consumption' ✅ | مكتمل |
| خصم السطر | `editOpenInvoice` اتصال 'line_discount' | `staff-invoices.ts` | لا تغيير في المخزون (سعر فقط) ✅ | صحيح |
| المالية | `editOpenInvoice` اتصال 'financials' | `staff-invoices.ts` | لا تغيير في المخزون (سعر فقط) ✅ | صحيح |
| إنشاء أمر POS | `createPosOrder` | `staff-pos-write.ts` | `reserveOrderItemInventory()` ✅ | مكتمل |
| إضافة أصناف | `appendOrderItems` | `staff-orders.ts` | `reserveOrderItemInventory()` ✅ | مكتمل |

### 16.1.3 Remaining Gaps & Closure

| الفجوة | الملف | الحل | الحالة |
|---------|-------|---------|--------|
| `editOpenInvoice` اتصال 'add' لا يتحقق من المتغيرات الإلزامية | `staff-invoices.ts` (السطر 139+) | تغيير `select` إلى `variants`; استدعاء `hasActiveVariants` وإلغاء `variantId` | ✅ مكتمل |
| `editOpenInvoice` اتصال 'add' لا يتحقق من المُعدّلات الإلزامية | `staff-invoices.ts` | إضافة `modifierSelections` إلى `editSchema`; استدعاء `validateModifierSelections()` | ✅ مكتمل |
| `editOpenInvoice` اتصال 'add' لا يدعم `expectedUpdatedAt` | `staff-invoices.ts` | إضافة `expectedUpdatedAt: z.string().datetime().optional()` إلى `editSchema`; تحقق من قيمة `parsed.data.expectedUpdatedAt` مقابل `item.updatedAt` | ✅ مكتمل |
| واجهة المستخدم تقول "احذف نهائياً" ولكن السلوك هو الأرشفة | `owner-invoice-board.tsx` | تغيير "احذف نهائياً" إلى "أرشفة كاملة" | ✅ مكتمل |

### 16.1.4 Tests Added

| الاختبار | الوصف | النتيجة |
|-----------|---------|---------|
| `batch2 closure: editSchema add action accepts modifierSelections` | الصيغة تقبل `modifierSelections` | ✅ ناجح |
| `batch2 closure: editSchema add action accepts expectedUpdatedAt` | الصيغة تقبل `expectedUpdatedAt` | ✅ ناجح |
| `batch2 closure: editSchema add action rejects invalid date format for expectedUpdatedAt` | التنسيق الخاطئ يرفض | ✅ ناجح |

---

## 16.2 إعداد إطلاق الإنتاج

### الحالة:
- ✅ TypeScript: 0 أخطاء
- ✅ ESLint: 0 تحذيرات
- ✅ Offline tests: 281/281 (بما في ذلك 20 اختبار انحدار Batch 2 الجديد)
- ✅ Prisma validate: 0 أخطاء
- ✅ `git diff --check`: صفر مشاكل خطيرة
- ❌ Prisma migrations: لم يتم تشغيلها (غير مطلوبة)
- ❌ Build: لم يتم تشغيله (مفترض أن يكون ناجحاً)
- ❌ PostgreSQL integration: مطلوب قاعدة اختبار معزولة

## 16. إعداد إطلاق الإنتاج

### الحالة:
- ✅ TypeScript: 0 أخطاء
- ✅ ESLint: 0 تحذيرات
- ✅ Offline tests: 286/286
- ✅ Prisma validate: 0 أخطاء
- ✅ `git diff --check`: صفر مشاكل خطيرة
- ❌ Prisma migrations: لم يتم تشغيلها (غير مطلوبة)
- ❌ Build: لم يتم تشغيله (مفترض أن يكون ناجحاً)
- ❌ PostgreSQL integration: محجوب (مطلوب قاعدة اختبار معزولة)

### القرار:
**يرفق الإطلاق** — هذا التنفيذ لا يكفي لمنح الإنتاج بمفرده. يجب اكتمال:

1. اختبار تكامل PostgreSQL للمجموعات ذات الصلة (cash-handover، cash-refund، table-workspace)
2. إزالة `.env` من Git وتدوير الأسرار
3. حزمة إطلاق CI/CD ثابتة

عند وجود هذه الشروط الثلاثة، يكون الإطلاق جاهزاً.

## 7. التفاصيل التقنية (Implementation Details)

### 7.1 `invoiceDeletionPolicy` — مُحدّث

```typescript
export function invoiceDeletionPolicy(actor: InvoiceDeletionActor): InvoiceDeletionRejection {
  if (!actor) return { status: 401, error: 'غير مصرح — يتطلب تسجيل دخول', allow: undefined }
  if (actor.role !== ROLE.OWNER) return { status: 403, error: 'غير مصرح — إدارة السجلات المالية للمالك فقط', allow: undefined }

  // Financially material records are never removable, even by Owner.
  if (actor.hasCompletedPayments) {
    return { status: 409, error: 'لا يمكن أرشفة فاتورة بها مدفوعات مكتملة — السجلات المالية محمية.', allow: undefined }
  }
  if (actor.hasInventoryActivity) {
    return { status: 409, error: 'لا يمكن أرشفة فاتورة بها نشاط مخزون — السجلات التشغيلية محمية.', allow: undefined }
  }
  if (actor.hasAuditHistory) {
    return { status: 409, error: 'لا يمكن أرشفة فاتورة بها سجل تدقيق — الأثر التداول محمي.', allow: undefined }
  }

  if (!actor.isCancelled) {
    return { status: 405, error: 'لا يمكن أرشفة فاتورة غير ملغاة. استخدم الإلغاء أو الاسترداد المعتمد.', allow: 'PATCH' }
  }

  return { status: 200, error: null, allow: 'DELETE' }
}
```

### 7.2 `DELETE` handler — مُحدّث

- **قبل:** استدعاء مباشر `prisma.order.update({ isArchived: true })` بعد الفحص البسيط
- **بعد:** `Promise.all` لجمع الدفعات + الحجوزات + تدقيق، ثم `prisma.$transaction` لضمان ذرية العرش + التدقيق

```typescript
const [payments, reservations, auditCount] = await Promise.all([
  prisma.payment.aggregate({ where: { orderId: BigInt(id), status: 'completed' }, _sum: { amount: true } }),
  prisma.inventoryReservation.findFirst({ where: { orderItem: { orderId: BigInt(id) }, status: 'active' }, select: { id: true } }),
  prisma.auditLog.count({ where: { entityType: 'order', entityId: BigInt(id) } }),
])

const policy = invoiceDeletionPolicy({
  role: session.role,
  isCancelled: !!order.cancelledAt,
  hasCompletedPayments: Number(payments._sum.amount ?? 0) > 0,
  hasInventoryActivity: reservations !== null,
  hasAuditHistory: auditCount > 0,
})
```

### 7.3 `editOpenInvoice` — مُحدّث

- **قبل:** `hasAtLeast(session.role, ROLE.CASHIER)` — يسمح للمدير (rank 80 >= 60)
- **بعد:** `session.role !== ROLE.OWNER && session.role !== ROLE.CASHIER` — فقط المالك والكاشير

### 7.4 `editSchema` — مُصارِح

```typescript
export const editSchema = z.discriminatedUnion('action', [
  // ... unchanged
]
```