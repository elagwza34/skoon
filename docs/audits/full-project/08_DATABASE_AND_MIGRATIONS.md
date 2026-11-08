# قاعدة البيانات والترحيلات
## المخطط المحلي
Prisma PostgreSQL، `schema.prisma:16` DATABASE_URL وdirectUrl DIRECT_URL. 78 model تغطي المجالات التشغيلية والمالية وHR. الأموال Decimal مع snapshots للأسعار/variants/options، علاقات واضحة وسجلات تاريخ؛ بعض business states String لا enum/check موحد.
25 Prisma migrations directories، و13 Supabase SQL، وملف منفرد `prisma/migrations/20261101000000_waiter_table_reservations.sql:1`.

## تحقق live للقراءة فقط
المشروع المسمى skoon، PostgreSQL17.11، بتاريخ التدقيق. metadata فقط دون تعديل. ربطه بالنشر يستند لاسم المشروع وسياق المستودع؛ قيم env الإنتاج لم تُقرأ لمقارنة connection string، ولذلك لا نزعم إثبات تطابق endpoint سرّي بين الاثنين.
- unique index orders_one_open_order_per_table_idx مطبق وفق predicate مفصل بالتقرير05. duplicate groups=0.
- duplicate open shift groups=0، لكن لا يظهر partial unique index للوردية في pg_indexes؛ advisory lock محلي موجود.
- waiter_table_reservations وwaiter_order_reconciliation_reviews وuser_sessions: to_regclass=NULL.
- قائمة public tables لا تظهر stock_counts/stock_count_lines/waste_operations؛ يلزم تسوية المخطط قبل تفعيل تلك APIs.
- refunds وcash_handovers وproduct_option_assignments موجودة رغم غياب تسجيل ترحيلاتها المحلية من _prisma_migrations: وجود الجداول لا يعني سجل migration مكتمل.
- قراءات table_privileges للـanon/authenticated على users/payments/orders/financial_movements/audit_logs/app_settings أعادت صفر صف؛ RLS=false لا يثبت وحده إتاحة البيانات للعامة.

## تاريخان غير متطابقين
_prisma_migrations: 20 ترحيلًا ناجحًا حتى 20261028180000، مع محاولة username rolled_back تلتها ناجحة.
5 directories محلية بلا سجل نجاح مطابق:
1. 20261028190000_add_missing_waiter_operational_tables
2. 20261029000000_add_waiter_table_transfers
3. 20261029130000_reusable_product_modifier_groups
4. 20261102000000_add_refunds_and_payment_confirmation
5. 20261102010000_add_cash_handovers

هذا **pending في السجل** وليس تصريحًا لتنفيذها؛ بعض آثارها موجودة بالفعل وقد يسبب deploy مباشر تعارض CREATE TABLE.
Supabase history يحتوي7 إدخالات، منها inventory وstock_counts وHR وservice requests وwaiter responsibility. لا يكفي اسم migration لإثبات أثر كل جدول اليوم. المخطط الفعلي هو الحكم.
ملف الحجوزات المنفرد لا يتبع directory/migration.sql؛ Prisma migrate deploy لا يسجله تلقائيًا كترحيل عادي. لا يحق اعتبار وجوده دعمًا جاهزًا.

## RLS والقيود
عدد كبير من جداول الأساس RLS=false، بينما40 جدولًا RLS=true بلا policies بحسب Advisors. عدم policies يعني default deny لأدوار RLS العادية وليس تسربًا بحد ذاته؛ Prisma ذو امتيازات bypass يحتاج تفويض التطبيق الكامل.
قيود FK/unique موجودة بالمخطط، لكن cross-branch invariants ليست كلها composite FKs؛ branch checks تبقى على الخدمات. partial unique للطاولة موجود live بلا SQL قابل لإعادة البناء داخل migration history المحلي.
SQL الحجوزات يشير إلى cafe_branches بينما النموذج CafeBranch mapped إلى branches؛ يجب تصحيحه ومراجعته في بيئة منفصلة قبل أي تشغيل، لا يكفي تحريكه إلى directory.

## خطة تسوية آمنة، دون تنفيذ
schema-only dump/metadata diff على staging، توثيق checksums لكل migration وتاريخ Prisma/Supabase، mapping الأثر الموجود إلى baseline معتمد، إضافة قيود ناقصة backfill-safe، ثم restore لنسخة خالية وإعادة تشغيل الترحيلات والاختبارات. افحص تكرارات الطاولات/الورديات والـFK قبل أي unique index.
لا migration، resolve، db push، seed أو backfill تم تشغيله. Prisma validate يفحص syntax/schema لا drift ولا applied state.
