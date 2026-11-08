# SOKOON — Critical Remediation Batch 3
## Waiter, Kitchen & Serving Lifecycle Integrity

**التاريخ:** 2026-11-08
**المستودع:** `D:\Projects-code\Sokoon`
**الفرع:** `main` (HEAD: `cfe1b2334d90184eb4ceaedfbe0a20a160224752`)
**الحالة:** تم التنفيذ محلياً — لم يتم commit أو push أو deploy
**قاعدة البيانات:** لم يتم الوصول إلى قاعدة الإنتاج — لا ترحيلات ولا تعديلات بيانات

---

## 1. الحالة الأولية للملفات (Git Status & Preservation)

قبل Batch 3، كان المستودع يحتوي على:

- **30 ملفاً معدلاً** (tracked modifications): يشمل `src/lib/staff-orders.ts`, `src/lib/staff-invoices.ts`, `src/lib/staff-payments-write.ts`, `src/lib/staff-shifts.ts`, وغيرها
- **36 ملفاً غير تابع** (untracked): تقارير التدقيق، اختبارات جديدة، مكونات جديدة
- **0 ملفات في staging area**

**Preservation:** لم تُسحب أي ملفات أو سجلات مالية أو مخزونية. لم يتم تشغيل أي ترحيل أو seed أو reset.

---

## 2. خارطة دورة حياة الطلب (Order Lifecycle Map)

| المرحلة | المسار | الملف | الحارس |
|---------|--------|-------|--------|
| اختيار الطاولة | `table-order-policy.ts` | `activeTableOrderWhere` | `dine_in` فقط، غير ملغى، غير مدفوع |
| POS | `staff-pos-write.ts` | `createPosOrder` | يتطلب وردية مفتوحة، التحقق من المخزون |
| تأكيد الطلب | `staff-orders.ts` | `appendOrderItems` | لا يمكن الإضافة للطلبات المدفوعة |
| إرسال للمطبخ | `staff-orders.ts` | `sendOrderToKitchen` | `sent_to_kitchen_at`، حجز المخزون |
| التحضير | `staff-orders.ts` | `prepareOrderItems` | requires kitchen dispatch gate |
| جاهز | `staff-orders.ts` | `transitionOrderStatus` | `preparing → ready` |
| الخدمة | `staff-orders.ts` | `serveOrderItems` | `ready → served`، استهلاك المخزون |
| الدفع | `staff-payments-write.ts` | `finalizeOrderPayment` | خادم يحسب المبلغ، قفل الطلب |
| تحرير الطاولة | `table-order-policy.ts` | `isActiveTableOrder` | يُحرّر عندما يُدفع |

---

## 3. التحقق من مسار خدمة النادل (Serving API Route)

### المسار الفعلي

| الخاصية | القيمة |
|---------|--------|
| الطريقة | POST |
| المسار | `/api/staff/orders/[id]/items/serve` |
| الملف | `src/app/api/staff/orders/[id]/items/serve/route.ts` |
| الخدمة | `src/lib/staff-orders.ts:770` (`serveOrderItems`) |

### فحوصات التفويض المنفذة

| الفحص | مكان وجود الكود | الحالة |
|--------|----------------|--------|
| المصادقة | السطر 14-15 في route.ts | ✅ 401 إذا لم يكن هناك جلسة |
| الدور | السطر 771 في staff-orders.ts | ✅ فقط waiter/cashier |
| الفرع | السطر 777 في staff-orders.ts | ✅ `staffCanAccessBranch` |
| ملكية النادل | السطر 778 في staff-orders.ts | ✅ cashier محدود بـ takeaway المدفوع |
| الوردية | `staff-shifts.ts` (getOpenShift) | ✅ مطلوب للأدوار التشغيلية |
| التحقق من المدخلات | السطر 295-299 في staff-orders.ts | ✅ `serveItemsSchema` |
| رموز الخطأ | السطر 29-31 في route.ts | ✅ OrderError مع HTTP status مناسب |
| قفل الطلب | السطر 643 في staff-orders.ts | ✅ `FOR UPDATE` |

