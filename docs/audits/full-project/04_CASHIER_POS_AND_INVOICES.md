# الكاشير وPOS والفواتير
## مسار التنفيذ
`src/app/(app)/cashier/page.tsx:15` → requirePageAccess ثم getShiftsBoard/getCashierInvoices/getPosCatalog/getSharedFloatSummary/getWaiterWorkspace بالتوازي → CashierWorkspace → PosCheckout وInvoiceBoard وTablesSidebar.
`src/app/api/staff/pos/orders/route.ts` → createPosOrder. `src/app/api/staff/orders/[id]/items/append/route.ts` → appendOrderItems. `src/app/api/staff/invoices/[id]/route.ts` → editOpenInvoice/delete-policy. الدفع عبر `orders/[id]/pay`.

## ما هو منفذ
| المجال | النتيجة | الدليل |
|---|---|---|
| وردية مطلوبة | IMPLEMENTED؛ يعاد فحصها في خدمات حرجة | staff-pos-write:49، staff-payments-write:130 |
| البحث/الأقسام/الكتالوج | IMPLEMENTED | pos-checkout:568، staff-pos:62 |
| variants/modifiers | IMPLEMENTED في POS؛ snapshots تاريخية | staff-pos-write:107، order-item-options، order-item-variant |
| السلة وحفظ المسودة | IMPLEMENTED؛ user+branch scope | pos-draft، pos-checkout:117 |
| الخصومات | حساب cents/BigInt؛ النادل محظور | invoice-discounts، staff-pos-write:32 |
| تعديل الفاتورة | branch+shift+order row lock؛ paid ممنوع | staff-invoices:109 |
| تعديل كمية/إلغاء صنف | خدمات canonical مع inventory lifecycle | staff-order-item-adjustment، staff-order-item-void |
| الدفع النقدي | يسدد كامل outstanding، الباقي change | staff-payments-write:149 |
| الدفع الإلكتروني | تأكيد يدوي ومرجع، ليس gateway settlement | staff-payments-write:236 |
| الجزئي | قراءة legacy متاحة؛ كاتب التحصيل الحالي كامل | staff-payments-write:168 |
| حذف مالي نهائي | مرفوض عبر invoice-deletion-policy وDELETE | staff-invoices وtests/offline |
| Refund | backend lifecycle منفذ؛ UI غير موصول | staff-payments-write:443، غياب استدعاءات refund_* من components |
| الطباعة | preview/browser، hardware غير مختبر | thermal-receipt-preview |
| إغلاق وردية | counts+expected+handover | staff-shifts:362 |

## عيوب حسابية وتكاملية
D09: tax_rate/tax_enabled في `staff-settings-write.ts:38` لا يقرأهما createPosOrder؛ `staff-pos-write.ts:212` يكتب taxAmount='0' ولا snapshot فعلي للضريبة من إعدادات الفرع. وجود tax recalculation في تعديل الفاتورة لا يصلح الإنشاء.
D03: Refund COMPLETED لا يخفض expectedCash. D06: openOrders الكاشير تأتي من workspace يرشح طلباته هو لا كل النُدُل.
D16: مسار invoice add في `staff-invoices.ts:150` يسمح منتجًا بلا variant إذا لم يرسل variantId، ولا ينفذ validation مجموعات modifiers المطلوبة كما يفعل POS؛ يسمح بذلك بإنشاء سطر ناقص التكوين عبر API.
`getCashierInvoices:60` محدود بـ150؛ lookup بعد الدفع يبحث داخل هذه النافذة، ففاتورة قديمة مدفوعة يمكن أن تنجح كتابتها ثم تُرجع API 503 لأنها لم تعد ضمن أحدث 150. هذا ليس فشل تحصيل قابلًا لإعادة الكتابة بمفتاح جديد.

## مطابقة التصميم المعتمد
| الشرط | نتيجة القراءة |
|---|---|
| السلة يسارًا في RTL | ترتيب grid يرجّح ذلك؛ NOT TESTED rendering |
| نحو ثلث العرض | عمود 320–380px عند xl، لا نسبة ثابتة |
| full-height | **غير مطابق**: Card h-fit sticky، pos-checkout:601 |
| header أعلى المحتوى | موجود في CashierWorkspace |
| لا صور داخل السلة | لا Image في cartContents |
| mobile | ترتيب عمودي وmodals responsive في CSS، NOT TESTED |

## مخاطر التشغيل
التحديث كل 5 ثوانٍ صار يتجنب offline/hidden/pending؛ لا يثبت هذا أصل network error السابق ولا يحمي كل async action. InvoiceBoard يستخدم startTransition(async...) لبعض الكتابات دون catch محلي شامل، ويولّد مفاتيح جديدة في محاولات مالية؛ يلزم اختبار ضياع response بعد commit.
اختبارات مطلوبة: variant مطلوب، modifier مطلوب، paid/partial invoice، تسوية قديمة خارج 150، كسور الخصم والضريبة، تعارض دفع/تعديل، إرسال takeaway بعد الدفع، refresh مع مسودة، وطباعة متكررة دون دفعة ثانية.
