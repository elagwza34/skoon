# الواجهة والطباعة
## منهج الإثبات
هذه مراجعة static code. لا Browser automation متاح ضمن الأدوات الحالية، ولم تُنشأ جلسات موظفين لتصوير الشاشات. جميع المقاسات 320،360،375،390،430،768،1024،1280،1440 **NOT TESTED**. الصور السابقة من المستخدم أعراض وليست قبولًا بصريًا بعد التعديل.

## الواجهات
Owner/Manager عبر AppShell وnavigation، التشغيل full-screen، RTL على root/boards، shared Button/Card/Input/Segmented/Icon.
loading/error/empty states موجودة بدرجات مختلفة. لا إثبات keyboard focus trap/restore في modals اليدوية ذات role=dialog؛ aria-modal وحده لا يمنع Tab للخلفية.
خطر touch targets: ProductButton plus 24px، وبعض icon controls صغيرة؛ يلزم اختبار tablet.
D13 modal مكرر في WaiterTableWorkspace؛ D14 edit modal غير مربوط orderId؛ D15 optimistic success دون response.ok؛ QR وCashHandover/refund APIs غير موصولة بالواجهة.
الكاشير h-fit cart بدل full-height، عرض320–380px عند xl، header فوق المحتوى ولا صور في cartContents. لا نزعم ثبات مكان السلة في كل viewport دون rendering.
الشاشات الإدارية كتالوج/موظفون/HR/مخزون/إعدادات لها backend services؛ العملاء تقرير مشتق من الطلبات لا CRM CRUD مستقلًا. واجهات demo PosView/WaiterView ليست الإنتاج.

## الطباعة الحرارية
`src/components/cashier/thermal-receipt-preview.tsx:18`:80mm افتراضي و58mm بديل، عرض محتوى71.5mm/50mm. شعار public receipt-logo.png وانتظار load/error timeout؛ print timestamp حديث بتوقيت Cairo. نص عربي RTL، notes وvariants/modifiers والخصومات والتسوية من persisted invoice.
`src/app/globals.css:133`: thermal-only visibility، رفع حدود overflow والheight في print، منع اقتطاع modal، ضبط logo. `@page margin:0` لا يضبط driver paper size وحده.
window.print يفتح dialog المتصفح؛ لا ESC/POS/USB driver/print agent ولا ضمان قص ورق أو طباعة صامتة. لا مسار يضمن نسختين؛ requirement **MISSING** في التطبيق، يمكن للمستخدم اختيار copies يدويًا لكنه ليس تطبيقًا آليًا.
KitchenBoard يستخدم browser print، لا durable kitchen spool/delivery acknowledgement.

## XP80TS
لم تُختبر الطابعة فعليًا. عرض الورق، printable width، clipping يمين/يسار، font shaping، شعار، فاتورة طويلة، page break، cutter ونسختان كلها NOT TESTED على الجهاز.
اختبار قبول محدد: فاتورة60 سطرًا بأسماء عربية طويلة وvariant/modifier، خصمان وملاحظات، مقارنة القيم بصف DB، طباعة80mm بمقياس100% وهوامش driver معتمدة، ثم نسختان متطابقتان دون إعادة payment. احتفظ بعينة ورقية واعتماد موظف.