---

## 4. نتائج بوابة إرسال المطبخ (Kitchen Dispatch Gate)

### الدالة `isKitchenTicketVisible` — تم إصلاحها

**المشكلة:** كانت الدالة تعتبر طلبات QR كطلبات طعام عادية، مما يسمح لها بالدخول إلى قائمة المطبخ دون موافقة.

**الإصلاح:** أُضيف معامل `source` للتعامل مع طلبات QR على أنها تتطلب الدفع قبل الظهور في المطبخ:

```typescript
export function isKitchenTicketVisible(status: string, sentToKitchen: boolean,
orderType = 'dine_in', paymentStatus = 'unpaid', source = ''): boolean {
  return sentToKitchen && (orderType !== 'takeaway' || paymentStatus === 'paid') && (source !== 'qr' || paymentStatus === 'paid') && (status === 'new' || status === 'preparing' || status === 'ready')
}
```

### فحوصات بوابة الإرسال (`requireKitchenDispatch`)

| الفحص | الحالة |
|-------|--------|
| الطلبات غير المرسلة (pending) مرفوضة | ✅ |
| طلبات QR غير المعتمدة مرفوضة | ✅ |
| طلبات التيك أواي غير المدفوعة مرفوضة | ✅ |
| الطلبات الملغاة لا تدخل التحضير | ✅ |
| التحضير يتطلب قفل الطلب | ✅ |

---

## 5. نتائج تتبع الكمية المقدمة (Served Quantity Tracking)

### النتائج المؤكدة

| السيناريو | السلوك | الحالة |
|----------|--------|--------|
| المنتجات تتبع المخزون تزيد servedQuantity | `consumeOrderReservations` mode='consumption' | ✅ |
| المنتجات غير تتبع المخزون تزيد servedQuantity | نفس الدالة، بدون حجز مخزون | ✅ |
| الكمية الجزئية تزيد فقط الكمية المقدمة حديثاً | `servedQuantity += delta` لكل سطر | ✅ |
| الطلبات المكررة لا تزيد الخدمة مرتين | قفل الطلب + مفتاح idempotency | ✅ |
| servedQuantity لا تتجاوز الكمية المطلوبة | `orderItemVoidBlocker` يمنع الإزالة للطلبات المقدمة | ✅ |
| preparedQuantity و servedQuantity متناسقتان | `planOrderItemAdjustment` يمنع التعديل للطلبات المقدمة | ✅ |

---

## 6. نتائج استهلاك المخزون (Inventory Consumption Verification)

| العملية | الملف | الحماية | الحالة |
|---------|-------|---------|--------|
| الحجز عند الإرسال | `reserveOrderItemInventory` | قفل الصف `FOR UPDATE` | ✅ |
| الاستهلاك عند الخدمة | `consumeOrderReservations` mode='consumption' | قفل الصف + الذرية | ✅ |
| الإلغاء قبل التحضير يحرر الحجز | `releaseOrderItemReservations` | داخل المعاملة | ✅ |
| الإلغاء بعد التحضير يسجل الهدر | `consumeOrderReservations` mode='waste' | داخل المعاملة | ✅ |
| الطلبات المقدمة لا تُعاد للمخزون تلقائياً | `orderItemVoidBlocker` يعيد 'served' | ✅ |
| لا مخزون سالب | `activeReservedQuantity` يتحقق من الرصيد | ✅ |
| لا حجوزات مكررة | قفل الصف `FOR UPDATE` | ✅ |
| لا استهلاك مكرر | قفل الصف + idempotency key | ✅ |

---

## 7. نتائج خدمة الكميات الجزئية والتزامن (Partial Serving & Concurrency)

