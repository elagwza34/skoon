# التدقيق الأمني
## مؤكد
| الدرجة | النتيجة | الدليل |
|---|---|---|
| P0 | تعديل CashHandover قبل فحص الفرع/المستلم | staff-shifts.ts:604 ثم628 |
| P0 | resolve لا يتحقق من Manager والـAPI يقبل كل StaffSession | staff-shifts.ts:645، shifts/[id]/handover/route.ts:72 |
| P1 | public QR بلا rate limiter داخل التطبيق | public/orders/route.ts:12، public-orders.ts:45، middleware |
| P1 | raw error.message من كاتب QR يُعاد للعميل | public/orders/route.ts:27 |
| P1 | validation تكوين المنتج غير موحد بين invoice add وPOS | staff-invoices.ts:150 |
| P2 | leaked password protection غير مفعلة وفق live Advisor | Supabase security advisor |
| P2 | بيانات tableNumber توضع في document.write دون HTML escaping | table-qr-print-button.tsx:19 |

D01/D02 مسارات استغلال read-only مثبتة من ترتيب الكود، لم يُرسل payload عدائي للإنتاج. يستطيع موظف مسجل استدعاء endpoint بالمعرف، ولا يحمي ctx.params.id لأن التنفيذ يستعمل body.handoverId.

## نقاط قوة
getClaims/getUser والتحقق من public.users.isActive؛ owner-only employee lifecycle؛ no client role trust؛ Zod في معظم الخدمات؛ raw SQL متغيراته tagged parameters؛ soft-archive ورفض invoice delete؛ أسعار من DB لا client؛ compound idempotency keys؛ cookie refresh headers؛ env public منفصل عن service role.
لم يُثبت تسريب سر فعلي، ولم تُطبع env أو credentials. لا يُعتبر الاسم NEXT_PUBLIC_SUPABASE_ANON_KEY سر service-role.

## RLS وData API
live metadata: جداول أساسية RLS=false، لكن grants الستة المالية المفحوصة لـanon/authenticated فارغة. لا دليل من هذه الجولة على وصول عام مباشر لهذه الجداول.
Advisor:40 INFO rls_enabled_no_policy، وWARN auth_leaked_password_protection. INFO default-deny قد يكون متعمدًا لأن Prisma backend يتولى الوصول؛ أي فتح Data API لاحقًا يحتاج policies branch/role صارمة.
مراجع الإصلاح الرسمية:
- [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## مخاطر غير مثبتة أو NOT TESTED
- CSRF: Server Actions لها حماية framework، أما Route Handlers فتحتاج اختبار Origin/content-type/cookie behavior؛ لم يوجد guard مركزي Origin في middleware، ولا يثبت غيابه وحده قابلية CSRF مع SameSite وJSON.
- XSS في document.write يتطلب إمكانية حفظ tableNumber ضار وسياسة إدخال تسمح به؛ primitive غير آمن مؤكد، exploit end-to-end غير مختبر.
- rate limit قد يكون على Hostinger/CDN لكن لم يُثبت؛ داخل التطبيق غائب.
- single-active-session غير موصول ولا يبطل JWT؛ لا تعتبره حماية.
- npm audit الخارجي BLOCKED: auto-review رفض إرسال dependency metadata إلى registry. لم نتحايل عليه ولم نُحدّث حزمًا. لا نعيد استعمال أعداد ثغرات من build قديم كأنها فحص جديد.
- مراجعة keys/grants لكل الجداول وStorage وMFA وأدوار DB الفعلية للموقع لم تُستكمل؛ لا ادعاء أنها آمنة بمجرد مرور tests.
- سجل error boundary يعرض error.message في المتصفح؛ sanitization يجب أن يكون server-side لكل الأخطاء لا افتراض secret-free دائمًا.

## المطلوب
أصلح التفويض أولًا، اختبر denied-write-no-effects عبر Postgres، فعّل dependency scan بإذن تصدير بيانات الحزم، راجع grants قبل policies، اختبر abuse على staging، وفصل logging operational عن error payload العام.
