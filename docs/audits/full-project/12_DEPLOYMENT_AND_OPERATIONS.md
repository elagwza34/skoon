# النشر والتشغيل
## ما تحقق live
Hostinger website sokooncafe.com نوع nodejs. hosting_get-deployment أعاد completed لـcommit cfe1b2334d90184eb4ceaedfbe0a20a160224752، build UUID01a1a6b7-a977-7375-a3dd-8eae1700a0b1، آخر تحديث2026-11-04T13:22:08Z. Git auto deployment enabled على elagwza34/skoon/main، Node22، npm، build_script=build، output=.next.
لم ننشر أو نعيد تشغيل التطبيق. تطابق commit يثبت نسخة الكود المنشورة فقط.
أدلة الاستجابة العامة السابقة خلال الجلسة: /cashier دون جلسة يعطي307 إلى/login، وليس اختبار cashier workflow مصادق.

## الإعدادات المطلوبة
package.json: Node>=22 وnpm11.17.0؛ postinstall=prisma generate، build=next build، start=next start. Prisma Client6.19.3 external، lazy singleton `src/lib/prisma.ts:46`. DATABASE_URL للتطبيق، DIRECT_URL للمهاجرات، NEXT_PUBLIC_SUPABASE_URL/ANON_KEY، SUPABASE_SERVICE_ROLE_KEY للـprovisioning، CRON_SECRET validator غير مستخدم حاليًا. NEXT_PUBLIC values تتجمد في client bundle عند build.
لا قيم env في التقارير. لم نفحص connection pool settings الفعلية على Hostinger، لذلك pooling/max connections **NOT VERIFIED**.

## مخاطر
- Prisma/Supabase histories منفصلان وآثار schema تُطبّق خارج التاريخ المحلي؛ automated deploy قد يمر build ثم يفشل API عند أول query.
- npm prisma:migrate:deploy ممنوع عبر guard، لكن staging:migrate فعلي mutation؛ لا تُشغَّل كجزء audit.
- refresh5s للكاشير والنادل مع استعلامات متعددة لكل page؛ load test وpool saturation غير مختبرين.
- error boundary network reload تحسين recovery، لا إثبات أصل network failure. يلزم browser request ID/stack ومقارنته runtime logs.
- request-correlation موجود، middleware logs محدودة بلا tokens؛ لا منصة error monitoring/alerting مثبتة من repo.
- backups scripts ووثائق موجودة، لكن restore حديث للـHEAD الحالي لم ينفذ. لا تعتمد على تقرير قديم كدليل قبول.
- التشغيل لا يظهر cron workers نشطة أو durable job queue. CRON_SECRET موجود كتعريف بلا route schedule مستهلك.
- ترقيع DB باليد ثم push يترك قابلية إعادة البناء والrollback ضعيفة. Git rollback وحده لا يعكس DB migration.

## بوابات التشغيل
اعتماد schema baseline، staging منفصل، read-only health+DB schema checks، اختبار نسخ احتياطي/استعادة خارج production، rollback للكود مع compatibility للـDB، مراقبة payment/refund discrepancies وpool timeouts.
بيانات RPO/RTO والنسخ المؤتمتة وخطة فشل الإنترنت واستعادة نقطة زمنية **NOT VERIFIED**. لا توجد تواريخ إنجاز مفترضة.
