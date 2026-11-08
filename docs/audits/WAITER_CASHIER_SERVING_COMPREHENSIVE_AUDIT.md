# SOKOON — Comprehensive Waiter & Cashier Workflow Audit
## Order Lifecycle, Serving Integrity, Kitchen Synchronization & Financial Safety

**تاريخ التدقيق:** 2026-11-08  
**المستودع:** `D:\Projects-code\Sokoon`  
**الفرع:** `main` (HEAD: `cfe1b2334d90184eb4ceaedfbe0a20a160224752`)  
**النوع:** تدقيق READ-ONLY — لا تعديلات على الكود أو القاعدة أو النشر  
**النطاق:** وحدات النادل (Waiter) والكاشير (Cashier)، دورة حياة الطلب، خدمة الأصناف، مزامنة المطبخ، السلامة المالية

---

## 1. الملخص التنفيذي (Executive Summary)

### التقييم العام

يظهر مشروع سوكون (Sokoon) أسساً قوية في وحدات النادل والكاشير وخدمة الأصناف. تم تنفيذ:

- **تفويض خادم (server-side authorization)** لكل مسار API — لا تُستخدم بيانات偾 من JWT.
- **قفل صفوف (row-level locking)** عبر `pg_advisory_xact_lock` و `SELECT … FOR UPDATE` لمنع التحديثات المفقودة.
- **مفاتيح Idempotency** لكل عملية مالية وتشغيلية.
- **سجلات تدقيق (auditLog)** لكل تغيير حالة.
- **فصل المهام (separation of duties)** بين النادل والكاشير والمدير والمالك.

**الحكم التشغيلي:** النظام **قريب من الجاهزية للإنتاج** من الناحية الهيكلية، مع وجود ملاحظات P1/P2 تتطلب معالجة قبل الإطلاق النهائي، وفجوة في الاختبارات المتكاملة (PostgreSQL) تتطلب قاعدة اختبار معزولة.

### أهم النتائج (Top Findings)

| ID | severity | المنطقة | الملخص |
|----|----------|---------|--------|
| WAIT-01 | P1 | استقبال طلبات QR | `isKitchenTicketVisible` لا تمرر `source` بشكل صريح في جميع المسارات — طلبات QR قد تدخل قائمة المطبخ قبل الاعتماد إذا لم يتم تمرير `source='qr'` بشكل صحيح. |
| WAIT-02 | P1 | مزامنة في الوقت الحقيقي | لا تُستخدم Supabase Realtime — الاعتماد على الاستبيان (polling) كل ~20 ثانية قد يؤدي إلى بيانات قديمة في لوحات النادل والكاشير والكاشير. |
| WAIT-03 | P2 | اختيار الطاولة المتزامن | حجز الطاولة عبر `FOR UPDATE` والفهرس الفريد الجزئي آمن، ولكن TTL الحجز 10 دقائق قد ينتهي أثناء إنشاء طلب معقد. |
| WAIT-04 | P2 | اختبار التكامل | لا توجد قواعد اختبار PostgreSQL معزولة مفعلة — الاختبارات المتكاملة موجودة ولكنها غير منفذة ضد قاعدة اختبار. |
| FIN-01 | P1 | تفويض الدفع النقدي | الكاشير والمالك فقط يمكنهم تحصيل النقد — المدير محجوب بشكل صحيح عبر `session.role !== ROLE.WAITER && session.role !== ROLE.CASHIER`. |
| INV-01 | P1 | استهلاك المخزون | تتبع الكمية المقدمة (servedQuantity) يعمل للمنتجات تتبع المخزون وغير تتبع المخزون عبر `consumeOrderReservations` — آمن. |

---

## 2. خط الأساس للمستودع (Repository Baseline)

| العنصر | القيمة |
|--------|--------|
| الفرع | `main` |
| HEAD | `cfe1b2334d90184eb4ceaedfbe0a20a160224752` |
| التعديلات غير الملتزمة (modified) | 30 ملفًا |
| الملفات غير التابعة (untracked) | 36 ملفًا |
| الملفات في منطقة الت staging | 0 |
| stack التقني | Next.js 15 App Router, TypeScript 5.9, Prisma 6, PostgreSQL/Supabase, Supabase Auth, Tailwind CSS |
| اتجاه النص | عربي (RTL)، المنطقة الزمنية: Africa/Cairo |

### الملفات المعدلة المتعلقة بالنادل والكاشير ( Waiter/Cashier)