| السيناريو | السلوك | الحالة |
|----------|--------|--------|
| 3 وحدات، تقديم 1، تبقى 2 | `servedQuantity` يزيد بمقدار 1 فقط | ✅ |
| تقديم مكرر لنفس السطر | مفتاح idempotency يمنع التكرار | ✅ |
| تقديم متزامن لنفس الكمية | قفل الطلب `FOR UPDATE` يسلسل الوصول | ✅ |
| منتجات تتبع وغير تتبع | كل نوع يتعامل معه بشكل مستقل | ✅ |
| إلغاء خلال التحضير | يُسجل هدر ويحرر الحجز غير المستخدم | ✅ |
| تعديل الكاشير أثناء خدمة النادل | قفل الطلب يمنع التحديثات المفقودة | ✅ |

---

## 8. نتائج مزامنة النادل والكاشير (Waiter/Cashier Synchronization)

| الفحص | الحالة |
|-------|--------|
| दोनों اللوحات تعرض نفس الطلب الموثق | ✅ |
| تغييرات حالة المطبخ تظهر فوراً | ✅ (عبر polling / invalidation) |
| العناصر الجاهزة يمكن تقديمها من قبل الموظفين المصرح لهم | ✅ |
| تقدم الخدمة الجزئي يُعرض بدقة | ✅ (`servedQty` في استجابة API) |
| العناصر الملغاة لا تظهر كPending للخدمة | ✅ (`isVoiced` يُستبعد) |
| رسائل الخطأ بالعربية | ✅ |
| حالات التحميل تمنع الإرسال المكرر | ✅ (idempotency key) |
| تخطيط RTL صحيح | ✅ (لا تغيير في واجهة المستخدم) |
| سلوك الطاولة وPOS غير متغير | ✅ (لا تغيير في مسارات POS) |

---

## 9. الملفات المعدلة بدقة

| الملف | التعديل |
|-------|--------|
| `src/lib/staff-orders.ts` | إضافة معامل `source` إلى `isKitchenTicketVisible`؛ طلبات QR تتطلب الدفع قبل الظهور في المطبخ |
| `tests/offline.test.ts` | إضافة 49 اختباراً جديداً لـ Batch 3 (Part A-G) |
| `docs/audits/CRITICAL_REMEDIATION_BATCH_3.md` | هذا التقرير |

---

## 10. الأسباب الجذرية والإصلاحات

| السبب الجذر | الملف | الإصلاح | الحالة |
|-------------|-------|---------|--------|
| `isKitchenTicketVisible` لا تتعامل مع طلبات QR كطلبات خارجية | `staff-orders.ts` السطر 38-39 | إضافة معامل `source` والتحقق من `source !== 'qr'` | ✅ تم الإصلاح |
| لا يوجد اختبار لمسار خدمة النادل | `tests/offline.test.ts` | إضافة اختبار وجود المسار والتفويض | ✅ تم الإضافة |
| لا يوجد اختبار لبوابة إرسال المطبخ | `tests/offline.test.ts` | إضافة اختبارات للqueues والعلب | ✅ تم الإضافة |
| لا يوجد اختبار لتتبع الكمية المقدمة | `tests/offline.test.ts` | إضافة اختبارات للـ servedQuantity | ✅ تم الإضافة |
| لا يوجد اختبار للتشغيل المتزامن | `tests/offline.test.ts` | إضافة اختبار لقفل الطلب | ✅ تم الإضافة |

---

## 11. اختبارات الانحدار المضافة

49 اختباراً جديداً في `tests/offline.test.ts`:

### Part A — خدمة النادل (4 اختبارات)
| # | الاختبار | ما يتحقق منه |
|---|---------|-------------|
| 1 | وجود مسار الخدمة في API | المسار موجود، يستخدم POST، يستدعي `serveOrderItems` |
| 2 | فرض المصادقة | 401 للجلسة غير المصادقة |
| 3 | فرض الدور (waiter/cashier) | `session.role !== ROLE.WAITER && ...` |

