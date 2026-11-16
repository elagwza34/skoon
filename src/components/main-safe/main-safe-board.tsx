'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'
import type { MainSafeSummary } from '@/lib/staff-float'

export function MainSafeBoard({ summary, isOwner }: { summary: MainSafeSummary; isOwner: boolean }) {
  const router = useRouter()
  const [, transition] = useTransition()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const idempotencyKey = useRef(crypto.randomUUID())

  async function run(action: 'deposit' | 'withdraw' | 'transfer_to_fixed_float') {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0 || reason.trim().length < 3) {
      setError('أدخل مبلغًا موجبًا وسببًا واضحًا (3 أحرف على الأقل).')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/staff/main-safe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey.current },
        body: JSON.stringify({ action, amount: value, reason: reason.trim(), idempotencyKey: idempotencyKey.current }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'فشلت العملية')
      idempotencyKey.current = crypto.randomUUID()
      setAmount('')
      setReason('')
      setSuccess(action === 'deposit' ? 'تم الإيداع في الخزنة الرئيسية.' : action === 'withdraw' ? 'تم تسجيل السحب من الخزنة الرئيسية.' : 'تم التحويل إلى العهدة الثابتة.')
      transition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشلت العملية')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main dir="rtl" className="min-h-dvh bg-background p-3 sm:p-5">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
        <header className="rounded-xl border bg-card p-4">
          <h1 className="text-xl font-bold">الخزنة الرئيسية</h1>
          <p className="mt-1 text-sm text-muted-foreground">عرض الرصيد والحركات. الإيداع/السحب/التحويل إلى العهدة الثابتة متاح للمالك فقط.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardHeader><CardTitle>الرصيد الحالي</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatCurrency(Number(summary.balance))}</CardContent></Card>
          <Card><CardHeader><CardTitle>إجمالي الإيداعات</CardTitle></CardHeader><CardContent>{formatCurrency(Number(summary.deposits))}</CardContent></Card>
          <Card><CardHeader><CardTitle>إجمالي السحوبات/التحويلات</CardTitle></CardHeader><CardContent>{formatCurrency(Number(summary.withdrawals))}</CardContent></Card>
        </div>

        {isOwner ? (
          <Card>
            <CardHeader><CardTitle>حركة خزنة رئيسية</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm"><span className="mb-1 block">المبلغ</span><Input className="w-40" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
                <label className="min-w-64 flex-1 text-sm"><span className="mb-1 block">السبب</span><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب واضح للحركة" /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void run('deposit')}>إيداع في الخزنة</Button>
                <Button variant="outline" disabled={busy} onClick={() => void run('transfer_to_fixed_float')}>تحويل إلى العهدة الثابتة</Button>
                <Button variant="destructive" disabled={busy} onClick={() => void run('withdraw')}>سحب من الخزنة</Button>
              </div>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              {success ? <p className="text-sm text-success">{success}</p> : null}
              <p className="text-xs text-muted-foreground">ملاحظة: «إضافة من الخزنة» في صفحة العهدة الثابتة تسحب من رصيد الخزنة الرئيسية. إذا ظهر «رصيد الخزنة الرئيسية غير كافٍ» نفّذ إيداعًا هنا أولًا بالمبلغ المطلوب (مع سبب موثّق).</p>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">عرض فقط. تنفيذ الحركات متاح للمالك.</CardContent></Card>
        )}

        <Card>
          <CardHeader><CardTitle>سجل حركات الخزنة الرئيسية</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">النوع</th><th className="p-2 text-start">من ← إلى</th><th className="p-2 text-end">المبلغ</th><th className="p-2 text-start">السبب</th><th className="p-2 text-start">التاريخ</th></tr></thead>
              <tbody>
                {summary.movements.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="p-2">{m.type}</td>
                    <td className="p-2">{m.source} ← {m.destination}</td>
                    <td className="p-2 text-end">{formatCurrency(Number(m.amount))}</td>
                    <td className="p-2">{m.reason} · {m.actor ?? '—'}</td>
                    <td className="p-2">{new Date(m.occurredAt).toLocaleString('ar-EG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary.movements.length === 0 ? <p className="py-4 text-sm text-muted-foreground">لا توجد حركات مسجلة.</p> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