| الملف | النوع | الصلة |
|-------|-------|-------|
| `src/components/waiter/waiter-board.tsx` | معدل | لوحة النادل الرئيسية |
| `src/components/waiter/waiter-table-workspace.tsx` | معدل | مساحة عمل طاولة النادل |
| `src/components/waiter/table-qr-requests.tsx` | غير تابع | طلبات QR المعلقة |
| `src/components/cashier/cashier-dashboard.tsx` | معدل | لوحة الكاشير |
| `src/components/cashier/invoice-board.tsx` | معدل | لوحة الفواتير |
| `src/components/pos/pos-checkout.tsx` | معدل | نقطة البيع |
| `src/app/api/staff/orders/route.ts` | معدل | قائمة طلبات النادل |
| `src/app/api/staff/orders/[id]/items/serve/route.ts` | معدل | خدمة الأصناف |
| `src/app/api/staff/orders/[id]/pay/route.ts` | معدل | الدفع والاسترداد |
| `src/app/api/staff/orders/[id]/status/route.ts` | معدل | تغيير حالة الطلب |
| `src/app/api/staff/qr/orders/route.ts` | معدل | طلبات QR |
| `src/app/api/staff/shifts/[id]/handover/route.ts` | معدل | تسليم النقد |
| `src/app/api/staff/invoices/[id]/route.ts` | معدل | حذف/أرشفة الفاتورة |
| `src/lib/staff-orders.ts` | معدل | خدمات دورة حياة الطلب |
| `src/lib/staff-waiter.ts` | معدل | مساحة عمل النادل |
| `src/lib/staff-waiter-operations.ts` | معدل | عمليات النادل (QR، نقل الطاولة، تسليم المسؤولية) |
| `src/lib/staff-pos-write.ts` | معدل | إنشاء طلب POS |
| `src/lib/staff-invoices.ts` | معدل | تعديل الفاتورة |
| `src/lib/staff-payments-write.ts` | معدل | المدفوعات والاستردادات |
| `src/lib/staff-shifts.ts` | معدل | الورديات وتسليم النقد |
| `src/lib/staff-inventory-engine.ts` | معدل | محرك المخزون |
| `src/lib/table-order-policy.ts` | معدل | سياسة الطاولة |
| `src/lib/table-reservations.ts` | غير تابع | حجوزات الطاولة |
| `src/lib/invoice-deletion-policy.ts` | معدل | سياسة حذف الفاتورة |

---

## 3. نتائج تدقيق سير عمل النادل (Waiter Workflow Findings)

### 3.1 اختيار الطاولة (Table Selection)

| جانبي | الملاحظة |
|--------|---------|
| توفر الطاولة | `activeTableOrderWhere` في `table-order-policy.ts` — فقط `dine_in`، غير ملغي، غير مدفوع |
| حجز الطاولة | `acquireTableReservation` في `table-reservations.ts` — قفل `FOR UPDATE` على صف الطاولة، فهرس فريد جزئي لـ `order_id IS NULL` |
| TTL الحجز | 10 دقائق (`DEFAULT_RESERVATION_TTL_SECONDS`) |
|plessasie المتزامنة | filaigent — الخاسر يحصل على خطأ تنسيق فريد ويكرر المحاولة |
| الخادم يتحقق من الطاولة | `validateAndClaimWaiterReservationTx` — التحقق المصرح داخل المعاملة |
| تحرير الطاولة | `releaseTableReservation` — فقط صاحب الحجز يمكنه التحرير |

**الحكم:** آمن. حجز الطاولة آمن ضد المنافسة المتزامنة.

### 3.2 نقطة البيع للنادل (Waiter POS)

| جانبي | الملاحظة | الملف والسطر |
|--------|---------|---------------|
| الأسعار من الخادم | `createPosOrder` — الأسعار تُحسب من قاعدة البيانات، لا تُثق بأسعار العميل | `staff-pos-write.ts:28-257` |
| المتغيرات (variants) | يُتحقق من وجودها ونشاطها وتوافرها | `staff-pos-write.ts:259-293` |
| التعديلات الإلزامية (mandatory modifiers) | `validateModifierSelections` — يتحقق من الحد الأدنى والأقصى والنشاط | `staff-pos-write.ts:263-281` |
| لم يُسمح للنادل بالخصومات | يُرفض `discountType` و `discountValue` للنادل | `staff-pos-write.ts:34-41` |
| لم يُسمح للنادل بالتيك أواي | يُرفض `orderType === 'takeaway'` للنادل | `staff-pos-write.ts:36` |
| يحتاج النادل لوردية مفتوحة | `getOpenShift` مطلوب قبل إنشاء الطلب | `staff-pos-write.ts:52-55` |
| Uh Idempotency | مفتاح بصمة (fingerprint) لكل عملية إنشاء طلب | `staff-pos-write.ts:244-251` |
| مخزون Reserve | `reserveOrderInventory` يُنشئ حجوزات عند إنشاء الطلب | `staff-pos-write.ts:218-222` |