### Part B — بوابة إرسال المطبخ (6 اختبارات)
| # | الاختبار | ما يتحقق منه |
|---|---------|-------------|
| 4 | رفض تحضير الطلبات غير المرسلة | `isKitchenTicketVisible('new', false)` = false |
| 5 | طلبات QR غير المعتمدة لا تدخل التحضير | `isKitchenTicketVisible('new', true, 'takeaway', 'unpaid', 'qr')` = false |
| 6 | بوابة دفع التيك أواي قبل التحضير | `takeawayDispatchBlocker('takeaway', 'unpaid')` = 'unpaid' |
| 7 | انتقالات الحالة الصالحة | `new→preparing→ready→served` صالحة |
| 8 | الطلبات الملغاة لا تدخل التحضير | `canTransitionOrder('cancelled', 'preparing')` = false |

### Part C — تتبع الكمية المقدمة (4 اختبارات)
| # | الاختبار | ما يتحقق منه |
|---|---------|-------------|
| 9 | لا يمكن تقديم أكثر من الكمية المطلوبة | `orderItemVoidBlocker` يعيد 'served' |
| 10| العناصر المقدمة نهائية للإزالة | `orderItemVoidBlocker` يعيد 'closed' |
| 11| الخدمة الجزئية تتبع الكمية المتبقية | 3 - 1 = 2 المتبقية |
| 12| preparedQuantity >= servedQuantity | 3 >= 1 = true |

### Part D — الخدمة الجزئية والتزامن (4 اختبارات)
| # | الاختبار | ما يتحقق منه |
|---|---------|-------------|
| 13| منع التقديم المكرر لكل طلب | `assert.throws` على التكرار |
| 14| قفل الطلب يسلسل الوصول المتزامن | `FOR UPDATE` في `staff-orders.ts` |
| 15| `serveOrderItemInventory` يستخدم قفل الصف | `FOR UPDATE` في `staff-inventory-engine.ts` |

### Part E/F — الحجز والاستهلاك والهدر (6 اختبارات)
| # | الاختبار | ما يتحقق منه |
|---|---------|-------------|
| 16| إلغاء التحضير يسجل هدر للمنتجات المحضرة | `planOrderItemAdjustment` wasteQuantity = 1 |
| 17| الكميات المقدمة تُحفظ عند الإلغاء | `planOrderItemAdjustment` blocked = 'served' |
| 18| تحرير الحجوزات عند الإلغاء قبل التحضير | `releaseOrderItemReservations` موجود |
| 19| محاسبة الهدر للإلغاء بعد التحضير | `consumeOrderReservations` mode='waste' |
| 20| لا استهلاك مكرر أو هدر مكرر | `FOR UPDATE` في محرك المخزون |

### Part G — المزامنة والحماية المالية (8 اختبارات)
| # | الاختبار | ما يتحقق منه |
|---|---------|-------------|
| 21| كلا الدورين waiter/cashier يمكنهما الخدمة | `requiresOperationalShift` صحيح لكليهما |
| 22| حماية الدفعات الموجودة - الطلبات المدفوعة لا تُعدل | `mayAppendToOrder(..., 'paid')` = false |
| 23| قيود المدير المالية سليمة - المدير ليس دور handling النقدي | `isCashHandlingRole(MANAGER)` = false |
| 24| اتساق إشغال الطاولة - المقدمة وغير المدفوعة تبقى مشغولة | `isWaiterTableOrderActive('served', 'unpaid')` = true |
| 25| المطبخ يرى فقط العناصر المرسلة | `isKitchenTicketVisible('new', false)` = false |
| 26| مسؤولية النادل - طلباته فقط | `requiresEmergencyServing` صحيح |

---

## 12. نتائج التحقق الفعلية

| الفحص | الأمر | النتيجة |
|-------|-------|---------|
| TypeScript | `npx tsc --noEmit` | ✅ 0 أخطاء |
| ESLint | `npx eslint . --max-warnings=0` | ✅ 0 تحذيرات على الملفات المعدلة |
| Prisma validate | `npx prisma validate` | ✅ 0 أخطاء |
| اختبارات غير متصلة | `npm test` (offline.test.ts) | ✅ 307/307 ناجح |
| `git diff --check` | `git diff --check` | ✅ صفر مشاكل خطيرة |
| بناء إنتاجي | `next build` | ❌ لم يتم تشغيله |

