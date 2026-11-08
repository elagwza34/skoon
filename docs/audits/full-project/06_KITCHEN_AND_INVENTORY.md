# المطبخ والمخزون
## المعمارية
`src/app/(app)/kitchen/page.tsx` → getKitchenOrders في `src/lib/staff-orders.ts:249` → KitchenBoard. Status API وitems/serve وsend تستدعي خدمات مشتركة. المخزون في staff-inventory-engine داخل معاملات الطلبات، لا تعتمد صحته على تحديث الشاشة.

## lifecycle
| الانتقال | التنفيذ |
|---|---|
| إنشاء مسودة POS | لا استهلاك فعلي |
| approved/dispatched | reserveOrderInventory |
| تحضير | markOrderPreparation يثبت الموظف والزمن |
| served | serveOrderItemInventory/consumeOrderReservations |
| إلغاء قبل التحضير | releaseOrderReservations |
| إلغاء بعد بدء التحضير | waste + EmployeeAccountability |
| served return | لا restock تلقائي؛ يحتاج إجراء مستقل |
| نفاد stock | StockError قبل تأكيد الحجز |
| concurrent stock | inventory_items FOR UPDATE، ثم batches |
الدليل: `staff-inventory-engine.ts:28/46/148/185/195/294`، `staff-orders.ts:467/743/798`.

## الوظائف المكتشفة
InventoryItem، Recipe/RecipeItem، VariantInventoryMapping، InventoryBatch، InventoryReservation، InventoryBatchAllocation، InventoryTransaction، StockCount/Line، WasteEvent/Operation، EmployeeAccountability، AccountabilityWaiver، PayrollDeduction.
APIs: /inventory/[id]/movement، /inventory/waste، /inventory/counts/[id]/[action]، /inventory/accountability/[id]/waive؛ UI InventoryBoard وStockCountBoard وWasteBoard وAccountabilityBoard. خدمات write منفصلة للحركات والجرد والهالك، مع idempotency للهالك والجرد. كلها IMPLEMENTED من الكود، وليست COMPLETE على مستوى تكامل PostgreSQL؛ الجداول المفقودة في08 تحجب بعض المسارات.

## حالة المطبخ
Incoming dispatched فقط، takeaway يلزم paid، وأزمنة prepared/served لكل line موجودة. `isKitchenTicketVisible:36` يحدد new/preparing/ready. appendOrderItems:670 يعيد ready إلى preparing للأصناف الجديدة ويحافظ على حقول القديمة. Ticket ليس جدول print-spool مستقلًا؛ notifyRole لا يعني أن الطابعة استلمت أمرًا مرة واحدة.
صوت/إشعارات/مؤقتات في KitchenBoard تحتاج Browser test؛ window.print موجود لكنه ليس ESC/POS أو خدمة طباعة صامتة. Synchronization بواسطة polling/router.refresh، لم يُكتشف اشتراك Supabase Realtime عامل لهذه الدورة.

## عيوب وصلات مؤثرة
D16: invoice add يحجز صنفًا حتى إن لم يكن الطلب dispatched، ولا يفرض تكوين المنتج كما POS. يلزم توحيد بوابة reserve ومصدر السطر.
D08/D13/D14 تعطل إدخال طلبات QR/النادل، وبالتالي مجرد صحة محرك المخزون لا تثبت اكتمال دورة المطبخ.
إغلاق وردية النادل في `staff-shifts.ts:389` يفحص new/preparing/ready فقط؛ served-but-unpaid مسؤولية مالية/تشغيلية تحتاج حسمًا صريحًا في الاختبارات.

## التزامن والأداء
orderDemand يقرأ وصفات/variant mappings، وactive reservations تُخصم من المتاح قبل allocation. صحة سلاسل الحجز والاستهلاك والإفراج تحتاج اختبارات Postgres real isolation، خاصة stock-count مقابل serve، وappend مقابل cancel. كثرة row locks قد تخلق deadlock إن اختلف ترتيب قفل أكثر من مكوّن؛ لا إثبات لحادث فعلي في هذه الجولة.
لم تُنفذ direct-write scripts أو seed. وجود أدوات import/cleanup خارج الخدمات يعد خطر صلاحيات وتشغيل وليس دليل فساد قائم.

## الاختبارات المطلوبة
آخر وحدة مخزون مع طلبين، تحضير جزئي ثم خفض كمية، تقديم جزئي ثم cancel، recipe yield/waste، variant mapping، expired batches، تكرار serve، transaction rollback كامل بعد StockError. ملفات tests/inventory-postgres.test.ts موجودة لكنها BLOCKED في هذا التدقيق.
