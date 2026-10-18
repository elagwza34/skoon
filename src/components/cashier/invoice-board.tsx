'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { formatCurrency as formatMoney, formatDateShort, formatTime } from '@/lib/format'
import type { InvoiceRow } from '@/lib/staff-invoices'

type InvoiceTab = 'open' | 'paid' | 'cancelled'
type PaymentResult = { paid: string; remaining: string; change: string; method: string }

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return `${formatDateShort(date)} ${formatTime(date)}`
}

function formatCurrency(value: number | string) {
  return formatMoney(Number(value))
}

export function InvoiceBoard({
  invoices,
  products,
  defaultTab = 'open',
  workspace = false,
}: {
  invoices: InvoiceRow[]
  products: { id: string; name: string; price: string }[]
  defaultTab?: InvoiceTab
  workspace?: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<InvoiceTab>(defaultTab)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [received, setReceived] = useState('')
  const [method, setMethod] = useState('cash')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<PaymentResult | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setTab(defaultTab)
    setSelectedId(null)
  }, [defaultTab])

  const rows = useMemo(() => invoices.filter((invoice) => {
    const normalized = query.trim().toLowerCase()
    const matches = !normalized || invoice.number.toLowerCase().includes(normalized) || (invoice.creator ?? '').toLowerCase().includes(normalized)
    if (!matches) return false
    if (tab === 'cancelled') return invoice.status === 'cancelled'
    if (tab === 'paid') return invoice.status !== 'cancelled' && Number(invoice.remaining) <= 0
    return invoice.status !== 'cancelled' && Number(invoice.remaining) > 0
  }), [invoices, query, tab])
  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? rows[0] ?? null
  const editable = selected?.status !== 'cancelled' && Number(selected?.remaining ?? 0) > 0

  function refresh(message?: string) {
    setNotice(message ?? null)
    router.refresh()
  }

  function edit(input: { action: 'add'; productId: string; quantity: number } | { action: 'quantity'; orderItemId: string; quantity: number }) {
    if (!selected) return
    startTransition(async () => {
      const response = await fetch(`/api/staff/invoices/${selected.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
      })
      const body = await response.json().catch(() => ({}))
      refresh(response.ok ? 'تم حفظ الفاتورة.' : body.error ?? 'تعذر حفظ الفاتورة.')
    })
  }

  function collect() {
    if (!selected) return
    startTransition(async () => {
      const response = await fetch(`/api/staff/orders/${selected.id}/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': newKey() },
        body: JSON.stringify({ action: 'pay', method, received: received || selected.remaining }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return setNotice(body.error ?? 'تعذر تحصيل الدفعة.')
      setReceipt({ paid: body.amount ?? selected.remaining, remaining: '0', change: body.changeAmount ?? '0', method: body.method ?? method })
      setReceived('')
      refresh('تم تسجيل التحصيل.')
    })
  }

  function cancel() {
    if (!selected || !reason.trim()) return setNotice('سبب الإلغاء مطلوب.')
    startTransition(async () => {
      const response = await fetch(`/api/staff/orders/${selected.id}/status`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'cancelled', reason: reason.trim() }),
      })
      const body = await response.json().catch(() => ({}))
      if (response.ok) { setReason(''); refresh('تم إلغاء الفاتورة وتسجيل السبب.') } else setNotice(body.error ?? 'تعذر إلغاء الفاتورة.')
    })
  }

  function exportPaid() {
    window.location.assign('/api/staff/invoices?format=csv')
  }

  return <Card className="p-4" dir="rtl">
    {!workspace && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold">الفواتير</h2><p className="text-sm text-slate-500">بيانات حية من الطلبات والتحصيلات المسجلة.</p></div>
      {tab === 'paid' && <Button variant="secondary" onClick={exportPaid}>تصدير CSV</Button>}
    </div>}
    {workspace && tab === 'paid' && <div className="mb-3 flex justify-end"><Button variant="secondary" onClick={exportPaid}>تصدير CSV</Button></div>}
    {!workspace && <div className="mb-4 flex gap-2">{(['open', 'paid'] as InvoiceTab[]).map((item) => <Button key={item} variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>{item === 'open' ? 'مفتوحة' : 'مدفوعة'}</Button>)}</div>}
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم الفاتورة أو المنشئ" className="mb-4" />
    {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.9fr)]" dir="ltr">
      <section className="space-y-2" dir="rtl">
        {rows.length === 0 ? <EmptyState title="لا توجد فواتير" description="لا توجد سجلات مطابقة لهذا القسم." /> : rows.map((invoice) => <button key={invoice.id} onClick={() => setSelectedId(invoice.id)} className={`w-full rounded-xl border p-3 text-right ${selected?.id === invoice.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex justify-between gap-3"><strong>{invoice.number}</strong><span>{formatCurrency(invoice.total)}</span></div>
          <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{invoice.creator ?? '—'} · {formatDateTime(invoice.createdAt)}</span><span>المتبقي {formatCurrency(invoice.remaining)}</span></div>
        </button>)}
      </section>
      <section className="lg:order-first" dir="rtl">
        {!selected ? <EmptyState title="اختر فاتورة" description="اختر فاتورة لعرض تفاصيلها." /> : <Card className="p-4">
          <div className="mb-3 flex justify-between gap-3"><div><h3 className="font-bold">{selected.number}</h3><p className="text-xs text-slate-500">{formatDateTime(selected.createdAt)} · {selected.creator ?? '—'}</p></div><span className="text-sm">{selected.status}</span></div>
          <div className="space-y-2">{selected.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 border-b py-2"><span>{item.name} × {item.quantity}</span><span>{formatCurrency(item.lineTotal)}</span>{editable && <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>−</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button></div>}</div>)}</div>
          {editable && <select className="mt-3 w-full rounded-lg border p-2 text-sm" defaultValue="" disabled={pending} onChange={(event) => { if (!event.target.value) return; edit({ action: 'add', productId: event.target.value, quantity: 1 }); event.currentTarget.value = '' }}><option value="">إضافة صنف من الكتالوج…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — {formatCurrency(product.price)}</option>)}</select>}
          <div className="mt-4 space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>الإجمالي</span><strong>{formatCurrency(selected.total)}</strong></div><div className="flex justify-between"><span>المحصل</span><span>{formatCurrency(selected.paid)}</span></div><div className="flex justify-between font-bold"><span>المتبقي</span><span>{formatCurrency(selected.remaining)}</span></div></div>
          {editable && <div className="mt-4 grid gap-2 sm:grid-cols-2"><select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-lg border p-2"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="online">أونلاين</option></select><Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder={`المستلم (المطلوب ${selected.remaining})`} /><Button disabled={pending} onClick={collect}>تحصيل</Button><Button variant="secondary" onClick={() => window.print()}>طباعة / معاينة</Button></div>}
          {(selected.status === 'new' || selected.status === 'preparing') && Number(selected.paid) === 0 && <div className="mt-4 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب الإلغاء (مطلوب)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>إلغاء الفاتورة</Button></div>}
          {selected.status === 'cancelled' && <p className="mt-3 text-sm text-rose-700">ألغيت في {selected.cancelledAt ? formatDateTime(selected.cancelledAt) : '—'}: {selected.cancelReason ?? 'لا يوجد سبب مسجل'}</p>}
        </Card>}
      </section>
    </div>
    {receipt && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" dir="rtl"><Card className="w-full max-w-sm p-5"><h3 className="font-bold">إيصال التحصيل</h3><p className="mt-2">الطريقة: {receipt.method}</p><p>المحصل: {formatCurrency(receipt.paid)}</p><p>الباقي: {formatCurrency(receipt.remaining)}</p><p>الباقي للعميل: {formatCurrency(receipt.change)}</p><Button className="mt-4" onClick={() => setReceipt(null)}>إغلاق</Button></Card></div>}
  </Card>
}
