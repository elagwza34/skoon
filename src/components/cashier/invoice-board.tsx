'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ThermalReceiptPreview, type ThermalPaymentResult } from './thermal-receipt-preview'
import { formatCurrency as formatMoney, formatDateShort, formatTime } from '@/lib/format'
import type { InvoiceRow } from '@/lib/staff-invoices'
import { receiptInvoiceForSettlement } from '@/lib/receipt-settlement'
import { buildPaymentRequestPayload } from '@/lib/payment-request'

type InvoiceTab = 'open' | 'paid' | 'cancelled'
type PaymentResult = ThermalPaymentResult & { remaining: string; invoice: InvoiceRow }
type ReceiptPreviewState = { invoice: InvoiceRow; autoPrint?: boolean; payment?: ThermalPaymentResult }
type InvoiceEditInput =
  | { action: 'add'; productId: string; variantId?: string; quantity: number }
  | { action: 'quantity'; orderItemId: string; quantity: number }
  | { action: 'line_discount'; orderItemId: string; discountType: 'percentage' | 'amount' | 'none'; discountValue: string; eligibleForInvoiceDiscount: boolean }
  | { action: 'financials'; discountType: 'percentage' | 'amount' | 'none'; discountValue: string | number; notes: string | null }

const money = (value: number | string) => formatMoney(Number(value))
const dateTime = (value: string) => { const date = new Date(value); const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date); return `${formatDateShort(date)} ${time}` }
const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export function InvoiceBoard({ invoices, products, categories, defaultTab = 'open', workspace = false }: {
  invoices: InvoiceRow[]; products: { id: string; name: string; price: string; categoryId?: string; isAvailable?: boolean; categoryName?: string; variants?: { id: string; label: string; price: string }[] }[]; categories?: { id: string; name: string }[]; defaultTab?: InvoiceTab; workspace?: boolean
}) {
  const router = useRouter(); const [query, setQuery] = useState(''); const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tableFilter, setTableFilter] = useState('all')
  const [preview, setPreview] = useState<ReceiptPreviewState | null>(null); const [received, setReceived] = useState(''); const [method, setMethod] = useState('cash'); const [electronicPaymentConfirmed, setElectronicPaymentConfirmed] = useState(false); const [receivedNotice, setReceivedNotice] = useState<string | null>(null)
  const [reason, setReason] = useState(''); const [notice, setNotice] = useState<string | null>(null); const [receipt, setReceipt] = useState<PaymentResult | null>(null); const [pending, startTransition] = useTransition()
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const tableOptions = useMemo(() => {
    const tables = new Set<string>()
    invoices.forEach((invoice) => { if (invoice.table) tables.add(invoice.table) })
    return ['all', ...Array.from(tables).sort((a, b) => a.localeCompare(b, 'ar'))]
  }, [invoices])
  const rows = useMemo(() => invoices.filter((invoice) => {
    const match = !query.trim() || invoice.number.toLowerCase().includes(query.trim().toLowerCase()) || (invoice.creator ?? '').toLowerCase().includes(query.trim().toLowerCase())
    const tableMatch = tableFilter === 'all' || invoice.table === tableFilter
    return match && tableMatch && (defaultTab === 'cancelled' ? invoice.status === 'cancelled' : defaultTab === 'paid' ? invoice.status !== 'cancelled' && Number(invoice.remaining) <= 0 : invoice.status !== 'cancelled' && Number(invoice.remaining) > 0)
  }), [invoices, query, tableFilter, defaultTab])
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
    setElectronicPaymentConfirmed(false)
    setReason('')
    setDiscountType('none')
    setDiscountValue('')
    setInvoiceNotes(invoice.notes ?? '')
  }
  function closeSettlement() { if (!pending) setSelectedId(null) }
  function edit(input: InvoiceEditInput) { if (!selected) return; startTransition(async () => { const response = await fetch(`/api/staff/invoices/${selected.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); const body = await response.json().catch(() => ({})); refresh(response.ok ? 'تم حفظ الفاتورة.' : body.error ?? 'تعذر حفظ الفاتورة.') }) }
  function removeItem(item: InvoiceRow['items'][number]) {
    if (!selected || pending) return
    const removalReason = window.prompt(`سبب إزالة ${item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name}`, 'أضيف بالخطأ')?.trim()
    if (!removalReason || removalReason.length < 3) return setNotice('سبب إزالة الصنف مطلوب (3 أحرف على الأقل).')
    if (!window.confirm(`تأكيد إزالة الصنف من الفاتورة ${selected.number}؟`)) return
    if (selected.items.length === 1) return cancel(removalReason)
    startTransition(async () => {
      const response = await fetch(`/api/staff/orders/${selected.id}/items/${item.id}/void`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key() }, body: JSON.stringify({ reason: removalReason }) })
      const body = await response.json().catch(() => ({}))
      refresh(response.ok ? 'تمت إزالة الصنف وإعادة احتساب الفاتورة.' : body.error ?? 'تعذر إزالة الصنف.')
    })
  }
  function collect() { if (!selected) return; const isNonCash = method !== 'cash'; const amount = isNonCash ? Number(selected.remaining) : (received ? Number(received) : 0); if (!isNonCash && (!received || amount <= 0)) { setNotice('يجب إدخال المبلغ المستلم قبل التحصيل'); return } if (isNonCash && !electronicPaymentConfirmed) { setNotice('يجب تأكيد استلام الدفع الإلكتروني قبل التحصيل'); return }; startTransition(async () => { const invoice = selected; const payload = buildPaymentRequestPayload(method, String(amount), electronicPaymentConfirmed); const response = await fetch(`/api/staff/orders/${invoice.id}/pay`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key() }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) return setNotice(body.error ?? 'تعذر تحصيل الدفعة.'); const persistedInvoice = receiptInvoiceForSettlement(invoice.id, body.invoice as InvoiceRow | undefined); if (!persistedInvoice) return setNotice('تم التحصيل لكن تعذر تحميل الفاتورة المحدثة للطباعة.'); setReceipt({ paid: body.amount ?? persistedInvoice.paid, remaining: '0', change: body.changeAmount ?? '0', method: body.method ?? method, invoice: persistedInvoice }); setReceived(''); setElectronicPaymentConfirmed(false); setSelectedId(null); if (isNonCash) { setPreview({ invoice: persistedInvoice, autoPrint: true, payment: { paid: body.amount ?? persistedInvoice.paid, change: '0', method: body.method ?? method } }); } else { refresh('تم تسجيل التحصيل.') } }) }
  function cancel(reasonOverride?: string) { const cancellationReason = reasonOverride?.trim() || reason.trim(); if (!selected || !cancellationReason) return setNotice('سبب الإلغاء مطلوب.'); startTransition(async () => { const response = await fetch(`/api/staff/orders/${selected.id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'cancelled', reason: cancellationReason }) }); const body = await response.json().catch(() => ({})); if (response.ok) { setReason(''); setSelectedId(null); refresh('تم إلغاء الفاتورة وتسجيل السبب.') } else setNotice(body.error ?? 'تعذر إلغاء الفاتورة.') }) }
  return <Card className="w-full p-4" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{defaultTab === 'paid' ? 'الفواتير المحصلة' : defaultTab === 'cancelled' ? 'الفواتير الملغاة' : 'الفواتير المفتوحة'}</h2><p className="text-sm text-muted-foreground">بيانات حية من الطلبات والتحصيلات المسجلة.</p></div>{defaultTab === 'paid' && <Button variant="secondary" onClick={() => window.location.assign('/api/staff/invoices?format=csv')}>تصدير CSV</Button>}</div>
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم الفاتورة أو المنشئ" className="mb-4" />
    {defaultTab === 'open' && (
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={tableFilter}
          onChange={(event) => setTableFilter(event.target.value)}
          className="rounded-lg border bg-background p-2 text-sm min-w-[160px]"
          aria-label="تصفية حسب الطاولة"
        >
          <option value="all">جميع الطاولات</option>
          {tableOptions.filter((t) => t !== 'all').map((t) => (
            <option key={t} value={t}>{t === 'تيك أواي' ? 'تيك أواي' : `طاولة ${t}`}</option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">{rows.length} فاتورة مطابقة</p>
      </div>
    )}
    {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
    {readonlyList ? <InvoiceList rows={rows} tab={defaultTab} onPreview={(invoice) => setPreview({ invoice, autoPrint: true })} /> : <InvoiceList rows={rows} tab="open" selectedId={selected?.id} onSelect={openSettlement} />}
    {selected && <InvoiceSettlementModal invoice={selected} products={products} categories={categories} editable={editable} pending={pending} received={received} method={method} electronicPaymentConfirmed={electronicPaymentConfirmed} reason={reason} setReceived={setReceived} setMethod={(next) => { setMethod(next); setElectronicPaymentConfirmed(false); if (next !== 'cash') setReceived('') }} setElectronicPaymentConfirmed={setElectronicPaymentConfirmed} setReason={setReason} edit={edit} removeItem={removeItem} collect={collect} cancel={() => cancel()} onPrint={() => { if (method === 'cash' && (!received || Number(received) <= 0)) { setNotice('يجب إدخال المبلغ المستلم قبل المعاينة أو الطباعة'); return } setPreview({ invoice: selected, autoPrint: true }) }} onClose={closeSettlement} />}
    {preview && <ThermalReceiptPreview invoice={preview.invoice} payment={preview.payment} autoPrint={preview.autoPrint} onClose={() => setPreview(null)} />}
    {receipt && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-sm p-5" dir="rtl"><h3 className="font-bold">إيصال التحصيل</h3><p>الطريقة: {receipt.method}</p><p>المحصل: {money(receipt.paid)}</p><p>الباقي للعميل: {money(receipt.change)}</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setPreview({ invoice: receipt.invoice, autoPrint: true, payment: receipt }); setReceipt(null) }}>طباعة الإيصال</Button><Button onClick={() => setReceipt(null)}>إغلاق</Button></div></Card></div>}
  </Card>
}

function InvoiceList({ rows, tab, selectedId, onSelect, onPreview }: { rows: InvoiceRow[]; tab: InvoiceTab; selectedId?: string; onSelect?: (invoice: InvoiceRow) => void; onPreview?: (invoice: InvoiceRow) => void }) {
  if (!rows.length) return <EmptyState title="لا توجد فواتير" description="لا توجد سجلات مطابقة لهذا القسم." />
      return <div className={tab === 'open' ? 'space-y-2' : 'overflow-x-auto'}>{tab === 'open' ? rows.map((invoice) => <button key={invoice.id} onClick={() => onSelect?.(invoice)} className={`w-full rounded-xl border p-3 text-right ${selectedId === invoice.id ? 'border-primary bg-accent/40' : 'border-border bg-card'}`}><div className="flex justify-between gap-3"><strong>{invoice.number}</strong><span>{money(invoice.total)}</span></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{invoice.creator ?? '—'} · {dateTime(invoice.createdAt)}</span><span>{invoice.table ? `طاولة ${invoice.table}` : 'تيك أواي'} · المتبقي {money(invoice.remaining)}</span></div></button>) : <table className="w-full min-w-[760px] text-right text-sm"><thead className="border-b text-muted-foreground"><tr><th className="p-3">الفاتورة</th><th>التاريخ</th><th>الطاولة</th><th>المنشئ</th><th>الإجمالي</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{rows.map((invoice) => <tr key={invoice.id} className="border-b border-border/60"><td className="p-3 font-medium">{invoice.number}</td><td>{dateTime(invoice.createdAt)}</td><td>{invoice.table}</td><td>{invoice.creator ?? '—'}</td><td>{money(invoice.total)}</td><td>{tab === 'paid' ? invoice.payments.map(p => p.method).join(' / ') || 'مدفوعة' : 'ملغاة'}</td><td><Button size="sm" variant="outline" onClick={() => onPreview?.(invoice)}>طباعة</Button></td></tr>)}</tbody></table>}</div>
}

function InvoiceSettlementModal({ invoice, products, categories, editable, pending, received, method, electronicPaymentConfirmed, reason, setReceived, setMethod, setElectronicPaymentConfirmed, setReason, edit, removeItem, collect, cancel, onPrint, onClose }: { invoice: InvoiceRow; products: { id: string; name: string; price: string; categoryId?: string; isAvailable?: boolean; categoryName?: string; variants?: { id: string; label: string; price: string }[] }[]; categories?: { id: string; name: string }[]; editable: boolean; pending: boolean; received: string; method: string; electronicPaymentConfirmed: boolean; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setElectronicPaymentConfirmed: (v: boolean) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; removeItem: (item: InvoiceRow['items'][number]) => void; collect: () => void; cancel: () => void; onPrint: () => void; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="invoice-settlement-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" dir="rtl">
    <Card className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl">
      <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <div className="min-w-0"><h2 id="invoice-settlement-title" className="truncate text-lg font-bold">تقفيل الفاتورة {invoice.number}</h2><p className="truncate text-xs text-muted-foreground">{dateTime(invoice.createdAt)} · {invoice.creator ?? '—'} · {invoice.status} · {invoice.table ? `طاولة ${invoice.table}` : 'تيك أواي'}</p></div>
        <Button variant="ghost" disabled={pending} onClick={onClose}>إغلاق</Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"><InvoiceEditor invoice={invoice} products={products} categories={categories} editable={editable} pending={pending} received={received} method={method} electronicPaymentConfirmed={electronicPaymentConfirmed} reason={reason} setReceived={setReceived} setMethod={setMethod} setElectronicPaymentConfirmed={setElectronicPaymentConfirmed} setReason={setReason} edit={edit} removeItem={removeItem} collect={collect} cancel={cancel} onPrint={onPrint} modal /></div>
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

function InvoiceLineEditor({ item, editable, pending, edit, removeItem }: { item: InvoiceRow['items'][number]; editable: boolean; pending: boolean; edit: (input: InvoiceEditInput) => void; removeItem: (item: InvoiceRow['items'][number]) => void }) {
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
    <div className="min-w-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name}</p>{item.details?.length ? <p className="text-xs text-muted-foreground">{item.details.join(' · ')}</p> : null}<p className="text-xs text-muted-foreground" dir="ltr">{item.quantity} × {money(item.unitPrice)}</p></div><strong className="shrink-0">{money(item.lineTotal)}</strong></div>{Number(item.discountAmount) > 0 ? <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">خصم الصنف: -{money(item.discountAmount)}</p> : null}</div>
    {editable && <div className="flex flex-wrap items-center gap-1.5"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="h-8 rounded border bg-background px-1 text-xs"><option value="none">بدون خصم</option><option value="percentage">نسبة %</option><option value="amount">مبلغ</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="القيمة" className="h-8 w-20 text-xs" /><label className="flex items-center gap-1 whitespace-nowrap text-[11px]"><input type="checkbox" checked={eligibleForInvoiceDiscount} onChange={(event) => setEligibleForInvoiceDiscount(event.target.checked)} />خصم عام</label><Button size="sm" variant="secondary" disabled={pending} onClick={applyItemDiscount}>تطبيق</Button><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>−</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button><Button size="sm" variant="destructive" disabled={pending} onClick={() => removeItem(item)}>إزالة الصنف</Button>{error && <p className="basis-full text-xs text-destructive">{error}</p>}</div>}
  </div>
}

function InvoiceEditor({ invoice, products, categories, editable, pending, received, method, electronicPaymentConfirmed, reason, setReceived, setMethod, setElectronicPaymentConfirmed, setReason, edit, removeItem, collect, cancel, onPrint, modal = false }: { invoice: InvoiceRow; products: { id: string; name: string; price: string; categoryId?: string; isAvailable?: boolean; categoryName?: string; variants?: { id: string; label: string; price: string }[] }[]; categories?: { id: string; name: string }[]; editable: boolean; pending: boolean; received: string; method: string; electronicPaymentConfirmed: boolean; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setElectronicPaymentConfirmed: (v: boolean) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; removeItem: (item: InvoiceRow['items'][number]) => void; collect: () => void; cancel: () => void; onPrint: () => void; modal?: boolean }) {
  const cancellable = (invoice.status === 'new' || invoice.status === 'preparing') && Number(invoice.paid) === 0
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>(invoice.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(invoice.discountType ? invoice.discountValue ?? '' : '')
  const [invoiceNotes, setInvoiceNotes] = useState(invoice.notes ?? '')
  const [financialNotice, setFinancialNotice] = useState<string | null>(null)
  const [variantModal, setVariantModal] = useState<{ product: { id: string; name: string; price: string; variants: { id: string; label: string; price: string }[] }; onConfirm: (variantId: string, qty: number) => void } | null>(null)
  const [addProductModal, setAddProductModal] = useState(false)
  const [addProductSearch, setAddProductSearch] = useState('')
  const [addProductCategory, setAddProductCategory] = useState('all')
  const [addProductSelected, setAddProductSelected] = useState<{ id: string; name: string; price: string; variants?: { id: string; label: string; price: string }[] } | null>(null)
  const [addProductQty, setAddProductQty] = useState(1)
  const [addProductVariantId, setAddProductVariantId] = useState<string | undefined>(undefined)
  const filteredAddProducts = useMemo(() => {
    const q = addProductSearch.trim().toLocaleLowerCase('ar')
    return products.filter((p) => {
      if ((addProductCategory !== 'all') && p.categoryId !== addProductCategory) return false
      if (!q) return true
      return p.name.toLocaleLowerCase('ar').includes(q)
    })
  }, [products, addProductSearch, addProductCategory])
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
  function addProduct(productId: string) {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    if ((product.variants ?? []).length > 0) {
      setVariantModal({
        product: { ...product, variants: product.variants ?? [] },
        onConfirm: (variantId, qty) => {
          edit({ action: 'add', productId, variantId, quantity: qty })
          setVariantModal(null)
        },
      })
      return
    }
    edit({ action: 'add', productId, quantity: 1 })
  }
  return <Card className={modal ? 'border-0 p-0 shadow-none' : 'p-4'} dir="rtl">
    {!modal && <div className="mb-3 flex justify-between"><div><h3 className="font-bold">{invoice.number}</h3><p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)}</p></div><span>{invoice.status}</span></div>}
    <div className="space-y-1">{[...invoice.items].sort((a, b) => {
      const aid = Number(a.id); const bid = Number(b.id);
      if (Number.isFinite(aid) && Number.isFinite(bid) && aid !== bid) return aid - bid;
      return String(a.id).localeCompare(String(b.id));
    }).map((item) => <InvoiceLineEditor key={item.id} item={item} editable={editable} pending={pending} edit={edit} removeItem={removeItem} />)}</div>
    {editable && <Button type="button" className="w-full justify-between" onClick={() => { setAddProductSearch(''); setAddProductCategory('all'); setAddProductSelected(null); setAddProductQty(1); setAddProductModal(true) }}><Icon name="plus" size={16} /> إضافة صنف</Button>}
    <Totals invoice={invoice} />
    {editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-200/70 p-3"><div className="flex flex-wrap gap-2"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">بدون خصم للفاتورة</option><option value="percentage">نسبة مئوية (%)</option><option value="amount">مبلغ ثابت</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="قيمة خصم الفاتورة" className="max-w-44" /></div><Input value={invoiceNotes} onChange={(event) => setInvoiceNotes(event.target.value)} placeholder="ملاحظات الفاتورة…" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>تطبيق خصم الفاتورة</Button></div>}
    {(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-lg border bg-background p-2" aria-label="طريقة الدفع"><option value="cash">نقدي</option><option value="mobile_wallet">محفظة إلكترونية</option><option value="instapay">إنستا باي</option></select>{method === 'cash' ? <Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder={`المستلم (المطلوب ${invoice.remaining})`} /> : <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm"><input type="checkbox" checked={electronicPaymentConfirmed} onChange={(event) => setElectronicPaymentConfirmed(event.target.checked)} disabled={pending} />أؤكد استلام الدفع الإلكتروني بالقيمة النهائية للفاتورة</label>}<Button disabled={pending || (method !== 'cash' && !electronicPaymentConfirmed)} onClick={collect}>تحصيل</Button><Button variant="secondary" onClick={onPrint}>طباعة / معاينة</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب الإلغاء (مطلوب)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>إلغاء الفاتورة</Button></div>}</div>}
      {variantModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>اختر متغير لـ {variantModal.product.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {variantModal.product.variants.map((v) => (
                  <div key={v.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="text-sm font-medium">{v.label}</span>
                      <span className="text-sm font-semibold text-primary">{formatMoney(Number(v.price))}</span>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => variantModal.onConfirm(v.id, 1)}>
                      إضافة
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={() => setVariantModal(null)}>إلغاء</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {addProductModal && (
        <div role="dialog" aria-modal="true" aria-label="إضافة صنف" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4" dir="rtl">
          <Card className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden sm:max-w-2xl">
            <CardHeader className="flex-row items-center justify-between border-b">
              <div>
                <CardTitle>إضافة صنف للفاتورة {invoice.number}</CardTitle>
                <p className="text-xs text-muted-foreground">ابحث عن صنف واختر المتغير والكمية</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAddProductModal(false)}>إغلاق</Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input icon="search" value={addProductSearch} onChange={(e) => setAddProductSearch(e.target.value)} placeholder="ابحث عن صنف…" aria-label="بحث الأصناف" />
                  <select value={addProductCategory} onChange={(e) => setAddProductCategory(e.target.value)} className="h-10 rounded border bg-background px-3 text-sm">
                    <option value="all">جميع الأقسام</option>
                    {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredAddProducts.length === 0 ? (
                    <p className="col-span-full text-center text-sm text-muted-foreground py-4">لا توجد أصناف مطابقة</p>
                  ) : (
                    filteredAddProducts.map((p) => {
                      const isSelected = addProductSelected?.id === p.id
                      return (
                        <button key={p.id} type="button" onClick={() => { setAddProductSelected(p); setAddProductQty(1) }} className={cn('flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-colors', isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/40', !p.isAvailable ? 'opacity-50 cursor-not-allowed' : '')} disabled={!p.isAvailable}>
                          <span className="break-words text-sm font-medium text-foreground">{p.name}</span>
                          {p.variants && p.variants.length > 0 ? <span className="text-xs text-muted-foreground">اختر متغير</span> : <span className="text-xs text-muted-foreground">{p.categoryName ?? ''}</span>}
                          <span className="text-sm font-semibold text-primary">{formatMoney(Number(p.price))}</span>
                          {!p.isAvailable ? <Badge tone="muted" className="mt-1">غير متوفر</Badge> : null}
                          {isSelected ? <Badge tone="primary" className="mt-1 text-[10px]">محدد</Badge> : null}
                        </button>
                      )
                    })
                  )}
                </div>
                {addProductSelected && (
                  <div className="mt-4 rounded-lg border p-3">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-medium">{addProductSelected?.name}</p>
                        {addProductSelected?.variants && addProductSelected.variants.length > 0 ? <p className="text-xs text-muted-foreground">المتغيرات المتاحة:</p> : null}
                      </div>
                      <span className="text-sm font-semibold text-primary">{formatMoney(Number(addProductSelected?.price ?? 0))}</span>
                    </div>
                    {addProductSelected?.variants && addProductSelected.variants.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        <label className="text-xs font-medium text-muted-foreground block mb-1">المتغير *</label>
                        <select value={addProductVariantId ?? ''} onChange={(e) => setAddProductVariantId(e.target.value)} className="h-10 w-full rounded border bg-background px-3 text-sm">
                          <option value="">اختر المتغير</option>
                          {addProductSelected.variants.map((v) => <option key={v.id} value={v.id}>{v.label} — {formatMoney(Number(v.price))}</option>)}
                        </select>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted-foreground">الكمية</label>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => setAddProductQty((q) => Math.max(1, q - 1))}>−</Button>
                        <input type="number" min={1} max={99} value={addProductQty} onChange={(e) => setAddProductQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className="w-16 h-9 rounded border bg-background px-2 text-center" readOnly />
                        <Button variant="outline" size="sm" onClick={() => setAddProductQty((q) => Math.min(99, q + 1))}>+</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            <div className="shrink-0 border-t bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{addProductSelected ? `${addProductQty} × ${formatMoney(Number(addProductSelected.price))} = ${formatMoney(Number(addProductSelected.price) * addProductQty)}` : 'اختر صنفاً لإضافته'}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setAddProductModal(false)}>إلغاء</Button>
                  <Button disabled={!addProductSelected || ((addProductSelected?.variants?.length ?? 0) > 0 && !addProductVariantId)} onClick={() => {
                    if (!addProductSelected) return
                    const hasVariants = (addProductSelected.variants?.length ?? 0) > 0
                    if (hasVariants && !addProductVariantId) return
                    edit({ action: 'add', productId: addProductSelected.id, variantId: hasVariants ? addProductVariantId : undefined, quantity: addProductQty })
                    setAddProductModal(false)
                    setAddProductSelected(null)
                    setAddProductVariantId(undefined)
                    setAddProductQty(1)
                  }} className="w-auto">
                    إضافة للفاتورة
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Card>
  }

function LegacyInvoiceEditor({ invoice, products, editable, pending, received, method, reason, setReceived, setMethod, setReason, edit, collect, cancel, onPrint, modal = false }: { invoice: InvoiceRow; products: { id: string; name: string; price: string; variants?: { id: string; label: string; price: string }[] }[]; editable: boolean; pending: boolean; received: string; method: string; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; collect: () => void; cancel: () => void; onPrint: () => void; modal?: boolean }) {
 const cancellable = (invoice.status === 'new' || invoice.status === 'preparing') && Number(invoice.paid) === 0
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState(invoice.notes ?? '')
  const [financialNotice, setFinancialNotice] = useState<string | null>(null)
  function applyFinancials() { if (!editable) return; const val = discountValue.trim(); if (discountType === 'none') { setFinancialNotice(null); edit({ action: 'financials', discountType: 'none', discountValue: '0', notes: invoiceNotes.trim() || null }); return } const value = Number(val); if (!Number.isFinite(value) || value < 0) { setFinancialNotice('قيمة الخصم غير صحيحة'); return } setFinancialNotice(null); edit({ action: 'financials', discountType, discountValue: val, notes: invoiceNotes.trim() || null }) }
 return <Card className={modal ? 'border-0 p-0 shadow-none' : 'p-4'}>{!modal && <div className="mb-3 flex justify-between"><div><h3 className="font-bold">{invoice.number}</h3><p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)} · {invoice.creator ?? '—'}</p></div><span>{invoice.status}</span></div>}<div className="space-y-2">{invoice.items.map(item => <div key={item.id} className="flex items-center justify-between gap-2 border-b py-2"><span>{item.name} × {item.quantity}</span><span>{money(item.lineTotal)}</span>{editable && <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>−</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button></div>}</div>)}</div>{editable && <select className="mt-3 w-full rounded-lg border p-2 text-sm" defaultValue="" onChange={e => { if (e.target.value) { edit({ action: 'add', productId: e.target.value, quantity: 1 }); e.currentTarget.value = '' } }}><option value="">إضافة صنف من الكتالوج…</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}</select>}<Totals invoice={invoice} />{editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-100 p-3"><div className="flex gap-2"><select value={discountType} onChange={e => setDiscountType(e.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border p-2 text-sm"><option value="none">بدون خصم</option><option value="percentage">نسبة مئوية (%)</option><option value="amount">مبلغ ثابت</option></select><Input value={discountValue} onChange={e => setDiscountValue(e.target.value)} inputMode="decimal" placeholder="قيمة الخصم" className="rounded-lg border p-2 text-sm" /></div><Input value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} placeholder="ملاحظات على الفاتورة…" className="rounded-lg border p-2 text-sm w-full" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>تطبيق الخصم والملاحظات</Button></div>}{(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={e => setMethod(e.target.value)} className="rounded-lg border p-2"><option value="cash">نقدي</option><option value="mobile_wallet">محفظة إلكترونية</option><option value="instapay">انستا باي</option></select><Input value={received} onChange={e => setReceived(e.target.value)} inputMode="decimal" placeholder={`المستلم (المطلوب ${invoice.remaining})`} /><Button disabled={pending} onClick={collect}>تحصيل</Button><Button variant="secondary" onClick={onPrint}>طباعة / معاينة</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب الإلغاء (مطلوب)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>إلغاء الفاتورة</Button></div>}</div>}</Card>
}

function Totals({ invoice }: { invoice: InvoiceRow }) { return <div className="mt-4 space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>إجمالي الأصناف</span><span>{money(invoice.subtotal)}</span></div><div className="flex justify-between"><span>الخصم</span><span>{Number(invoice.discount) > 0 ? `-${money(invoice.discount)}` : money(0)}</span></div><div className="flex justify-between"><span>الضريبة</span><span>{money(invoice.tax)}</span></div><div className="flex justify-between font-bold"><span>الإجمالي النهائي</span><strong>{money(invoice.total)}</strong></div><div className="flex justify-between"><span>المدفوع</span><span>{money(invoice.paid)}</span></div><div className="flex justify-between font-bold text-primary"><span>المتبقي</span><span>{money(invoice.remaining)}</span></div></div> }