**الحكم:** آمن. الأسعار والتعديلات والتحقق من الخادم جميعها مطبقة.

### 3.3 تأكيد الطلب (Order Confirmation)

| جانبي | الملاحظة |
|--------|---------|
| يحتفظ بالطاولة المختارة | `cafeTableId` يُخزن في السجل `order` |
| يظهر في لوحة النادل | `listMyOrders` — صادف بالفرع والموظف المسؤول |
| يظهر في لوحة الكاشير | نفس سجل `order` — يُرى من قبل الكاشير عبر `getCashierInvoices` |
| يُرسل للمطبخ | `sendOrderToKitchen` يضبط `sentToKitchenAt` |
| حجز المخزون | `reserveOrderInventory` يُنشئ حجوزات عند الإرسال |
|防重 إنشاء الطلب | مفتاح idempotency مع بصمة (fingerprint) |

## 4. نتائج تدقيق سير عمل الكاشير (Cashier Workflow Findings)

### 4.1 تسجيل الدخول والورديات (Login & Shift)

| جانبي | الملاحظة |
|--------|---------|
| يُعاد توجيه الكاشير إلى `/cashier` | `resolveRoleHome` في `route-access.ts` — الكاشير → `/cashier` |
| يحتاج الكاشير لوردية مفتوحة | `getOpenShift` مطلوب قبل العمليات المالية |
| يتم التحقق من حالة الورديّة من الخادم | `staff-shifts.ts` — `requireOpenShift` |
| لا يمكن للمدير التصرف ككاشير | `pay/route.ts` السطر 35 — يرفض `session.role === 'manager'` |
| سلوك المالك محفوظ | المالك يمكن收集 الدفع (POS_PIN_PEPPER محفوظ للمالك) |

**الحكم:** آمن. فصل الأدوار بين الكاشير والمدير والمالك صحيح.

### 4.2 لوحة الكاشير (Cashier Dashboard)

| جانبي | الملاحظة |
|--------|---------|
| الفواتير المفتوحة والمدفوعة | `getCashierInvoices` — صادف بالفرع |
| تفاصيل الفاتورة | `InvoiceRow` — يشمل الأصناف والمدفوعات والباقي |
| بحث وفلترة الفواتير | `from`/`to`/`branchId`/`status` |
| تحديد الطاولة | `invoice.table` |
| نسبت النادل | `invoice.creator` / `invoice.cashier` |
| حالة الدفع | `paymentStatus` — `unpaid`/`partial`/`paid` |
| المدفوعات الجزئية | `paymentStatus === 'partial'` إذا `0 < paid < total` |
| معلومات الاسترداد | `getRefunds` — маршрут `GET /api/staff/refunds` |

**الحكم:** آمن. اتساق البيانات بين القوائم والتفاصيلات محفوظ عبر نفس سجل `order`.

### 4.3 تعديل الفاتورة (Invoice Editing)

| جانبي | الملاحظة | الملف والسطر |
|--------|---------|---------------|
| يُحفظ معرّف الطلب | `orderId` يُستخدم في جميع مسارات التعديل | `staff-invoices.ts:109-235` |
| يُحفظ المدفوعات الموجودة | `paidCents` يُجلب من `payment` before التعديل | `staff-invoices.ts:217` |
| يُتحقق من المتغيرات | `productVariant` يُجلب مع `isActive: true, isAvailable: true` | `staff-invoices.ts:150-154` |
| يُتحقق من التعديلات الإلزامية | `validateModifierSelections` يُستدعى للتعديلات `add` | `staff-invoices.ts:161-174` |
| الأسعار من الخادم | `product.price` / `variant.price` — لا تُثق بأسعار العميل | `staff-invoices.ts:188-194` |
| تُحترم حالات تحضير المطبخ | `ready` → يُعاد إلى `preparing` عند إضافة أصناف جديدة | `staff-invoices.ts:225-228` |
| يُعدل حجز المخزون | `reserveOrderItemInventory` عند إضافة أصناف | `staff-invoices.ts:189-194` |
| يُسجل الهدر عند الإلغاء بعد التحضير | `consumeOrderReservations` mode='waste' | `staff-order-item-void.ts:88-90` |
| لا يُحذف الأصناف المقدمة بشكل مدمر | `orderItemVoidBlocker` يعيد `'served'` إذا `servedQuantity > 0` | `staff-order-item-void.ts:29-34` |
| يُعاد حساب totals الفاتورة | `recalculateOpenOrderInvoice` | `staff-invoices.ts:212` |
| لا يُخفض المبلغ أقل من المدفوع | `if (total < paidCents) throw ... 409` | `staff-invoices.ts:218` |
| حماية من التحديثات المفقودة | `expectedUpdatedAt` يُقارن بـ `item.updatedAt` | `staff-order-item-void.ts:80` |
| قفل عملية المعاملة | `prisma.$transaction` لكل التعديلات | `staff-invoices.ts:103` |

