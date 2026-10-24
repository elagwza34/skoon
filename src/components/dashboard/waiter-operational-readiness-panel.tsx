'use client'

import { useMemo, useState } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { WaiterOperationalReadiness, WaiterResponsibilityReviewRow } from '@/lib/staff-waiter-readiness'
import { type ReconciliationDecision, validateLegacyReconciliationProposal } from '@/lib/waiter-reconciliation-policy'

const labels: Record<string, string> = {
  operational: 'تشغيلي', ambiguous: 'يحتاج قرار', historical: 'تاريخي', new: 'جديد', preparing: 'قيد التحضير',
  ready: 'جاهز', served: 'تم التقديم', cancelled: 'ملغى', paid: 'مدفوع', unpaid: 'غير مدفوع',
  qr: 'QR', waiter: 'ويتر', pos: 'نقطة البيع', open: 'وردية مفتوحة', closed: 'وردية مغلقة',
  none: 'لا توجد عناصر تشغيلية', pending_review: 'بانتظار المراجعة', preview_only: 'معاينة غير محفوظة',
}
const decisionLabels: Record<ReconciliationDecision, string> = {
  assign_waiter: 'اقتراح إسناد لويتر', keep_unassigned: 'الإبقاء بلا مسؤول',
  review_later: 'مراجعة لاحقًا', resolve_through_existing_workflow: 'الحل عبر الإجراء التشغيلي المعتمد',
}
function label(value: string | null) { return value === null ? 'لا توجد وردية مرتبطة' : labels[value.toLowerCase()] ?? value }
function tone(bucket: string): BadgeTone { return bucket === 'operational' ? 'destructive' : bucket === 'historical' ? 'success' : 'warning' }