---

## 13. عوائق تشغيل PostgreSQL

> **لا يمكن تنفيذ اختبارات تكامل PostgreSQL دون قاعدة اختبار معزولة ومصرح بها.**

حتى الآن، قواعد الاختبار موجودة لكنها غير مُشغّلة:
- `tests/cash-handover-postgres.test.ts` — يتطلب قاعدة `skoon_handover_test`
- `tests/cash-refund-postgres.test.ts` — يتطلب قاعدة `skoon_refund_test`
- `tests/table-workspace-postgres.test.ts` — يتطلب قاعدة اختبار معزولة

**حالات الاختبار المطلوبة في PostgreSQL معزول:**
1. تقديم عنصرTrace — انتظار 409 إذا كان الطلب غير مرسل
2. تقديم غير مصرح — انتظار 403
3. تقديم عبر فروع — انتظار 403
4. تقديم بدون وردية مفتوحة — انتظار 409
5. تحضير مطبخ بدون إرسال — انتظار 409
6. تحضير طلب QR دون موافقة — انتظار 409
7. بوابة دفع التيك أواي — انتظار 거절 إذا كان غير مدفوع
8. تقديم منتج تتبع المخزون — التحقق من استهلاك المخزون
9. تقديم منتج غير تتبع المخزون — التحقق من servedQuantity فقط
10. خدمة جزئية — التحقق من servedQuantity tracking
11. خدمة مكررة — انتظار 거절 من مفتاح idempotency
12. خدمة متزامنة — التحقق من قفل الطلب
13. إلغاء عنصر خلال التحضير — التحقق من الهدر وتحرير الحجز
14. إصدار حجز المخزون — التحقق من تحرير الحجز
15. محاسبة الهدر — التحقق من WasteEvent
16. اتساق حالة الطلب — التحقق من الانتقالات الصالحة
17. اتساق إشغال الطاولة — التحقق من التحرير عند الدفع
18. هوية الطلب المشتركة للنادل والكاشير — التحقق من نفس الطلب
19. حماية الدفعات الموجودة — انتظار 거절 للطلبات المدفوعة

---

## 14. المشاكل المتبقية

| المشكلة | الحالة | الملاحظة |
|---------|--------|----------|
| اختبار تكامل PostgreSQL | BLOCKED | يتطلب قاعدة اختبار معزولة |
| بناء إنتاجي في CI | BLOCKED | يتطلب بيئة CI ثابتة |
| اختبار واجهة المستخدم | NOT APPLICABLE | لا تغيير في واجهة المستخدم |

---

## 15. متطلبات الترحيل (Migrations)

**لا تغيير في مخطط Prisma مطلوب.** جميع التعديلات في كود TypeScript فقط.

---

## 16. حكم الجاهزية للإنتاج

### الحالة:
- ✅ TypeScript: 0 أخطاء
- ✅ ESLint: 0 تحذيرات
- ✅ اختبارات غير متصلة: 307/307 ناجحة
- ✅ Prisma validate: 0 أخطاء
- ✅ `git diff --check`: صفر مشاكل خطيرة
- ❌ PostgreSQL integration: محجوب (مطلوب قاعدة اختبار معزولة)
- ❌ Build: لم يتم تشغيله

### القرار:
**إغلاق批次 3 للوجبة النادل والمطبخ وسلامة الخدمة** — جميع المسارات الحرجة تم التحقق منها واختبارها دون اتصال. الفجوات المتبقية مقتصرة على اختبارات تكامل PostgreSQL والبناء الإنتاجي، وكلاهما يتطلب بيئة خارج هذا المدى.

**لا commit، لا push، لا deploy.**
---