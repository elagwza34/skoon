# النظام المالي والتقارير
## مصادر الحقيقة
| المفهوم | المصدر |
|---|---|
| قيمة البيع/الدين | Order.total، completed Payment.amount |
| تحصيل يومي | Payment.createdAt/status، finance-metrics |
| استرداد جديد | Refund.status=COMPLETED، executedAt |
| expected till | Shift.openingCash + legacy completed cash payments - legacy refunded cash payments - operational withdrawals |
| العهدة | FinancialMovement sourceAccount/destinationAccount/status |
| سجل إعادة الطلب | FinancialOperation compound unique + fingerprint |
| مراجعة | AuditLog، status history |
| تسليم نقد | CashHandover + FinancialMovement عند قبول/حل |
D03: expected till لا يستخدم Refund الجديد. لا يجوز وصف دفتر العهدة بأنه يغطي الاستردادات تلقائيًا.

## المدفوعات
`staff-payments-write.ts:103`: role cashier+، branch scope، shift مشتركة عبر lockAndReadShift، order FOR UPDATE، حساب outstanding من completed payments، تحديث paymentStatus وسجل audit داخل transaction. يمنع double collection بعد اكتمال الدفع حتى مع مفتاح مختلف؛ retry بنفس المفتاح قبل العملية يعيد النتيجة، لكن إعادة الفحص بعد القفل ليست شاملة لكل حالات الرد المفقود.
`confirmElectronicPayment:236`: card/instapay/e_wallet وغير ذلك بحسب PAYMENT_METHODS، attestation وexternalTransactionReference. ليس تكاملًا بنكيًا ولا تحققًا تلقائيًا من وصول النقد. يلزم اختبار منع تكرار المرجع عبر دفعات مختلفة؛ لا تُعتبر idempotencyKey بديلًا عن external reference uniqueness.

## الاستردادات
request → REQUESTED؛ decide → APPROVED أو CANCELLED؛ execute → COMPLETED؛ cancel للطالب أو manager+. منع self-approval موجود. Cash يحتاج open shift؛ electronic manager+ مع evidence. لا ترابط مكتمل مع cash ledger/refund execution shift.

عيوب مؤكدة:
1. requestRefund:484 يعيد قراءة reservableBalance بلا FOR UPDATE على Payment؛ طلبان بمفتاحين مختلفين يمكن أن يحجزا أكثر من أصل الدفعة.
2. decideRefund:554 وexecuteRefund:637 يقرآن الحالة ثم update(id) دون expected-state predicate. سيناريوهات تزامن تنفيذ/إلغاء/قرار لا يردعها قفل source موحد. غياب القفل مؤكد؛ وقوع دفع مكرر فعلي لم يُختبر.
3. executeRefund:650 يختبر sufficient till من Shift.expectedCash المخزن، الذي يبدأ openingCash ولا يتحدث بعد كل Payment؛ قد يرفض استردادًا رغم تحصيلات كافية. وبعد النجاح لا يسجل deduction يُقرأ في الإغلاق.
4. AuditLog لـresolveCashHandover خارج transaction؛ نجاح النقد ثم فشل audit ممكن، D02/D17.

## CashHandover
closeShift ينشئ PENDING ثم accept يغير بشرط status=PENDING وينشئ movement داخل tx. هذا يمنع قبولين من نشر movement مرتين في ذلك المسار.
لكن dispute يكتب قبل authorization؛ resolve لا يفرض دور Manager. accept يسجل movement بالمبلغ المرسل h.amount لا countedAmount؛ variance محفوظة لكنها لا تعدّل opening cash التالية: خطر محاسبي يتطلب سياسة صريحة، لا نفترض أن تسجيل الفرق وحده تسوية.
resolve ينشئ movement ولا يربط movementId في CashHandover؛ trace ناقص مقارنة accept. لا توجد استدعاءات لهذه actions في UI، فيبقى التسليم PENDING دون دورة مكتملة من المحطة.

## Fixed Float وMain Safe
`staff-float.ts:89/105/114/134/163/226`: advance/return/settlement/baseline/operational withdrawal/reversal، fingerprints ومعاملات وlocks خاصة بالحساب. baseline يرفض legacy movements غير مسوّاة. reversal مفصول بسجل مرتبط بدل محو الحركة.
`staff-float.ts:276/325`: سحب الخزنة وتحويلها يستخدمان قفل main-safe، والتحويل يأخذ shared-float أيضًا. لا idempotency key لهذين الإجراءين: retry بعد فقد الرد قد يكرر حركة رغم كفاية الرصيد. مسألة P1 تشغيلية تحتاج معالجة واختبار.
Owner غالبًا branchId=null، وبعض عمليات Main Safe تشترط branchId؛ لا تفترض أن رقابة Owner تعني أن كل زر سحب يعمل cross-branch.

## التقارير والضرائب
- `finance-metrics.ts:204`: payments حسب createdAt وRefund COMPLETED أيضًا حسب createdAt؛ طلب استرداد يوم1 وتنفيذ يوم2 يُنسب لليوم1، D11.
- `staff-finance.ts:31`: يقرأ حتى300 دفعة و150 وردية، ويحسب summary من النافذة؛ getCashierInvoices حتى150. ليست مجاميع شاملة للفترة، D12.
- الملخص نفسه summarizePayments لا يطرح Refund الجديد، و`vat-report.ts:119` لا يقرأ Refund؛ بينما staff-reports يستخدم helper آخر يطرحه، D10.
- byMethod في staff-reports يبقى gross بينما totalRevenue يختار net؛ يلزم أعمدة gross/refunds/net متوافقة.
- `staff-finance.ts:20` يحوّل فلاتر تاريخ المستخدم إلى UTC boundaries؛ بقية التقارير تستخدم Africa/Cairo/branch timezone. فرق ساعات عند حدود اليوم.
- الضريبة المكتوبة عند POS صفر رغم إعداداتها D09؛ لا يصح اعتماد VAT report لإقرار فعلي قبل إصلاح snapshots.
- BigInt/cents في الخصومات جيد، لكن بعض rollups تستخدم Number؛ ليس إثبات فقد مال فعلي، ويحتاج حدودًا واختبارات rounding.

## اختبار مالي إلزامي قبل الاستخدام
دفع100، Refund30 من وردية أخرى، expectedCash ينخفض30 مرة واحدة، gross100/refunds30/net70، VAT proportional policy موثقة، ثم close/handover/accept/open والتطابق مع cash actual. كرر بمفتاح واحد ومفتاحين وتوازي pay/close/refund/cancel. لا اختبار مالي كتب إلى production في هذه الجولة.