/** Browser-only proposals. This component never fetches, approves, or mutates an order. */
export function WaiterOperationalReadinessPanel({ data }: { data: WaiterOperationalReadiness }) {
  const [bucket, setBucket] = useState('all')
  const [source, setSource] = useState('all')
  const [payment, setPayment] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decision, setDecision] = useState<ReconciliationDecision>('assign_waiter')
  const [waiterId, setWaiterId] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<Record<string, { decision: ReconciliationDecision; reason: string; waiterId: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const rows = useMemo(() => data.cases.filter((row) =>
    (bucket === 'all' || row.bucket === bucket) && (source === 'all' || row.source.toLowerCase() === source) && (payment === 'all' || row.paymentStatus.toLowerCase() === payment),
  ), [bucket, data.cases, payment, source])
  const selected = data.cases.find((row) => row.id === selectedId) ?? null

  function openRow(row: WaiterResponsibilityReviewRow) {
    setSelectedId(row.id)
    const current = preview[row.id]
    setDecision(current?.decision ?? 'assign_waiter'); setWaiterId(current?.waiterId ?? ''); setReason(current?.reason ?? ''); setError(null)
  }
  function createPreview() {
    if (!selected) return
    const result = validateLegacyReconciliationProposal({
      order: { branchId: selected.branchId, status: selected.status, paymentStatus: selected.paymentStatus, source: selected.source, responsibleWaiterId: null, updatedAt: selected.updatedAt },
      decision, reason, proposedWaiterId: waiterId || null,
      eligibleWaiters: selected.eligibleWaiters.map((waiter) => ({ ...waiter, branchId: selected.branchId, role: 'waiter', isActive: true, hasOpenShift: true })),
    })
    if (!result.ok) { setError(result.error); return }
    setPreview((current) => ({ ...current, [selected.id]: { decision, reason: reason.trim(), waiterId } })); setError(null)
  }

  return <section dir="rtl" className="space-y-3">
    <Card className={data.operational > 0 || data.ambiguous > 0 ? 'border-warning/50' : ''}><CardHeader><CardTitle>مراجعة مسؤولية طلبات الويتر القديمة</CardTitle><CardDescription>معاينات للمالك/المدير فقط: لا تحفظ أو تعتمد أو تسند ويترًا، ولا تغيّر الطلب أو السداد أو المخزون.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">{[['كل الطلبات بلا مسؤول', data.totalUnassigned, 'muted'], ['تحتاج مراجعة تشغيلية', data.operational, 'destructive'], ['تحتاج قرارًا', data.ambiguous, 'warning'], ['تاريخية/مسددة', data.historical, 'success']].map(([title, count, state]) => <div key={String(title)} className="rounded-md border p-3"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold">{count}</p><Badge tone={state as BadgeTone} className="mt-2">قراءة فقط</Badge></div>)}</div>
      <div className="grid gap-2 sm:grid-cols-3"><select aria-label="تصنيف المراجعة" value={bucket} onChange={(event) => setBucket(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">كل التصنيفات</option><option value="operational">تشغيلي</option><option value="ambiguous">يحتاج قرار</option><option value="historical">تاريخي</option></select><select aria-label="مصدر الطلب" value={source} onChange={(event) => setSource(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">كل المصادر</option><option value="qr">QR</option><option value="waiter">ويتر</option><option value="pos">نقطة البيع</option></select><select aria-label="حالة السداد" value={payment} onChange={(event) => setPayment(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">كل حالات السداد</option><option value="unpaid">غير مدفوع</option><option value="paid">مدفوع</option></select></div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد حالات تطابق عوامل التصفية.</p> : <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[960px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">الطلب</th><th className="p-3 text-start">الطاولة</th><th className="p-3 text-start">الحالة</th><th className="p-3 text-start">السداد/المصدر</th><th className="p-3 text-start">المطبخ</th><th className="p-3 text-start">المراجعة</th><th className="p-3 text-start">إجراء</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t align-top"><td className="p-3 font-medium">{row.orderNumber}</td><td className="p-3">{row.table}</td><td className="p-3"><Badge tone={tone(row.bucket)}>{label(row.status)} — {label(row.bucket)}</Badge></td><td className="p-3">{label(row.paymentStatus)}<span className="block pt-1 text-xs text-muted-foreground">{label(row.source)} · {label(row.shiftStatus)}</span></td><td className="p-3">{label(row.kitchenState)}</td><td className="p-3"><Badge tone={preview[row.id] ? 'warning' : 'muted'}>{preview[row.id] ? label('preview_only') : label('pending_review')}</Badge></td><td className="p-3"><Button variant="outline" size="sm" onClick={() => openRow(row)}>عرض المراجعة</Button></td></tr>)}</tbody></table></div>}
    </CardContent></Card>
    {selected ? <Card className="border-primary/30"><CardHeader><CardTitle>تفاصيل مراجعة {selected.orderNumber}</CardTitle><CardDescription>لقطة قرار مقترح. الاعتماد والتنفيذ غير متاحين الآن.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 text-sm sm:grid-cols-2"><p>الطاولة: <b>{selected.table}</b></p><p>المسؤول الحالي: <b>غير مسند</b></p><p>المنشئ مسجل: <b>{selected.creatorRecorded ? 'نعم' : 'لا'}</b></p><p>آخر تحديث: <b>{new Date(selected.updatedAt).toLocaleString('ar-EG')}</b></p></div>{selected.bucket === 'historical' ? <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">هذا طلب تاريخي أو مسدد؛ الحماية تمنع إنشاء اقتراح تسوية له.</p> : <><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>القرار المقترح</span><select value={decision} onChange={(event) => { setDecision(event.target.value as ReconciliationDecision); setWaiterId(''); setError(null) }} className="h-10 w-full rounded-md border bg-background px-3"><option value="assign_waiter">اقتراح إسناد لويتر</option><option value="keep_unassigned">الإبقاء بلا مسؤول</option><option value="review_later">مراجعة لاحقًا</option><option value="resolve_through_existing_workflow">الحل عبر الإجراء المعتمد</option></select></label>{decision === 'assign_waiter' ? <label className="space-y-1 text-sm"><span>ويتر مؤهل (وردية مفتوحة)</span><select value={waiterId} onChange={(event) => { setWaiterId(event.target.value); setError(null) }} className="h-10 w-full rounded-md border bg-background px-3"><option value="">اختر الويتر</option>{selected.eligibleWaiters.map((waiter) => <option key={waiter.id} value={waiter.id}>{waiter.name}</option>)}</select></label> : null}</div><label className="block space-y-1 text-sm"><span>سبب القرار (مطلوب)</span><textarea value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }} maxLength={500} className="min-h-24 w-full rounded-md border bg-background p-3" placeholder="سبب واضح للمراجعة، دون بيانات عميل حساسة" /></label>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}{preview[selected.id] ? <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">تم إعداد معاينة غير محفوظة: {decisionLabels[preview[selected.id].decision]}. لن تنشأ موافقة أو حركة أو إسناد.</p> : null}<div className="flex flex-wrap gap-2"><Button onClick={createPreview}>إعداد معاينة فقط</Button><Button variant="outline" onClick={() => setSelectedId(null)}>إغلاق</Button></div></>}</CardContent></Card> : null}
  </section>
}
