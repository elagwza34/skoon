'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ThermalReceiptPreview, type ThermalPaymentResult } from './thermal-receipt-preview'
import { formatCurrency as formatMoney, formatDateShort, formatTime } from '@/lib/format'
import type { InvoiceRow } from '@/lib/staff-invoices'
import { receiptInvoiceForSettlement } from '@/lib/receipt-settlement'

type InvoiceTab = 'open' | 'paid' | 'cancelled'
type PaymentResult = ThermalPaymentResult & { remaining: string; invoice: InvoiceRow }
type ReceiptPreviewState = { invoice: InvoiceRow; autoPrint?: boolean; payment?: ThermalPaymentResult }
type InvoiceEditInput =
  | { action: 'add'; productId: string; quantity: number }
  | { action: 'quantity'; orderItemId: string; quantity: number }
  | { action: 'line_discount'; orderItemId: string; discountType: 'percentage' | 'amount' | 'none'; discountValue: string; eligibleForInvoiceDiscount: boolean }
  | { action: 'financials'; discountType: 'percentage' | 'amount' | 'none'; discountValue: string | number; notes: string | null }

const money = (value: number | string) => formatMoney(Number(value))
const dateTime = (value: string) => { const date = new Date(value); const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date); return `${formatDateShort(date)} ${time}` }
const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export function InvoiceBoard({ invoices, products, defaultTab = 'open', workspace = false }: {
  invoices: InvoiceRow[]; products: { id: string; name: string; price: string }[]; defaultTab?: InvoiceTab; workspace?: boolean
}) {
  const router = useRouter(); const [query, setQuery] = useState(''); const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ReceiptPreviewState | null>(null); const [received, setReceived] = useState(''); const [method, setMethod] = useState('cash'); const [receivedNotice, setReceivedNotice] = useState<string | null>(null)
  const [reason, setReason] = useState(''); const [notice, setNotice] = useState<string | null>(null); const [receipt, setReceipt] = useState<PaymentResult | null>(null); const [pending, startTransition] = useTransition()
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const rows = useMemo(() => invoices.filter((invoice) => {
    const match = !query.trim() || invoice.number.toLowerCase().includes(query.trim().toLowerCase()) || (invoice.creator ?? '').toLowerCase().includes(query.trim().toLowerCase())
    return match && (defaultTab === 'cancelled' ? invoice.status === 'cancelled' : defaultTab === 'paid' ? invoice.status !== 'cancelled' && Number(invoice.remaining) <= 0 : invoice.status !== 'cancelled' && Number(invoice.remaining) > 0)
  }), [invoices, query, defaultTab])
  const selected = rows.find((invoice) => invoice.id === selectedId) ?? null
  const editable = selected?.status !== 'cancelled' && Number(selected?.remaining ?? 0) > 0
  const readonlyList = defaultTab === 'paid' || defaultTab === 'cancelled'
  const refresh = (message?: string) => { setNotice(message ?? null); router.refresh() }
  function resetSettlementDraft() {
		if (!received || Number(received) <= 0) {
			setReceivedNotice('يجب إدخال المبلغ المستلم قبل التحصيل');
			setTimeout(() => setReceivedNotice(null), 5000);
			return
		}
		setNotice(null)
		setReceived('')
		setMethod('cash')
		setReason('')
		setDiscountType('none')
		setDiscountValue('')
		setInvoiceNotes('')
		setReceipt(null)
		router.push('/cashier/settlements')
	}
	function openSettlement(invoice: InvoiceRow) {
    setSelectedId(invoice.id)
    setReceived('')
    setMethod('cash')
    setReason('')
    setDiscountType('none')
    setDiscountValue('')
    setInvoiceNotes(invoice.notes ?? '')
  }
  function closeSettlement() { if (!pending) setSelectedId(null) }
  function edit(input: InvoiceEditInput) { if (!selected) return; startTransition(async () => { const response = await fetch(`/api/staff/invoices/${selected.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); const body = await response.json().catch(() => ({})); refresh(response.ok ? 'تم حفظ الفاتورة.' : body.error ?? 'تعذر حفظ الفاتورة.') }) }
  function collect() { if (!selected) return; if (!received || Number(received) <= 0) { setNotice('يجب إدخال المبلغ المستلم قبل التحصيل'); return }
    const amount = Number(received)
    if (method !== 'cash' && amount < Number(selected.remaining)) { setNotice('لطرق الدفع غير النقدية يجب تحصيل المبلغ كاملاً'); return }; startTransition(async () => { const invoice = selected; const response = await fetch(`/api/staff/orders/${invoice.id}/pay`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key() }, body: JSON.stringify({ action: 'pay', method, received: received || invoice.remaining }) }); const body = await response.json().catch(() => ({})); if (!response.ok) return setNotice(body.error ?? 'تعذر تحصيل الدفعة.'); const persistedInvoice = receiptInvoiceForSettlement(invoice.id, body.invoice as InvoiceRow | undefined); if (!persistedInvoice) return setNotice('تم التحصيل لكن تعذر تحميل الفاتورة المحدثة للطباعة.'); setReceipt({ paid: body.amount ?? persistedInvoice.paid, remaining: '0', change: body.changeAmount ?? '0', method: body.method ?? method, invoice: persistedInvoice }); setReceived(''); setSelectedId(null); refresh('تم تسجيل التحصيل.') }) }
  function cancel() { if (!selected || !reason.trim()) return setNotice('سبب الإلغاء مطلوب.'); startTransition(async () => { const response = await fetch(`/api/staff/orders/${selected.id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'cancelled', reason: reason.trim() }) }); const body = await response.json().catch(() => ({})); if (response.ok) { setReason(''); setSelectedId(null); refresh('تم إلغاء الفاتورة وتسجيل السبب.') } else setNotice(body.error ?? 'تعذر إلغاء الفاتورة.') }) }
  return <Card className="w-full p-4" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{defaultTab === 'paid' ? 'الفواتير المحصلة' : defaultTab === 'cancelled' ? 'الفواتير الملغاة' : 'الفواتير المفتوحة'}</h2><p className="text-sm text-muted-foreground">بيانات حية من الطلبات والتحصيلات المسجلة.</p></div>{defaultTab === 'paid' && <Button variant="secondary" onClick={() => window.location.assign('/api/staff/invoices?format=csv')}>تصدير CSV</Button>}</div>
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم الفاتورة أو المنشئ" className="mb-4" />
    {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
    {readonlyList ? <InvoiceList rows={rows} tab={defaultTab} onPreview={(invoice) => setPreview({ invoice, autoPrint: true })} /> : <InvoiceList rows={rows} tab="open" selectedId={selected?.id} onSelect={openSettlement} />}
    {selected && <InvoiceSettlementModal invoice={selected} products={products} editable={editable} pending={pending} received={received} method={method} reason={reason} setReceived={setReceived} setMethod={setMethod} setReason={setReason} edit={edit} collect={collect} cancel={cancel} onPrint={() => { if (!received || Number(received) <= 0) { setNotice('يجب إدخال المبلغ المستلم قبل المعاينة أو الطباعة'); return } setPreview({ invoice: selected, autoPrint: true }) }} onClose={closeSettlement} />}
    {preview && <ThermalReceiptPreview invoice={preview.invoice} payment={preview.payment} autoPrint={preview.autoPrint} onClose={() => setPreview(null)} />}
    {receipt && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-sm p-5" dir="rtl"><h3 className="font-bold">إيصال التحصيل</h3><p>الطريقة: {receipt.method}</p><p>المحصل: {money(receipt.paid)}</p><p>الباقي للعميل: {money(receipt.change)}</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setPreview({ invoice: receipt.invoice, autoPrint: true, payment: receipt }); setReceipt(null) }}>طباعة الإيصال</Button><Button onClick={() => setReceipt(null)}>إغلاق</Button></div></Card></div>}
  </Card>
}

function InvoiceList({ rows, tab, selectedId, onSelect, onPreview }: { rows: InvoiceRow[]; tab: InvoiceTab; selectedId?: string; onSelect?: (invoice: InvoiceRow) => void; onPreview?: (invoice: InvoiceRow) => void }) {
  if (!rows.length) return <EmptyState title="لا توجد فواتير" description="لا توجد سجلات مطابقة لهذا القسم." />
  return <div className={tab === 'open' ? 'space-y-2' : 'overflow-x-auto'}>{tab === 'open' ? rows.map((invoice) => <button key={invoice.id} onClick={() => onSelect?.(invoice)} className={`w-full rounded-xl border p-3 text-right ${selectedId === invoice.id ? 'border-primary bg-accent/40' : 'border-border bg-card'}`}><div className="flex justify-between gap-3"><strong>{invoice.number}</strong><span>{money(invoice.total)}</span></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{invoice.creator ?? '—'} · {dateTime(invoice.createdAt)}</span><span>المتبقي {money(invoice.remaining)}</span></div></button>) : <table className="w-full min-w-[760px] text-right text-sm"><thead className="border-b text-muted-foreground"><tr><th className="p-3">الفاتورة</th><th>التاريخ</th><th>الطاولة</th><th>المنشئ</th><th>الإجمالي</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{rows.map((invoice) => <tr key={invoice.id} className="border-b border-border/60"><td className="p-3 font-medium">{invoice.number}</td><td>{dateTime(invoice.createdAt)}</td><td>{invoice.table}</td><td>{invoice.creator ?? '—'}</td><td>{money(invoice.total)}</td><td>{tab === 'paid' ? invoice.payments.map(p => p.method).join(' / ') || 'مدفوعة' : 'ملغاة'}</td><td><Button size="sm" variant="outline" onClick={() => onPreview?.(invoice)}>طباعة</Button></td></tr>)}</tbody></table>}</div>
}

function InvoiceSettlementModal({ invoice, products, editable, pending, received, method, reason, setReceived, setMethod, setReason, edit, collect, cancel, onPrint, onClose }: { invoice: InvoiceRow; products: { id: string; name: string; price: string }[]; editable: boolean; pending: boolean; received: string; method: string; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; collect: () => void; cancel: () => void; onPrint: () => void; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="invoice-settlement-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" dir="rtl">
    <Card className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl">
      <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <div className="min-w-0"><h2 id="invoice-settlement-title" className="truncate text-lg font-bold">تقفيل الفاتورة {invoice.number}</h2><p className="truncate text-xs text-muted-foreground">{dateTime(invoice.createdAt)} · {invoice.creator ?? '—'} · {invoice.status}</p></div>
        <Button variant="ghost" disabled={pending} onClick={onClose}>إغلاق</Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"><InvoiceEditor invoice={invoice} products={products} editable={editable} pending={pending} received={received} method={method} reason={reason} setReceived={setReceived} setMethod={setMethod} setReason={setReason} edit={edit} collect={collect} cancel={cancel} onPrint={onPrint} modal /></div>
    </Card>
  </div>
}

function ItemDiscountPanel({ items, pending, edit }: { items: InvoiceRow['items']; pending: boolean; edit: (input: InvoiceEditInput) => void }) {
  const [itemId, setItemId] = useState(items[0]?.id ?? '')
  const item = items.find((candidate) => candidate.id === itemId) ?? items[0]
  const [type, setType] = useState<'none' | 'percentage' | 'amount'>(item?.discountType ?? 'none')
  const [value, setValue] = useState(item?.discountType ? item.discountValue : '')
  const [eligible, setEligible] = useState(item?.eligibleForInvoiceDiscount ?? true)
  const [error, setError] = useState<string | null>(null)
  if (!item) return null
  function save() {
    if (type !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) { setError('أدخل قيمة خصم صحيحة'); return }
    if (type === 'percentage' && !/^\d+$/.test(value.trim())) { setError('النسبة يجب أن تكون رقمًا صحيحًا'); return }
    setError(null)
    edit({ action: 'line_discount', orderItemId: item.id, discountType: type, discountValue: type === 'none' ? '0' : value.trim(), eligibleForInvoiceDiscount: eligible })
  }
  return <Card className="border border-amber-200/70 p-3" dir="rtl"><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">خصم صنف</h3><span className="text-xs text-muted-foreground">يُحسب قبل خصم الفاتورة</span></div><div className="grid gap-2 sm:grid-cols-4"><select value={item.id} onChange={(event) => { const next = items.find((candidate) => candidate.id === event.target.value); setItemId(event.target.value); setType(next?.discountType ?? 'none'); setValue(next?.discountType ? next.discountValue : ''); setEligible(next?.eligibleForInvoiceDiscount ?? true) }} className="rounded-lg border bg-background p-2 text-sm">{items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">بدون خصم</option><option value="percentage">نسبة مئوية (%)</option><option value="amount">مبلغ ثابت</option></select><Input value={value} disabled={type === 'none'} onChange={(event) => setValue(event.target.value)} inputMode="decimal" placeholder="قيمة الخصم" /><Button disabled={pending} onClick={save}>حفظ خصم الصنف</Button></div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={eligible} onChange={(event) => setEligible(event.target.checked)} />يشمله الخصم العام للفاتورة</label>{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</Card>
}

function InvoiceLineEditor({ item, editable, pending, edit }: { item: InvoiceRow['items'][number]; editable: boolean; pending: boolean; edit: (input: InvoiceEditInput) => void }) {
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>(item.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(item.discountType ? item.discountValue : '')
  const [eligibleForInvoiceDiscount, setEligibleForInvoiceDiscount] = useState(item.eligibleForInvoiceDiscount)
  const [error, setError] = useState<string | null>(null)
  function applyItemDiscount() {
    if (discountType !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(discountValue.trim())) { setError('أدخل قيمة خصم صحيحة'); return }
    if (discountType === 'percentage' && !/^\d+$/.test(discountValue.trim())) { setError('النسبة يجب أن تكون رقمًا صحيحًا'); return }
    setError(null)
    edit({ action: 'line_discount', orderItemId: item.id, discountType, discountValue: discountType === 'none' ? '0' : discountValue.trim(), eligibleForInvoiceDiscount })
  }
  return <div className="grid gap-2 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0"><div className="flex items-center justify-between gap-3"><span className="font-medium">{item.name} × {item.quantity}</span><strong>{money(item.lineTotal)}</strong></div>{Number(item.discountAmount) > 0 ? <p className="mt-1 text-xs text-black">خصم الصنف: -{money(item.discountAmount)}</p> : null}</div>
    {editable && <div className="flex flex-wrap items-center gap-1.5"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="h-8 rounded border bg-background px-1 text-xs"><option value="none">بدون خصم</option><option value="percentage">نسبة %</option><option value="amount">مبلغ</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="القيمة" className="h-8 w-20 text-xs" /><label className="flex items-center gap-1 whitespace-nowrap text-[11px]"><input type="checkbox" checked={eligibleForInvoiceDiscount} onChange={(event) => setEligibleForInvoiceDiscount(event.target.checked)} />خصم عام</label><Button size="sm" variant="secondary" disabled={pending} onClick={applyItemDiscount}>تطبيق</Button><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>−</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button>{error && <p className="basis-full text-xs text-destructive">{error}</p>}</div>}
  </div>
}

function InvoiceEditor({ invoice, products, editable, pending, received, method, reason, setReceived, setMethod, setReason, edit, collect, cancel, onPrint, modal = false }: { invoice: InvoiceRow; products: { id: string; name: string; price: string }[]; editable: boolean; pending: boolean; received: string; method: string; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; collect: () => void; cancel: () => void; onPrint: () => void; modal?: boolean }) {
  const cancellable = (invoice.status === 'new' || invoice.status === 'preparing') && Number(invoice.paid) === 0
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>(invoice.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(invoice.discountType ? invoice.discountValue ?? '' : '')
  const [invoiceNotes, setInvoiceNotes] = useState(invoice.notes ?? '')
  const [financialNotice, setFinancialNotice] = useState<string | null>(null)
  function applyFinancials() {
    if (!editable) return
    const val = discountValue.trim()
    if (discountType === 'none') {
      setFinancialNotice(null)
      edit({ action: 'financials', discountType: 'none', discountValue: '0', notes: invoiceNotes.trim() || null })
      return
    }
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(val)) { setFinancialNotice('أدخل قيمة خصم صحيحة'); return }
    if (discountType === 'percentage' && !/^\d+$/.test(val)) { setFinancialNotice('النسبة يجب أن تكون رقمًا صحيحًا'); return }
    setFinancialNotice(null)
    edit({ action: 'financials', discountType, discountValue: val, notes: invoiceNotes.trim() || null })
  }
  return <Card className={modal ? 'border-0 p-0 shadow-none' : 'p-4'} dir="rtl">
    {!modal && <div className="mb-3 flex justify-between"><div><h3 className="font-bold">{invoice.number}</h3><p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)}</p></div><span>{invoice.status}</span></div>}
    <div className="space-y-1">{invoice.items.map((item) => <InvoiceLineEditor key={item.id} item={item} editable={editable} pending={pending} edit={edit} />)}</div>
    {editable && <select className="mt-3 w-full rounded-lg border bg-background p-2 text-sm" defaultValue="" onChange={(event) => { if (event.target.value) { edit({ action: 'add', productId: event.target.value, quantity: 1 }); event.currentTarget.value = '' } }}><option value="">إضافة صنف من الكتالوج…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — {money(product.price)}</option>)}</select>}
    <Totals invoice={invoice} />
    {editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-200/70 p-3"><div className="flex flex-wrap gap-2"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">بدون خصم للفاتورة</option><option value="percentage">نسبة مئوية (%)</option><option value="amount">مبلغ ثابت</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="قيمة خصم الفاتورة" className="max-w-44" /></div><Input value={invoiceNotes} onChange={(event) => setInvoiceNotes(event.target.value)} placeholder="ملاحظات الفاتورة…" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>تطبيق خصم الفاتورة</Button></div>}
    {(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-lg border bg-background p-2"><option value="cash">نقدي</option><option value="mobile_wallet">محفظة إلكترونية</option><option value="instapay">إنستا باي</option></select><Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder={`المستلم (المطلوب ${invoice.remaining})`} /><Button disabled={pending} onClick={collect}>تحصيل</Button><Button variant="secondary" onClick={onPrint}>طباعة / معاينة</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب الإلغاء (مطلوب)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>إلغاء الفاتورة</Button></div>}</div>}
  </Card>
}

function LegacyInvoiceEditor({ invoice, products, editable, pending, received, method, reason, setReceived, setMethod, setReason, edit, collect, cancel, onPrint, modal = false }: { invoice: InvoiceRow; products: { id: string; name: string; price: string }[]; editable: boolean; pending: boolean; received: string; method: string; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; collect: () => void; cancel: () => void; onPrint: () => void; modal?: boolean }) {
 const cancellable = (invoice.status === 'new' || invoice.status === 'preparing') && Number(invoice.paid) === 0
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState(invoice.notes ?? '')
  const [financialNotice, setFinancialNotice] = useState<string | null>(null)
  function applyFinancials() { if (!editable) return; const val = discountValue.trim(); if (discountType === 'none') { setFinancialNotice(null); edit({ action: 'financials', discountType: 'none', discountValue: '0', notes: invoiceNotes.trim() || null }); return } const value = Number(val); if (!Number.isFinite(value) || value < 0) { setFinancialNotice('قيمة الخصم غير صحيحة'); return } setFinancialNotice(null); edit({ action: 'financials', discountType, discountValue: val, notes: invoiceNotes.trim() || null }) }
 return <Card className={modal ? 'border-0 p-0 shadow-none' : 'p-4'}>{!modal && <div className="mb-3 flex justify-between"><div><h3 className="font-bold">{invoice.number}</h3><p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)} · {invoice.creator ?? '—'}</p></div><span>{invoice.status}</span></div>}<div className="space-y-2">{invoice.items.map(item => <div key={item.id} className="flex items-center justify-between gap-2 border-b py-2"><span>{item.name} × {item.quantity}</span><span>{money(item.lineTotal)}</span>{editable && <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>−</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button></div>}</div>)}</div>{editable && <select className="mt-3 w-full rounded-lg border p-2 text-sm" defaultValue="" onChange={e => { if (e.target.value) { edit({ action: 'add', productId: e.target.value, quantity: 1 }); e.currentTarget.value = '' } }}><option value="">إضافة صنف من الكتالوج…</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}</select>}<Totals invoice={invoice} />{editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-100 p-3"><div className="flex gap-2"><select value={discountType} onChange={e => setDiscountType(e.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border p-2 text-sm"><option value="none">بدون خصم</option><option value="percentage">نسبة مئوية (%)</option><option value="amount">مبلغ ثابت</option></select><Input value={discountValue} onChange={e => setDiscountValue(e.target.value)} inputMode="decimal" placeholder="قيمة الخصم" className="rounded-lg border p-2 text-sm" /></div><Input value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} placeholder="ملاحظات على الفاتورة…" className="rounded-lg border p-2 text-sm w-full" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>تطبيق الخصم والملاحظات</Button></div>}{(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={e => setMethod(e.target.value)} className="rounded-lg border p-2"><option value="cash">نقدي</option><option value="mobile_wallet">محفظة إلكترونية</option><option value="instapay">انستا باي</option></select><Input value={received} onChange={e => setReceived(e.target.value)} inputMode="decimal" placeholder={`المستلم (المطلوب ${invoice.remaining})`} /><Button disabled={pending} onClick={collect}>تحصيل</Button><Button variant="secondary" onClick={onPrint}>طباعة / معاينة</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب الإلغاء (مطلوب)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>إلغاء الفاتورة</Button></div>}</div>}</Card>
}

function Totals({ invoice }: { invoice: InvoiceRow }) { return <div className="mt-4 space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>الإجمالي</span><strong>{money(invoice.subtotal)}</strong></div><div className="flex justify-between"><span>الخصم</span><span>{Number(invoice.discount) > 0 ? `-${money(invoice.discount)}` : money(0)}</span></div><div className="flex justify-between font-bold"><span>المدفوع</span><span>{money(invoice.paid)}</span></div></div> }
