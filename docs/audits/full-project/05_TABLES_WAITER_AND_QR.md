# الطاولات والنادل وQR
## مسارات الطاولات
`src/lib/staff-tables.ts:20` لشاشة الإدارة، `staff-pos.ts:105` لكتالوج POS، `staff-waiter.ts:141` للنادل ولـopenOrders بالكاشير. صفحات التفاصيل `src/app/(app)/{waiter,cashier}/tables/[tableId]/page.tsx` تشترك في WaiterTableWorkspace.

## مقارنة القواعد المعتمدة
| القاعدة | النتيجة الحالية |
|---|---|
| available/occupied فقط | موجودة بالخدمات الرئيسية؛ demo WaiterView يحوي cleaning لكنه غير متصل |
| occupancy=open dine_in | BROKEN: تعدد predicates وإغفال orderType في queries |
| طلب مفتوح واحد | قيد DB موجود فعليًا، لا مجرد SQL مقترح |
| available يفتح POS | IMPLEMENTED في تنقل الجدول |
| occupied يفتح Current Order | PARTIAL؛ ملكية النتائج تسقط طلبات الآخرين |
| Cashier وWaiter نفس الطلب | append API مشترك، تحميل الكاشير ناقص D06 |
| append لا ينشئ طلبًا آخر | appendOrderItems يعدل نفس orderId ويقفل صفه |
| served unpaid وpartial تبقى occupied | DB صحيح، staff-tables وstaff-pos غير صحيحين D05 |
| paid/cancelled تحرر | DB صحيح؛ staff-tables قد يعرض paid/new مشغولًا |
| takeaway لا يشغل | DB يستبعده، queries الواجهات قد تحسبه بسبب anchor FK |
| pending QR لا يشغل | DB يستبعده، createPublicOrder يعده occupied D07 |

## إثبات قاعدة البيانات
في مشروع skoon، metadata: `orders_one_open_order_per_table_idx` UNIQUE (branch_id,cafe_table_id) WHERE status NOT IN ('cancelled','pending') AND payment_status<>'paid' AND order_type='dine_in'. count لمجموعات التكرار وفق هذا predicate =0 عند الفحص. هذا لا يثبت كل query في UI.
لا يوجد SQL محلي مطابق لهذا الفهرس في migrations؛ توجد فجوة قابلية إعادة بناء القاعدة. createPosOrder:182 يفحص داخل transaction دون table-wide row/advisory lock، لذلك طلبان بمفاتيح مختلفة قد يمران بالفحص ثم يرفض DB أحدهما. لا نصف ذلك بتكرار ملتزم طالما القيد قائم؛ مطلوب تحويل unique conflict إلى 409 مفهوم.
مسار reservation يتجاوز occupied check، لكن القيد يمنع duplicate nonpending. جدول waiter_table_reservations غير موجود في DB المقروءة، وملفه SQL منفرد خارج شكل Prisma migration directories.

## دورة QR
Public menu: `public-menu.ts:75` → `public-orders.ts:45` → POST /api/public/orders. الكاتب يقرأ سعر المنتج من DB ويكتب pending، ثم notifyRole. لا يحجز stock في submission، وهذا متوافق.
Claim/approve/reject: `staff-waiter-operations.ts:53/80/232` و`orders/[id]/waiter/route.ts:26`.
Approval على طاولة بها طلب ينسخ الأصناف ويحتفظ بـqrApprovedAt ويلغي الطلب المعلق مع سبب merge؛ يمكن التفريق عن الرفض بـqrRejectedAt، لكن لا توجد علاقة target-order صريحة خارج audit metadata.

| القاعدة المطلوبة | التقييم |
|---|---|
| submit على available أو occupied | BROKEN: occupied يرفض فورًا |
| pending لا يشغل | DB نعم، submission التالي يرفضه |
| انتظار موافقة النادل | backend نعم؛ UI لا تعرض unclaimed وتخلو من claim/approve/reject |
| approval occupied يدمج | IMPLEMENTED لكن merge يقرأ هدفًا دون locking/epoch |
| approval available ينشئ أول طلب | نفس pending order يتحول new مع reserve |
| تكرار approval لا يكرر الأصناف | source row FOR UPDATE؛ retry بعد النجاح يرجع 409 قبل prior-result lookup، لا idempotent success |
| accepted متميز عن rejected | timestamps منفصلة، status وحده لا يكفي |
| إعادة استخدام الطاولة | MISSING epoch/session binding؛ pending قديم قابل للاعتماد بعد تغير العملاء |

## عيوب النادل
- `staff-waiter.ts:254` يرشح responsibleWaiterId=session.id؛ occupancy الخاص بالنادل لا يعكس بقية العاملين. اختيار all في UI لا يمكنه إظهار بيانات لم يحمّلها السيرفر.
- `waiter-board.tsx:446` تبويب QR يستعمل scopedOrders من بيانات تستبعد pending ولا يجلب /api/staff/qr/orders.
- `waiter-board.tsx:207` وأفعال الحالة/الإلغاء لا تفحص response.ok؛ يمكن عرض نجاح رغم 403/409.
- edit modal ينشئ PosCheckout دون orderId؛ قد يحاول إنشاء order بدل تحرير الطلب، فيرفضه قيد الطاولة، D14.
- `waiter-table-workspace.tsx:387` و389 يرسمان AddProductModal مرتين؛ اختيار variant يفتح modal عام دون تهيئة product، D13.
- أصناف pending تُجمع حسب productId، فيؤثر increment على أكثر من variant لنفس المنتج في choose.
- إلغاء الطلب مستبعد من active ويظل في السجل، لكن served/pay lifecycle يجب إصلاح عرضه دون إلغاء التاريخ.

## مخاطر تحتاج اختبارًا
عيوب إضافية مؤكدة: D23 أفعال الحالة ترسل `{status: to}` بينما الـAPI يطلب `{to}`، لذلك ترفض400. D24 زر نقل المسؤولية يغيّر transferDialog دون render لحوار أو طلب API. D25 القائمة العامة وطلب QR لا يدعمان variants/modifiers أصلًا، على خلاف POS؛ تفاصيل إعادة الإنتاج في13.

Merge يقفل source QR لا target/table؛ concurrent payment/append أو اعتماد مصدرين قد يختار target pending آخر لأن filter لا يستبعد pending. داخل merge توجد قراءة prisma.product خارج tx ولا validation modifiers مثل canonical append. هذه مخاطر قابلة لإعادة الإنتاج على staging؛ لم تُجرَ معاملات اختبار على production.
القبول المطلوب: 9 قواعد QR أعلاه، source/target locking، table epoch، صنف variants/modifiers، stock shortage، rejection history، approve مرتين، وموافقة متزامنة مع الدفع.