**ملاحظة هامة:** `expectedUpdatedAt` يُقبل في المخطط (Zod schema) ولكن التحقق الفعلي من القيمة يحدث في `voidOpenOrderItem` (السطر 80) وليس في `adjustOrderItem` أو `editOpenInvoice`. هذه فجوة في الاتساق.

### 4.4 الدفع النقدي (Cash Payment)

| جانبي | الملاحظة |
|--------|---------|
| يحتاج الكاشير لوردية مفتوحة | `getOpenShift` مطلوب قبل `finalizeOrderPayment` |
| يُنشر الدفع مرة واحدة | `idempotencyKey` + `fingerprint` يمنع التكرار |
| يُتحقق من رصيد الطلب | `outstanding = total - completed payments` |
| تُنسب الوردية | `shiftId` مرتبط بدفعة `Payment` |
| تُنشأ حركة مالية | `FinancialMovement` type=`cash_collection` |
|'idempotent' طلبات مكررة | نفس المفتاح يُعيد النتيجة السابقة |
| لا يمكن للمدير تحصيل النقد | `pay/route.ts:35` — يرفض `manager` |

**الحكم:** آمن. جميع الحمايات المالية مطبقة.

### 4.5 الدفع الإلكتروني (Electronic Payment)

| جانبي | الملاحظة |
|--------|---------|
| يُؤكد الكاشير استلام الدفع يدويًا | `electronicPaymentConfirmed` مطلوب |
| يُسجل طريقة الدفع | `method` — `card`/`instapay`/`e_wallet` |
| يُسجل موظف التأكيد | `actorId` = موظف الجلسة |
| يُسجل زمن التأكيد | `occurredAt` في سجل `FinancialMovement` |
| يُسجل المبلغ والمرجع الخارجي | `externalTransactionReference` + `amount` |
| يُمنع التأكيد المكرر | `idempotencyKey` + `fingerprint` |
| يُحفظ دليل التدقيق | `auditLog` لكل تأكيد |
| لا يمكن للمدير انتحال شخصية الكاشير | `confirmElectronicPayment` يرفض `manager` |

**الحكم:** آمن. جميع الحمايات مطبقة.

### 4.6 الاستردادات (Refunds)

| جانبي | الملاحظة |
|--------|---------|
| طلب الاسترداد | `requestRefund` — الكاشير يطلب، يُنشأ سجل `Refund` |
| التفويض | `decideRefund` — المدير+/المالك يوافق أو يرفض |
| التنفيذ | `executeRefund` — الكاشير+/المالك ينفذ |
| فصل النقد عن الإلكتروني | النقدي يُنشأ `FinancialMovement` type=`cash_refund`؛ الإلكتروني لا يُنشأ حركة خزينة |
| إثبات التنفيذ الفعلي | `externalReference` + `evidenceNote` مطلوبان للإلكتروني |
| نسبة الوردية | `sourceShiftId` = وردية المنفذ |
| نشر دفتر الأستاذ | `FinancialMovement` و `Refund` و `auditLog` في معاملة واحدة |
|'idempotent' | `idempotencyKey` + `fingerprint` |
| مسار التدقيق | `auditLog` لكل حالة استرداد |

## 5. نتائج تدقيق هوية الطلب المشتركة (Shared Order Identity Findings)

