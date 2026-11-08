# الأدوار والصلاحيات
## مصدر الهوية والتفويض
`src/middleware.ts:86` يتحقق من JWT عبر getClaims، و`src/lib/session.ts:30` يعيد التحقق getUser ثم يقرأ المستخدم الفعال ودوره وصلاحياته من DB، لا من user_metadata. `src/lib/route-access.ts:120` يحمي الصفحات، و`src/app/(app)/layout.tsx:79` يراجع المسار على السيرفر. API يفحص session ثم تعتمد أغلب الخدمات على role ثابت وليس permission slug؛ تغيير RolePermission لا يغيّر كل عمليات الكتابة.

## المصفوفة
| العملية | Owner | Manager | Cashier | Waiter | Kitchen |
|---|---|---|---|---|---|
| Home | /owner | /manager | /cashier | /waiter | /kitchen |
| الفروع | متعدد | فرعه | فرعه | فرعه | فرعه |
| وردية التشغيل | معفى | مطلوبة للعمليات | مطلوبة | مطلوبة | مطلوبة |
| POS وإنشاء طلب | مسار خدمة، إشراف بالواجهة | نعم مع وردية | نعم | dine_in بلا خصم | محظور |
| الدفع | نعم بالخدمة | نعم مع وردية | نعم مع وردية | محظور | محظور |
| Refund request | نعم | نعم | نعم | محظور | محظور |
| Refund decision | نعم دون اعتماد طلبه | نعم دون اعتماد طلبه | لا | لا | لا |
| Refund execute | إلكتروني بإثبات؛ النقد يتطلب وردية لا يفتحها Owner | إلكتروني/نقد حسب الشروط | نقد | لا | لا |
| موظفون وإنشاء حساب وتفعيل/أرشفة | نعم | قراءة/إشراف حسب HR gate | لا | لا | لا |
| تعديل المنتجات | نعم | نعم | نعم صراحةً | لا | لا |
| مخزون | نعم | حسب gate | لا لعمليات الإدارة | لا | قراءة بحسب صلاحيات الصفحة |
| QR claim/approve/reject | لا، رقابة فقط | لا | لا | نعم، API موجود والواجهة مفصولة | لا |
| خدمة طلب مسؤول | رقابة | إسناد/تحويل حسب الخدمة | تعديل مسموح | المسؤول، أو emergency reason للتقديم | تحضير |
| /finance | نعم | محظور | محظور | محظور | محظور |
| Main Safe | خدمة manager+ تتطلب فرعًا | نعم | لا | لا | لا |
| قبول CashHandover | المستلم بفرع صريح | المستلم | المستلم | يحتاج منع صريح حسب الدور | يحتاج منع صريح حسب الدور |
| حل نزاع CashHandover الحالي | يفشل مع branchId=null | نعم | **نعم خطأً** | **نعم خطأً** | **نعم خطأً** |

الدليل: `authz.ts:31` و`staff-pos-write.ts:26` و`staff-payments-write.ts:103` و`staff-provision-write.ts:152` و`staff-catalog-write.ts:59` و`staff-shifts.ts:645`، كلها تحت src/lib.

## تحقق من الصلاحيات الفعلية
تمت قراءة roles وrole_permission في DB، دون بيانات مستخدمين. Cashier لديه orders.payment/refund/cancel/update/view وtables.view؛ Waiter لديه orders.cancel/serve/update/view وtables.view؛ Kitchen لديه inventory.view وorders.kitchen_status وorders.view؛ Manager لديه الإدارة التشغيلية، وOwner يمتلك المجموعة الكاملة. مع ذلك role gates تتجاوز بعض slugs: Cashier يعدل المنتجات رغم عدم menu.update، وهذا قرار حالي صريح، لا يُصنف تصعيدًا دون سياسة مخالفة معتمدة.

