# تقرير اختبارات وحدة الويتر — 2026-10-24

## اختبارات محلية

- `npx prisma validate`: نجح بعد مخطط Phase 2.
- `npm run typecheck`: نجح بعد مخطط Phase 2.
- `npm test`: نجح — 98/98، دون فشل أو تخطٍ؛ أضيف اختبارا أهلية النقل وشرط التسليم الطارئ.
- `npm run lint`: نجح.
- `npm run build`: وصل إلى `Compiled successfully`، لكن الطرفية لم تُرجع سطر الإنهاء أو رمز خروج حاسمًا ضمن فترة التنفيذ؛ لا يُسجل كنتيجة نجاح نهائية.
- `git diff --check`: نجح؛ ظهرت فقط تحذيرات Windows الخاصة بتحويل LF إلى CRLF، وليست أخطاء whitespace.

## اختبارات PostgreSQL

لم تُنفذ في هذه الدورة. مخطط Phase 2 غير مطبق، وآخر محاولة موثقة لاختبارات PostgreSQL توقفت قبل إنشاء fixtures بسبب عدم الوصول محليًا إلى Supabase pooler على المنفذ 6543. لا تعد هذه الوثيقة ذلك نجاحًا أو تغطية تكاملية.

## حالات اختبار مطلوبة بعد استعادة الاتصال

1. إظهار طلب QR للفرع الصحيح فقط.
2. رفض وصول نادل من فرع آخر إلى الطلب أو طلب الخدمة.
3. شرط الوردية المفتوحة لإنشاء الطلب وإرساله وتقديمه.
4. تقديم صنف جاهز واحد مع بقاء صنف آخر قيد التحضير.
5. منع تقديم الكمية نفسها مرتين بالتوازي.
6. قبول طلب خدمة من نادل واحد ورفض claim المتزامن من نادل آخر.
7. claim متزامن لطلب QR: فائز واحد فقط، ثم اعتماد واحد فقط وحجز واحد للمخزون.
8. رفض إعادة استخدام مسؤول طلب QR أو إرساله للمطبخ قبل الاعتماد.
9. نقلان متزامنان إلى الطاولة نفسها: نجاح واحد فقط، مع رفض المدفوع والنهائي.
10. تقديم طارئ لصنف جاهز فقط مع سبب؛ منع التقديم المكرر أو قبل الجاهزية.
11. قبول تسليم المسؤوليات ثم إغلاق وردية المرسل، ورفض الإغلاق قبل القبول.
# Phase 3 local verification

- Final UI TypeScript and ESLint checks: PASS.
- Offline suite after the UI work: PASS — 98/98.
- Normal Prisma Client generation: PASS (v6.19.3).
- Production build compiled successfully but the host runner did not return a final exit marker after Next page-data collection; it is not recorded as a definitive pass.
- PostgreSQL service-request suite was attempted and failed before fixtures because the local host could not reach the configured Supabase transaction pooler. It is not a database verification result.

- `npx prisma validate`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS — 98/98 tests.
- `git diff --check`: PASS (only Git CRLF warnings).
- PostgreSQL tests: BLOCKED. Local TCP connectivity to the configured Supabase pooler is unavailable and the waiter migration is intentionally unapplied.