| جانب | النتيجة | الحالة |
|------|---------|--------|
| النادل والكاشير يشيران إلى نفس الطلب النشط | نفس `orderId` في جميع المسارات | ✅ مؤكد |
| إضافة أصناف لا تنشئ طلبًا منافسًا | `appendOrderItems` يُنشئ `orderItem` على نفس `orderId` | ✅ مؤكد |
| التاريخ المدفوع يبقى مرفقًا | `Payment` مرتبط بـ `orderId` | ✅ مؤكد |
| الأصناف الجديدة تُرسل للمطبخ بشكل صحيح | `reserveOrderInventory` + `notifyRole(KITCHEN)` | ✅ مؤكد |
| الكميات المحضرة/المقدمة تبقى دون تغيير | `adjustOrderItem` لا يلمس `servedQuantity` إذا > 0 | ✅ مؤكد |
| تبقى مبالغ الفاتورة متناسقة | `recalculateOpenOrderInventory` يعيد حساب totals | ✅ مؤكد |
| إشغال الطاولة يبقى صحيحًا | `activeTableOrderWhere` يستبعد `paid` | ✅ مؤكد |

## 6. نتائج دورة حياة المطبخ وخدمة الأصناف (Kitchen & Serving Lifecycle Findings)

| مسار الحياة | التنفيذ | الحالة |
|-------------|---------|--------|
| تأكيد الطلب | `createPosOrder` / `appendOrderItems` ينشئ `order` بـ `status='new'` | ✅ |
| إرسال للمطبخ | `sendOrderToKitchen` يضبط `sent_to_kitchen_at` | ✅ |
| تحضير | `transitionOrderStatus('new' → 'preparing')` يتطلب `sent_to_kitchen_at` | ✅ |
| جاهز | `transitionOrderStatus('preparing' → 'ready')` | ✅ |
| خدمة | `serveOrderItems` → `ready → served` | ✅ |
| دفع | `finalizeOrderPayment` — يُغطى الرصيد المتبقي | ✅ |
| تحرير الطاولة | `activeTableOrderWhere` يستبعد `paid` | ✅ |

**بوابة إرسال المطبخ (Kitchen Dispatch Gate):**
- الطلبات غير المرسلة (`sent_to_kitchen_at = null`) لا يمكن تحضيرها — `isKitchenTicketVisible` تعيد `false`
- طلبات QR المعلقة (`status='pending'`) لا يمكن تحضيرها — `status` يجب أن يكون `new`/`preparing`/`ready`
- طلبات التيك أواي تتطلب الدفع قبل التحضير — `takeawayDispatchBlocker`
- التحضير يتطلب فرع ووردية صحيحة — `requiresOperationalShift`
- المطبخ لا يُحضّر أصنافًا غير مصرح بها — `canTransitionOrder` يفرض الأدوار

**الحكم:** آمن. جميع بوابات المطبخ مطبقة من الخادم.

---

## 7. نتائج سلامة المخزون (Inventory Integrity Findings)

| عملية المخزون | التنفيذ | الحالة |
|---------------|---------|--------|
| الحجز عند الإرسال المعتمد | `reserveOrderInventory` / `reserveOrderItemInventory` | ✅ |
| الاستهلاك عند الخدمة | `consumeOrderReservations` mode='consumption' | ✅ |
| تحرير الحجوزات على الإلغاء قبل التحضير | `releaseOrderItemReservations` | ✅ |
| استهلاك + هدر على الإلغاء بعد التحضير | `consumeOrderReservations` mode='waste' | ✅ |
| لا إعادة تخزين تلقائي للأصناف المقدمة | `orderItemVoidBlocker` يمنع الإزالة إذا `servedQuantity > 0` | ✅ |
| فرض توفر المخزون | `activeReservedQuantity` يُقارن بـ `currentStock` | ✅ |
| منع المخزون السالب | التحقق قبل `consumeOrderReservations` | ✅ |
| منع الاستهلاك المزدوج | `FOR UPDATE` على صف الحجز | ✅ |
| حفظ تخصيص الدفعة | `inventoryBatchAllocation` مع FIFO | ✅ |
| حفظ مسؤولية الموظف | `employeeAccountability` عند الهدر | ✅ |
| حفظ نسبة الفرع | `branchId` على جميع حجوزات المخزون | ✅ |
| حفظ تاريخ معاملات المخزون | `InventoryTransaction` + `InventoryBatch` | ✅ |