## نتائج العزل
- جيد: هوية UUID موثوقة، المستخدم غير الفعال لا يصبح StaffSession، معاملات مالية كثيرة تعيد فحص branchId.
- مؤكد: D01 وD02 يخرقان تفويض CashHandover حتى لو أعاد endpoint HTTP 403 في مسار النزاع.
- فجوة: canAccessBranch(null, target) يعني وصولًا عامًا في helper نقي؛ الاستخدام الآمن يتطلب أن null يخص Owner فقط. staffCanAccessBranch والخدمات هي الدليل الفعلي، لا هذه الدالة وحدها.
- صفحة الكاشير تستدعي getWaiterWorkspace؛ ترشيح responsibleWaiterId=session.id يُسقط طلبات النُدُل من openOrders الممررة للكاشير، D06.
- تسجيل username يحوَّل إلى هوية email داخلية في staff-username؛ لا يوجد إثبات Login runtime لكل دور في هذه الجولة.
- Single active session مجرد مكتبة غير مستدعاة من login/session: لا يجوز اعتبارها منعًا فعليًا لجلسات متعددة.
- شاشات الموبايل لكل دور: NOT TESTED فعليًا. لا يُستنتج أمان API من إخفاء navigation.

## فحص Owner وManager والإدارة
| الوظيفة | مسار الربط الفعلي | النتيجة وحدودها |
|---|---|---|
| Dashboard | `src/app/(app)/admin-home.tsx:1` → dashboard-stats وmanager-operations ثم مكونات dashboard | IMPLEMENTED؛ لا قبول متصفح؛ مؤشرات Manager لها predicates وتواريخ تختلف عن قواعد الإشغال والتدفقات |
| الفروع | `src/app/api/staff/branches/route.ts:12` GET، وbranches/bootstrap | قائمة فروع فعالة وتهيئة أولية؛ ليس CRUD شاملًا لدورة حياة الفروع |
| الموظفون | `/staff` → StaffBoard → EmployeeManagementBoard → employees/users APIs | واجهة وخدمات موجودة، مع lifecycle Owner-only؛ تسعة اختبارات provisioning بمزيفات وليست Auth live |
| العقود والتعويضات | `staff-employee-write.ts:334` و354؛ employee-management-board | Owner-only؛ snapshots وتاريخ معدلات موجودان؛ payroll integration غير منفذ في الجولة |
| الجداول والحضور والإجازات | staff-scheduling-write، staff-attendance-summary، staff-leave-write، attendance-corrections-board | Manager/Owner scheduling، قرار تصحيح الحضور Owner؛ time calculation له unit tests؛ PostgreSQL BLOCKED |
| Payroll والزيادات والسلف | `staff-payroll-write.ts:46`، `staff-hr-financial-write.ts:18` | تتطلب عقودًا ومعدلات وجدولًا فعالًا، وتمنع حسابًا آليًا مع سلفة دون خطة سداد؛ PARTIAL تشغيليًا حتى قبول التكامل المالي |
| مستندات الموظفين | `staff-hr-documents.ts:18` upload و51 signed URL | Backend وUI موجودان؛ لم يُرفع ملف ولم تُفحص bucket policy live، لذلك Storage security غير متحقق |
| الإعدادات | settings/page → SettingsBoard → `/api/staff/settings` → staff-settings-write | مفاتيح allowlist وتدقيق؛ حفظ tax settings غير مربوط بإنشاء POS، D09 |
| العملاء | `src/app/(app)/customers/page.tsx:15` → staff-customers | قائمة مشتقة من الطلبات، لا Customer model أو CRM CRUD مستقل |
| الرقابة المالية | `/finance` Owner-only، وMain Safe API manager+ وفق الخدمة | وجود الخدمات لا يثبت أن كل زر ينجح مع Owner.branchId=null؛ راجع07 |
| Audit logs | كتابات AuditLog داخل خدمات متعددة | لا يوجد route `/audit` مستقل في الجرد؛ بعض audit خارج transaction، D17 |
| طلبات الخدمة | `staff-service-requests.ts:18/41/49`، ManagerServiceRequestPanel | خدمة عامة لها dedup lock وحدود complaints؛ تختلف عن Public QR orders التي بلا rate limiter؛ claim شرطي وmonitor read-only حسب الدور |

لا تُعتبر أزرار الإدارة أو HR عاملة بالكامل بمجرد وجود fetch. لم يُختبر كل form على المتصفح؛ حالات العقود والرواتب والمستندات تحتاج staging منفصلًا. المكتبات غير المرتبطة بالمسارات موثقة بالتقرير01.

## اختبارات القبول المطلوبة
جميع role×operation، فرع آخر، مستخدم غير فعال، جلسة منتهية، وردية مغلقة، ID مجهول. تحقق أن الرفض لا يكتب أي صف أو AuditLog نجاح. Home/401/403 واختبار direct URL ضمن Browser E2E منفصل عن unit tests.
