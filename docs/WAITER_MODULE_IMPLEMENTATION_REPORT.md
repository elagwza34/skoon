# تقرير تنفيذ وحدة الويتر — 2026-10-24

## ما تم تنفيذه

- توسعة محطة الويتر في `src/components/waiter/waiter-board.tsx` إلى أقسام تشغيلية واضحة: الرئيسية، الطاولات، طلبات QR، الطلبات، الجاهز للتقديم، الخدمة، والوردية.
- إضافة لوحة بداية تعتمد بيانات اللقطة الفعلية للفرع: الطاولات، الطلبات النشطة، عناصر جاهزة للتقديم، طلبات QR، والتنبيه التشغيلي للطلبات الأقدم من 20 دقيقة.
- إضافة شاشة QR صريحة تعرض الطلبات ذات المصدر `qr` من نفس الفرع، وتوضح أن التحصيل يبقى للكاشير وأن تبنّي QR غير متاح بعد.
- إضافة اختيار «كل طلبات الفرع / طلباتي فقط» للطلبات التي أنشأها الويتر نفسه. أضيف `createdById` فقط إلى لقطة الويتر؛ لم يُنشأ أي حقل أو سجل جديد في قاعدة البيانات.
- إضافة قسم الوردية الذي يعرض حالة الوردية الحالية ويربط بالصفحة المصرح بها `/shifts`.
- أبقيت التقديم الجزئي للأصناف على الـAPI المعتمد `serve_items`؛ لا يُرسل العميل أسعارًا أو كميات غير متحقق منها.

## Phase 2 — تنفيذ محلي بانتظار migration

- أضيف إسقاط المسؤول الحالي `Order.responsibleWaiterId` وسجل إسناد immutable؛ لا يُعاد استخدام `createdById` للمسؤولية.
- طلب QR: استلام ذري، اعتماد يرسل للمطبخ بعد حجز المخزون، ورفض مسجل بسبب. لا تصل طلبات QR للمطبخ من واجهة الويتر قبل الاعتماد.
- إعادة الإسناد للمدير، نقل الطاولة غير المدفوعة إلى طاولة متاحة، وسجل تحويل مستقل.
- التسليم الطارئ مسموح فقط لصنف جاهز، من نادل آخر، مع سبب محفوظ في `AuditLog`.
- طلب/قبول تسليم مسؤوليات الويتر؛ إغلاق وردية الويتر محجوب حتى تنتقل أو تُغلق كل الطلبات النشطة.
- أضيفت حقول اختيارية لموضع الطاولة في مخطط الأرضية، لكن لا توجد شاشة إدارة مواضع قبل تطبيق migration وAPI مخصصين.

## ما لم يُنفذ عمدًا

- لا يوجد دمج طاولات أو تقسيم فاتورة للويتر.
- لا توجد بعد واجهة إدارية لمواضع مخطط الأرضية؛ الحقول موجودة فقط في migration المحلي غير المطبق.
- لا توجد طباعة من واجهة الويتر.

## التحقق

راجع `WAITER_MODULE_TEST_REPORT.md` للنتائج الفعلية. هذا التقرير لا يصف أي اختبار PostgreSQL على أنه ناجح قبل تنفيذ اتصال قاعدة البيانات والـfixtures المعزولة بنجاح.
# Phase 3 update (local, not deployed)

- Table transfer is available to the responsible waiter only. The UI lists only empty destination tables, requires a reason and confirmation, calls the existing atomic server operation, and refreshes the snapshot on success.
- Emergency serving is deliberately separate from normal serving. It lists only kitchen-ready quantities whose current responsible waiter is different, names that waiter, requires a reason and confirmation, and uses the existing `serve_items` authoritative path.
- `/tables` now has an Arabic RTL Grid/Floor Plan switch. The visual plan shares the same persisted occupancy calculation as the grid. Only Owner receives coordinate inputs and the authenticated layout-save API; other roles get read-only status cards.
- The layout API accepts only table IDs and bounded coordinates, looks up table identity server-side, and writes an audit event in the same transaction. It never trusts a client branch or actor ID.

- The waiter shift tab now lists incoming responsibility handovers with sender, current outstanding orders, notes, and guarded accept/reject controls. Acceptance and rejection go through authenticated APIs; rejection requires a reason and is audited.
- The workspace exposes the current responsible waiter separately from the immutable order creator. QR claiming, QR approval, table transfer, handover, and emergency serving remain server-authorized operations.
- Database activation remains blocked on the pending Supabase migration and isolated PostgreSQL verification. No migration was applied by this change.
