# تدقيق اكتمال واجهات Skoon — 2026-10-23

هذا تدقيق للكود الحالي فقط؛ لا يفترض أن وجود صفحة يعني اكتمال سير العمل أو أن اختبارًا محليًا هو اختبار ميداني.

| الدور / الوحدة | الحالة | الأدلة الفعلية | الفجوة أو القيد |
| --- | --- | --- | --- |
| Owner — لوحة التحكم | جزئي | `src/app/(app)/dashboard/page.tsx`, `src/lib/dashboard-stats.ts`, `src/lib/manager-operations.ts` | مؤشرات المبيعات والطلبات والطاولات حقيقية؛ لا توجد واجهات مكتملة للمشتريات/الموردين/Payroll أو قوائم اعتماد مستقلة. |
| Manager — العمليات | جزئي | `manager-operations-center.tsx`, `manager-service-request-panel.tsx` | بيانات الأوامر والطاولات والتحصيل موجودة؛ طلبات الخدمة تحتاج تصفية وتفاصيل وإعادة تعيين عملية في الواجهة. لا توجد واجهات أسعار أو حدود استرداد مطبقة. |
| Cashier | جاهز تجريبيًا | `cashier-workspace.tsx`, `invoice-board.tsx`, `cashier-dashboard.tsx`, `shared-float-panel.tsx` | فواتير مفتوحة/محصلة، تحصيل، طباعة، ورديات، وعهدة مشتركة موجودة. الاسترداد يخضع لواجهة الطلبات والصلاحيات الموجودة، وليس workflow موافقات منفصلًا. |
| Waiter | جاهز تجريبيًا | `waiter-board.tsx`, `staff-waiter.ts`, `service-request-board.tsx` | خريطة طاولات، إنشاء/تعديل قبل المطبخ، متابعة، تقديم صنف، وطلبات خدمة موجودة. نقل طاولة ليس سيرًا مستقلاً ظاهرًا. |
| Kitchen | جزئي | `kitchen-board.tsx`, `api/staff/orders/[id]/status` | قائمة جديدة/تحضير/جاهز وتحديث الحالة موجودة. لا يوجد صوت، مؤقت تأخير حقيقي، تحضير صنف مستقل، أو طباعة/سجل مكتمل. |
| Service Requests QR → Waiter → Manager | جزئي، قاعدة البيانات مفعلة | `menu-order-view.tsx`, `staff-service-requests.ts`, `service-request-board.tsx` | إنشاء QR، claim ذري، تعيين وحالات موجودة. واجهة المدير مختصرة ولا تعرض فلاتر وتفاصيل وسجل وإعادة تعيين واضحة. |
| Inventory | جزئي | `inventory-board.tsx`, `waste-board.tsx`, `stock-count-board.tsx`, `accountability-board.tsx` | واجهات المخزون والنفايات والجرد موجودة؛ ترحيل الجرد مقفول عمدًا حتى تحقق PostgreSQL واعتماد التفعيل. |
| HR | محجوب جزئيًا | `employee-management-board.tsx`, `schedule-management-board.tsx` | ملفات الموظف والجدولة محلية؛ migrations الجدولة والإجازات المعلقة تمنع اعتماد قواعد البيانات. Payroll وبقية HR غير مكتملين. |
| Reports / Settings / Staff | جزئي | `reports-board.tsx`, `settings-board.tsx`, `staff-board.tsx` | تقارير وإعدادات وموظفون حقيقية ومقيدة بالصلاحيات؛ لا توجد تقارير HR/مشتريات متكاملة. |
| Navigation / access control | منفذ مع قيود | `navigation.ts`, `route-access.ts`, `(app)/layout.tsx` | الحارس server-side موجود. رابط `/fixed-float` ظاهر للـOwner حتى لو كان جزء التسويات منفصلاً؛ الوحدات غير المطبقة لا تُعرض كروابط مستقلة، وهذا أفضل من زر معطل. |

## حواجز migrations

- `20261023160000_hr_scheduling_attendance.sql`: غير مطبق؛ لا يمكن ادعاء تحقق PostgreSQL للجدولة/تصحيحات الحضور.
- `20261023161000_hr_leave_holidays.sql`: غير مطبق؛ لا يمكن ادعاء تحقق PostgreSQL للإجازات.
- Stock count posting يبقى fail-closed حتى اعتماد قاعدة البيانات والتحقق التكاملـي.

## أولويات التشغيل

1. إكمال واجهة Manager لطلبات الخدمة والتأكد من أن الحالة والمالك والتأخير مرئيون وقابلون للتصرف.
2. إبقاء Kitchen/Cashier/Waiter على بيانات فعلية مع refresh بعد كل mutation، وعدم اختراع KPIs للمشتريات أو Payroll.
3. لا تتحول حالة أي وحدة إلى «جاهزة للإنتاج» قبل اختبار browser تشغيلي بالأدوار والبيانات المعزولة.