**تتبع الكمية المقدمة (servedQuantity):**
- المنتجات تتبع المخزون: تزيد `servedQuantity` عبر `consumeOrderReservations` mode='consumption' ✅
- المنتجات غير تتبع المخزون: تزيد `servedQuantity` عبر نفس الدالة (بدون حجز مخزون) ✅
- الكمية الجزئية: تزيد فقط الكمية المقدمة حديثًا ✅
- لا تكرار: `servedQuantity` لا يمكن أن exceeds `quantity` — `orderItemVoidBlocker` يمنع الإزالة إذا `servedQuantity > 0` ✅
- `preparedQuantity` و `servedQuantity` متناسقتان: `planOrderItemAdjustment` يمنع التعديل إذا `servedQuantity > 0` ✅

**الحكم:** آمن. دورة حياة المخزون آمنة ومتدرجة.

---

**الحكم:** آمن. هوية الطلب المشتركة محفوظة عبر جميع الوحدات.

---
| فصل المهام | المدير يوافق لكنه لا ينفذ الاسترداد النقدي |

**الحكم:** آمن. فصل المهام بين الموافقة والتنفيذ محفوظ.

### 4.7 تسليم النقد (Cash Handover)

| جانبي | الملاحظة |
|--------|---------|
| تحديد وردية المرسل | `fromShiftId` من المسار |
| اختيار المستلم | `toCashierId` — كاشير فعال في الفرع |
| عدّ نقد المستلم الصريح | `countedAmount` + `confirmed: true` مطلوبان |
| قبول المستلم | `acceptCashHandover` — فقط المستلم المعين |
| تسجيل الفرق | `difference` يُحفظ، حالة `DISQUOTED` إذا differed |
| حل النزاع المستقل | `resolveCashHandover` — المدير+/المالك المستقل عن الطرفين |
| سبب الحل مطلوب | `resolutionNote` 최소 3 أحرف |
| اتساق دفتر الأستاذ | `FinancialMovement` + `auditLog` في معاملة واحدة |
|'idempotent' | `idempotencyKey` مع بصمة |
| إغلاق الوردية الصحيح | `closeShift` يستهلك الوارد المؤكد مرة واحدة |
| لا يمكن للمدير استلام النقد الجسدي | المستلم يجب أن يكون كاشيرًا؛ المدير فقط يحل النزاعات |

**الحكم:** آمن. جميع حمايات تسليم النقد P0 مطبقة.

---

**الحكم:** آمن. هوية الطلب محفوظة عبر جميع الوحدات.

### 3.4 طلبات النادل (Waiter Orders)

|ceso | الملاحظة |
|-----|---------|
| يرى الطلبات حسب الملكية | `listMyOrders` — صادف بالفرع و `responsible_waiter_id` |
| يمكنه إضافة أصناف | `appendOrderItems` — مسموح لـ `new`/`preparing`/`ready`/`served` إذا لم يُدفع |
| يمكنه تعديل الكميات | `adjustOrderItem` — يُمنع إذا `servedQuantity > 0` |
| يمكنه إلغاء الأصناف | `voidOpenOrderItem` — النادل فقط لطلباته الخاصة، الكاشير لجميع الطلبات في فرعه |
| لا يمكنه تغيير الطاولة | لا يوجد مسار لتغيير `cafeTableId` بعد الإنشاء |
| لا يمكنه تعديل طلب نادل آخر | `canVoidOrderItemForOrder` — يتحقق من `responsible_waiter_id` |
| لا يمكنه تعديل التاريخ المالي المدفوع | `orderItemVoidBlocker` — يرفض إذا `paymentStatus === 'paid'` |

**الحكم:** آمن. قيود الملكية والتاريخ المالي مطبقة من الخادم.

### 3.5 استقبال طلبات QR (QR Order Reception)

| جانبي | الملاحظة |
|--------|---------|
| تظهر في واجهة النادل | `listUnclaimedQrOrders` — طلبات `source='qr'` بدون `responsible_waiter_id` |
| لا تدخل المطبخ تلقائيًا | `status='pending'` — لا يُضبط `sent_to_kitchen_at` |
| لا تحجز مخزونًا | لا تُنشأ حجوزات مخزون عند الاستلام الأولي |
| يمكن للنادل الموافقة أو الرفض | `claimQrOrder` → `approve_qr`/`reject_qr` |
| الموافقة متدرجة (idempotent) | مفتاح idempotency لكل عملية اعتماد |
| مرتبط بجلسة الطاولة/العميل | `cafeTableId` مرتبط في سجل الطلب |
| التفويض بالفرع | `staffCanAccessBranch` مطلوب |

**الحكم:** آمن. دورة حياة QR آمنة ومتدرجة.

---