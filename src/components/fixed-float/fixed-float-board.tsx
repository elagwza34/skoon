'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'
import type { FixedFloatBoard } from '@/lib/staff-float'

export function FixedFloatBoard({ board }: { board: FixedFloatBoard }) {
  const router = useRouter()
  const [, transition] = useTransition()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [baselineAmount, setBaselineAmount] = useState('0')
  const [baselineReason, setBaselineReason] = useState('جرد وتأسيس خط أساس العهدة الثابتة')
  const [baselineConfirmed, setBaselineConfirmed] = useState(false)
  const [reconcileFromNow, setReconcileFromNow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdentity = useRef({ fingerprint: '', key: '' })

  async function post(direction: 'addition' | 'withdrawal') {
    const fingerprint = JSON.stringify({ direction, amount, reason })
    if (requestIdentity.current.fingerprint !== fingerprint || !requestIdentity.current.key) {
      requestIdentity.current = { fingerprint, key: crypto.randomUUID() }
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/staff/fixed-float', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: requestIdentity.current.key, direction, amount: Number(amount), reason, branchId: Number(board.branchId) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذر تسجيل الحركة')
      requestIdentity.current = { fingerprint: '', key: '' }
      setAmount('')
      setReason('')
      transition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تسجيل الحركة')
    } finally {
      setBusy(false)
    }
  }

  async function establishBaseline() {
    if (!baselineConfirmed) { setError('يجب تأكيد الجرد الفعلي للنقد قبل تأسيس خط الأساس'); return }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/staff/fixed-float', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'baseline',
          amount: Number(baselineAmount),
          reason: baselineReason.trim(),
          confirmed: true,
          reconcileFromNow,
          branchId: Number(board.branchId),
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذر تأسيس خط الأساس')
      setBaselineConfirmed(false)
      setReconcileFromNow(false)
      transition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تأسيس خط الأساس')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {board.requiresReconciliation ? (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader><CardTitle>العهدة تحتاج تسوية/تأسيس خط أساس</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>لا يمكن تنفيذ سحب من العهدة الثابتة قبل وجود <b>خط أساس موثق</b> للفرع. السبب الشائع للخطأ <code>Insufficient reconciled fixed-float balance</code> هو غياب سجل <code>fixed_float_baseline</code> (أو وجود مرتجعات غير مرتبطة بسلفة أصلية/حركات تاريخية تتطلب تسوية يدوية).</p>
            <p>إن لم توجد حركات عهدة تاريخية للفرع، يمكن للمالك تأسيس خط الأساس بعد جرد النقد الفعلي. إن كانت هناك حركات تاريخية، يلزم تسوية يدوية معتمدة قبل التأسيس.</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm"><span className="mb-1 block">مبلغ النقد الفعلي الآن (الرصيد الابتدائي)</span><Input className="w-40" inputMode="decimal" value={baselineAmount} onChange={(e) => setBaselineAmount(e.target.value)} /></label>
              <label className="min-w-64 flex-1 text-sm"><span className="mb-1 block">سبب/مرجع الجرد</span><Input value={baselineReason} onChange={(e) => setBaselineReason(e.target.value)} /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={baselineConfirmed} onChange={(e) => setBaselineConfirmed(e.target.checked)} />تم تأكيد عدّ النقد الفعلي</label>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={reconcileFromNow} onChange={(e) => setReconcileFromNow(e.target.checked)} />تسوية وبدء من الآن (تجاهل أثر السجل السابق)</label>
              <Button disabled={busy} onClick={() => void establishBaseline()}>اعتماد الرصيد والبدء من الآن</Button>
            </div>
            {reconcileFromNow ? <p className="text-xs text-muted-foreground">سيُنشئ النظام حركة تسوية تُصفّر الأثر المحاسبي للسجل السابق ثم يعتمد مبلغ الجرد كخط أساس/رصيد متاح من الآن. سجلات الحركات السابقة تبقى محفوظة للمراجعة.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardHeader><CardTitle>الرصيد/الميزان</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatCurrency(Number(board.balance))}</CardContent></Card>
        <Card><CardHeader><CardTitle>المتاح للسحب/السلف</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(Number(board.available))}</CardContent></Card>
        <Card><CardHeader><CardTitle>خط الأساس</CardTitle></CardHeader><CardContent>{formatCurrency(Number(board.baseline))}</CardContent></Card>
        <Card><CardHeader><CardTitle>سلف معلقة</CardTitle></CardHeader><CardContent>{formatCurrency(Number(board.outstanding))}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>حركة عهدة ثابتة جديدة</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label><span className="mb-1 block text-sm">المبلغ</span><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="min-w-64 flex-1"><span className="mb-1 block text-sm">السبب</span><Input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <Button disabled={busy} onClick={() => void post('addition')}>إضافة من الخزنة</Button>
          <Button variant="destructive" disabled={busy || board.requiresReconciliation} onClick={() => void post('withdrawal')}>سحب من العهدة</Button>
          {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>دفتر الحركات</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">النوع</th><th className="p-2 text-start">من ← إلى</th><th className="p-2 text-end">المبلغ</th><th className="p-2 text-start">السبب</th></tr></thead>
            <tbody>{board.movements.map((m) => <tr key={m.id} className="border-b"><td className="p-2">{m.type}</td><td className="p-2">{m.source} ← {m.destination}</td><td className="p-2 text-end">{formatCurrency(Number(m.amount))}</td><td className="p-2">{m.reason} · {m.actor ?? '—'} · {new Date(m.occurredAt).toLocaleString('ar-EG')}</td></tr>)}</tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">سحوبات الكاشير التشغيلية تخص درج الكاشير ولا تغيّر رصيد العهدة الثابتة. التحويلات ليست مبيعات. المتاح = خط الأساس + صافي إضافات/سحوبات العهدة − تأثيرات السلف/المرتجعات المسجلة وفق الاتجاه المحاسبي.</p>
    </div>
  )
}
