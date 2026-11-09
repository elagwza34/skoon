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
  | { action: 'add'; productId: string; variantId?: string; quantity: number; idempotencyKey?: string; modifierSelections?: { groupId: string; valueIds: string[] }[] }
  | { action: 'quantity'; orderItemId: string; quantity: number; idempotencyKey?: string; expectedUpdatedAt?: string; reason?: string }
  | { action: 'line_discount'; orderItemId: string; discountType: 'percentage' | 'amount' | 'none'; discountValue: string; eligibleForInvoiceDiscount: boolean }
  | { action: 'financials'; discountType: 'percentage' | 'amount' | 'none'; discountValue: string | number; notes: string | null }
  | { action: 'item_config'; orderItemId: string; variantId?: string | null; modifierSelections?: { groupId: string; valueIds: string[] }[]; expectedUpdatedAt: string; reason: string; idempotencyKey?: string }

const money = (value: number | string) => formatMoney(Number(value))
const dateTime = (value: string) => { const date = new Date(value); const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date); return `${formatDateShort(date)} ${time}` }
const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export function InvoiceBoard({ invoices, products, categories, defaultTab = 'open', workspace = false, initialOrderId }: {
  invoices: InvoiceRow[]; products: { id: string; name: string; price: string; categoryId?: string; isAvailable?: boolean; categoryName?: string; variants?: { id: string; label: string; price: string }[]; modifierGroups?: { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; options: { id: string; label: string; priceAdjustment: string }[] }[] }[]; categories?: { id: string; name: string }[]; defaultTab?: InvoiceTab; workspace?: boolean; initialOrderId?: string
}) {
  const router = useRouter(); const [query, setQuery] = useState(''); const [selectedId, setSelectedId] = useState<string | null>(initialOrderId ?? null)
  const [tableFilter, setTableFilter] = useState('all')
  const [preview, setPreview] = useState<ReceiptPreviewState | null>(null); const [received, setReceived] = useState(''); const [method, setMethod] = useState('cash'); const [electronicPaymentConfirmed, setElectronicPaymentConfirmed] = useState(false); const [receivedNotice, setReceivedNotice] = useState<string | null>(null)
  const [externalTransactionReference, setExternalTransactionReference] = useState('')
  const [confirmationNote, setConfirmationNote] = useState('')
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
			setReceivedNotice('يرجى إدخال مبلغ الاستلام لتغطية المبلغ المتبقي للفاتورة');
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
    setExternalTransactionReference('')
    setConfirmationNote('')
    setReason('')
    setDiscountType('none')
    setDiscountValue('')
    setInvoiceNotes(invoice.notes ?? '')
  }
  function closeSettlement() { if (!pending) setSelectedId(null) }
  function edit(input: InvoiceEditInput) { if (!selected) return; startTransition(async () => { const payload = { ...input } as any; if (!payload.idempotencyKey) payload.idempotencyKey = key(); if (payload.action === "quantity") { const item = selected.items.find((i:any) => i.id === payload.orderItemId); if (!payload.expectedUpdatedAt && item?.updatedAt) payload.expectedUpdatedAt = item.updatedAt; if (!payload.reason) payload.reason = "تعديل الكمية"; } const response = await fetch(`/api/staff/invoices/${selected.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'Idempotency-Key': payload.idempotencyKey }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); refresh(response.ok ? 'تم حفظ الفاتورة بنجاح.' : body.error ?? 'فشل حفظ الفاتورة.') }) }
  function removeItem(item: InvoiceRow['items'][number]) {
    if (!selected || pending) return
    const removalReason = window.prompt(`سبب إزالة الصنف ${item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name}`, 'سبب الإزالة')?.trim()
    if (!removalReason || removalReason.length < 3) return setNotice('سبب إزالة الفاتورة يجب أن يكون 3 أحرف على الأقل.')
    if (!window.confirm(`تأكيد إزالة الفاتورة رقم ${selected.number}؟`)) return
    if (selected.items.length === 1) return cancel(removalReason)
    startTransition(async () => {
      const response = await fetch(`/api/staff/orders/${selected.id}/items/${item.id}/void`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key() }, body: JSON.stringify({ reason: removalReason }) })
      const body = await response.json().catch(() => ({}))
      refresh(response.ok ? 'تم إزالة الصنف من الفاتورة بنجاح وتحديث المبلغ المستحق.' : body.error ?? 'فشل إزالة الفاتورة.')
    })
  }
  function collect() { if (!selected) return; const isNonCash = method !== 'cash'; const amount = isNonCash ? Number(selected.remaining) : (received ? Number(received) : 0); if (!isNonCash && (!received || amount <= 0)) { setNotice('يرجى إدخال مبلغ الاستلام لتغطية المبلغ المتبقي للفاتورة'); return } if (isNonCash && !electronicPaymentConfirmed) { setNotice('يرجى تأكيد استلام الدفع الإلكتروني قبل المتابعة.'); return } if (isNonCash && !externalTransactionReference) { setNotice('يرجى إدخال مرجع المعاملة الخارجية للدفع الإلكتروني.'); return }; startTransition(async () => { const invoice = selected; const payload = buildPaymentRequestPayload(method, String(amount), electronicPaymentConfirmed, externalTransactionReference, confirmationNote); const response = await fetch(`/api/staff/orders/${invoice.id}/pay`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key() }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) return setNotice(body.error ?? 'فشل تحصيل الدفع.');
const persistedInvoice = receiptInvoiceForSettlement(invoice.id, body.invoice as InvoiceRow | undefined);
if (!persistedInvoice) return setNotice('الفاتورة المسددة غير موجودة أو فشل جلب بيانات الفاتورة المسددة.');
setReceipt({ paid: body.receivedAmount ?? body.amount ?? persistedInvoice.paid, remaining: '0', change: body.changeAmount ?? '0', method: body.method ?? method, invoice: persistedInvoice });
setReceived(''); setElectronicPaymentConfirmed(false); setSelectedId(null);
if (isNonCash) { setPreview({ invoice: persistedInvoice, autoPrint: true, payment: { paid: body.receivedAmount ?? body.amount ?? persistedInvoice.paid, change: '0', method: body.method ?? method } }); } else { refresh('تم تحصيل الفاتورة بنجاح.') } }) }
  function cancel(reasonOverride?: string) { const cancellationReason = reasonOverride?.trim() || reason.trim(); if (!selected || !cancellationReason) return setNotice('سبب الإلغاء مطلوب.'); startTransition(async () => { const response = await fetch(`/api/staff/orders/${selected.id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'cancelled', reason: cancellationReason }) }); const body = await response.json().catch(() => ({})); if (response.ok) { setReason(''); setSelectedId(null); refresh('تم إلغاء الفاتورة بنجاح وتحرير الطاولة.') } else setNotice(body.error ?? 'فشل إلغاء الفاتورة.') }) }
  return <Card className="w-full p-4" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{defaultTab === 'paid' ? 'الفواتير المدفوعة' : defaultTab === 'cancelled' ? 'الفواتير الملغاة' : 'الفواتير المفتوحة'}</h2><p className="text-sm text-muted-foreground">عرض الفواتير حسب الحالة. اختر فاتورة لعرض التفاصيل أو تسجيل الدفع.</p></div>{defaultTab === 'paid' && <Button variant="secondary" onClick={() => window.location.assign('/api/staff/invoices?format=csv')}>تصدير CSV</Button>}</div>
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم الفاتورة أو اسم الصانع" className="mb-4" />
    {defaultTab === 'open' && (
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={tableFilter}
          onChange={(event) => setTableFilter(event.target.value)}
          className="rounded-lg border bg-background p-2 text-sm min-w-[160px]"
          aria-label="اختيار طاولة الفاتورة"
        >
          <option value="all">جميع الطاولات</option>
          {tableOptions.filter((t) => t !== 'all').map((t) => (
            <option key={t} value={t}>{t === 'غير محددة' ? 'غير محددة' : `طاولة ${t}`}</option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">{rows.length} فاتورة مختارة حالياً</p>
      </div>
    )}
    {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
    {readonlyList ? <InvoiceList rows={rows} tab={defaultTab} onPreview={(invoice) => setPreview({ invoice, autoPrint: true })} /> : <InvoiceList rows={rows} tab="open" selectedId={selected?.id} onSelect={openSettlement} />}
    {selected && <InvoiceSettlementModal invoice={selected} products={products} categories={categories} editable={editable} pending={pending} received={received} method={method} electronicPaymentConfirmed={electronicPaymentConfirmed} externalTransactionReference={externalTransactionReference} confirmationNote={confirmationNote} reason={reason} setReceived={setReceived} setMethod={(next) => { setMethod(next); setElectronicPaymentConfirmed(false); if (next !== 'cash') setReceived('') }} setElectronicPaymentConfirmed={setElectronicPaymentConfirmed} setExternalTransactionReference={setExternalTransactionReference} setConfirmationNote={setConfirmationNote} setReason={setReason} edit={edit} removeItem={removeItem} collect={collect} cancel={() => cancel()} onPrint={() => setPreview({ invoice: selected, autoPrint: true })} onClose={closeSettlement} />}
    {preview && <ThermalReceiptPreview invoice={preview.invoice} payment={preview.payment} autoPrint={preview.autoPrint} onClose={() => setPreview(null)} />}
    {receipt && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-sm p-5" dir="rtl"><h3 className="font-bold">الفاتورة المسددة</h3><p>طريقة الدفع: {receipt.method}</p><p>المبلغ المدفوع: {money(receipt.paid)}</p><p>الباقي المتبقي: {money(receipt.change)}</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setPreview({ invoice: receipt.invoice, autoPrint: true, payment: receipt }); setReceipt(null) }}>طباعة الفاتورة المسددة</Button><Button onClick={() => setReceipt(null)}>إغلاق</Button></div></Card></div>}
  </Card>
}

function InvoiceList({ rows, tab, selectedId, onSelect, onPreview }: { rows: InvoiceRow[]; tab: InvoiceTab; selectedId?: string; onSelect?: (invoice: InvoiceRow) => void; onPreview?: (invoice: InvoiceRow) => void }) {
  if (!rows.length) return <EmptyState title="لا توجد فواتير" description="لا توجد فواتير مطابقة للبحث الحالي." />
      return <div className={tab === 'open' ? 'space-y-2' : 'overflow-x-auto'}>{tab === 'open' ? rows.map((invoice) => <button key={invoice.id} onClick={() => onSelect?.(invoice)} className={`w-full rounded-xl border p-3 text-right ${selectedId === invoice.id ? 'border-primary bg-accent/40' : 'border-border bg-card'}`}><div className="flex justify-between gap-3"><strong>{invoice.number}</strong><span>{money(invoice.total)}</span></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{invoice.creator ?? 'ΓÇö'} ┬╖ {dateTime(invoice.createdAt)}</span><span>{invoice.table ? `طاولة ${invoice.table}` : 'غير محددة'} · المتبقي {money(invoice.remaining)}</span></div></button>) : <table className="w-full min-w-[760px] text-right text-sm"><thead className="border-b text-muted-foreground"><tr><th className="p-3">رقم الفاتورة</th><th>تاريخ الإنشاء</th><th>طاولة</th><th>صانع</th><th>المبلغ</th><th>طريقة الدفع</th><th>الحالة</th></tr></thead><tbody>{rows.map((invoice) => <tr key={invoice.id} className="border-b border-border/60"><td className="p-3 font-medium">{invoice.number}</td><td>{dateTime(invoice.createdAt)}</td><td>{invoice.table}</td><td>{invoice.creator ?? '—'}</td><td>{money(invoice.total)}</td><td>{tab === 'paid' ? invoice.payments.map(p => p.method).join(' / ') || '—' : '—'}</td><td><Button size="sm" variant="outline" onClick={() => onPreview?.(invoice)}>طباعة</Button></td></tr>)}</tbody></table>}</div>
}

function InvoiceSettlementModal({ invoice, products, categories, editable, pending, received, method, electronicPaymentConfirmed, externalTransactionReference, confirmationNote, reason, setReceived, setMethod, setElectronicPaymentConfirmed, setExternalTransactionReference, setConfirmationNote, setReason, edit, removeItem, collect, cancel, onPrint, onClose }: { invoice: InvoiceRow; products: { id: string; name: string; price: string; categoryId?: string; isAvailable?: boolean; categoryName?: string; variants?: { id: string; label: string; price: string }[]; modifierGroups?: { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; options: { id: string; label: string; priceAdjustment: string }[] }[] }[]; categories?: { id: string; name: string }[]; editable: boolean; pending: boolean; received: string; method: string; electronicPaymentConfirmed: boolean; externalTransactionReference: string; confirmationNote: string; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setElectronicPaymentConfirmed: (v: boolean) => void; setExternalTransactionReference: (v: string) => void; setConfirmationNote: (v: string) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; removeItem: (item: InvoiceRow['items'][number]) => void; collect: () => void; cancel: () => void; onPrint: () => void; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="invoice-settlement-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" dir="rtl">
    <Card className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl">
      <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <div className="min-w-0"><h2 id="invoice-settlement-title" className="truncate text-lg font-bold">تفاصيل الفاتورة {invoice.number}</h2><p className="truncate text-xs text-muted-foreground">{dateTime(invoice.createdAt)} · {invoice.creator ?? '—'} · {invoice.status} · {invoice.table ? `طاولة ${invoice.table}` : 'غير محددة'}</p></div>
        <Button variant="ghost" disabled={pending} onClick={onClose}>إغلاق</Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"><InvoiceEditor invoice={invoice} products={products} categories={categories} editable={editable} pending={pending} received={received} method={method} electronicPaymentConfirmed={electronicPaymentConfirmed} externalTransactionReference={externalTransactionReference} confirmationNote={confirmationNote} reason={reason} setReceived={setReceived} setMethod={setMethod} setElectronicPaymentConfirmed={setElectronicPaymentConfirmed} setExternalTransactionReference={setExternalTransactionReference} setConfirmationNote={setConfirmationNote} setReason={setReason} edit={edit} removeItem={removeItem} collect={collect} cancel={cancel} onPrint={onPrint} modal /></div>
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
    if (type !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) { setError('يرجى إدخال قيمة خصم صحيحة'); return }
    if (type === 'percentage' && !/^\d+$/.test(value.trim())) { setError('النسبة المئوية يجب أن تكون رقماً صحيحاً'); return }
    setError(null)
    edit({ action: 'line_discount', orderItemId: item.id, discountType: type, discountValue: type === 'none' ? '0' : value.trim(), eligibleForInvoiceDiscount: eligible })
  }
  return <Card className="border border-amber-200/70 p-3" dir="rtl"><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">خصم على الصنف</h3><span className="text-xs text-muted-foreground">يُحسب قبل خصم الفاتورة</span></div><div className="grid gap-2 sm:grid-cols-4"><select value={item.id} onChange={(event) => { const next = items.find((candidate) => candidate.id === event.target.value); setItemId(event.target.value); setType(next?.discountType ?? 'none'); setValue(next?.discountType ? next.discountValue : ''); setEligible(next?.eligibleForInvoiceDiscount ?? true) }} className="rounded-lg border bg-background p-2 text-sm">{items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">بدون خصم</option><option value="percentage">نسبة مئوية (%)</option><option value="amount">مبلغ ثابت</option></select><Input value={value} disabled={type === 'none'} onChange={(event) => setValue(event.target.value)} inputMode="decimal" placeholder="قيمة الخصم" /><Button disabled={pending} onClick={save}>حفظ خصم الصنف</Button></div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={eligible} onChange={(event) => setEligible(event.target.checked)} />يشمل في الخصم العام للفاتورة</label>{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</Card>
}

function InvoiceLineEditor({ item, editable, pending, edit, removeItem, products }: { item: InvoiceRow['items'][number]; editable: boolean; pending: boolean; edit: (input: InvoiceEditInput) => void; removeItem: (item: InvoiceRow['items'][number]) => void; products: { id: string; name: string; price: string; variants?: { id: string; label: string; price: string }[]; modifierGroups?: { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; options: { id: string; label: string; priceAdjustment: string }[] }[] }[] }) {
  const product = products.find((p) => p.id === item.productId)
  const [configOpen, setConfigOpen] = useState(false)
  const [cfgVariantId, setCfgVariantId] = useState<string>(item.variantId ?? '')
  const [cfgMods, setCfgMods] = useState<Record<string, string[]>>(() => { const snap = item.optionsSnapshot as any; const out: Record<string, string[]> = {}; for (const g of snap?.groups ?? []) { const gid = String(g.groupId ?? ''); const oid = String(g.optionId ?? ''); if(gid&&oid)(out[gid] ??= []).push(oid) } return out })
  const canEditConfig = !!product && ((product.variants?.length ?? 0) > 0 || (product.modifierGroups?.length ?? 0) > 0) && !pending && (item.preparedQuantity ?? 0) === 0 && (item.servedQuantity ?? 0) === 0
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>(item.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(item.discountType ? item.discountValue : '')
  const [eligibleForInvoiceDiscount, setEligibleForInvoiceDiscount] = useState(item.eligibleForInvoiceDiscount)
  const [error, setError] = useState<string | null>(null)
  function applyItemDiscount() {
    if (discountType !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(discountValue.trim())) { setError('يرجى إدخال قيمة خصم صحيحة'); return }
    if (discountType === 'percentage' && !/^\d+$/.test(discountValue.trim())) { setError('النسبة المئوية يجب أن تكون رقماً صحيحاً'); return }
    setError(null)
    edit({ action: 'line_discount', orderItemId: item.id, discountType, discountValue: discountType === 'none' ? '0' : discountValue.trim(), eligibleForInvoiceDiscount })
  }
  return <div className="grid gap-2 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name}</p>{item.details?.length ? <p className="text-xs text-muted-foreground">{item.details.join(' · ')}</p> : null}<p className="text-xs text-muted-foreground" dir="ltr">{item.quantity} × {money(item.unitPrice)}</p></div><strong className="shrink-0">{money(item.lineTotal)}</strong></div>{Number(item.discountAmount) > 0 ? <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">خصم على الصنف: -{money(item.discountAmount)}</p> : null}</div>
    {editable && <div className="flex flex-wrap items-center gap-1.5"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="h-8 rounded border bg-background px-1 text-xs"><option value="none">بدون خصم</option><option value="percentage">نسبة %</option><option value="amount">مبلغ</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="القيمة" className="h-8 w-20 text-xs" /><label className="flex items-center gap-1 whitespace-nowrap text-[11px]"><input type="checkbox" checked={eligibleForInvoiceDiscount} onChange={(event) => setEligibleForInvoiceDiscount(event.target.checked)} />يشمل في الخصم العام</label><Button size="sm" variant="secondary" disabled={pending} onClick={applyItemDiscount}>تطبيق</Button><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>−</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button><Button size="sm" variant="secondary" disabled={!canEditConfig} onClick={() => { if(!product) return; setCfgVariantId(item.variantId ?? ''); const snap=item.optionsSnapshot as any; const out: Record<string,string[]>={}; for(const g of snap?.groups??[]){const gid=String(g.groupId??'');const oid=String(g.optionId??''); if(gid&&oid)(out[gid]??=[]).push(oid)} setCfgMods(out); setConfigOpen(true) }}>المتغير/الإضافات</Button><Button size="sm" variant="destructive" disabled={pending} onClick={() => removeItem(item)}>إزالة الصنف</Button>{error && <p className="basis-full text-xs text-destructive">{error}</p>}</div>}
    {configOpen && product && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" dir="rtl"><Card className="w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"><CardHeader className="border-b"><CardTitle>تعديل المتغير والإضافات — {item.name}</CardTitle></CardHeader><CardContent className="space-y-3 overflow-y-auto p-4">
      {(item.preparedQuantity ?? 0) > 0 || (item.servedQuantity ?? 0) > 0 ? <p className="text-sm text-destructive">لا يمكن تعديل صنف بدأ تحضيره أو قُدّم.</p> : null}
      {(product.variants?.length ?? 0) > 0 && <div className="space-y-1"><div className="flex items-center justify-between gap-2"><label className="text-xs font-medium text-muted-foreground">المتغير</label><button type="button" className="text-xs text-destructive hover:underline" onClick={() => setCfgVariantId('')}>حذف المتغير</button></div><select value={cfgVariantId} onChange={(e)=>setCfgVariantId(e.target.value)} className="h-10 w-full rounded border bg-background px-3 text-sm"><option value="">بدون/اختر</option>{(product.variants??[]).map(v=><option key={v.id} value={v.id}>{v.label} — {formatMoney(Number(v.price))}</option>)}</select></div>}
      {(product.modifierGroups ?? []).map((group) => {
        const selectedIds = cfgMods[group.id] ?? []; const max=Math.max(1,Number(group.maxSelections)||1); const min=group.isRequired?Math.max(1,Number(group.minSelections)||1):Math.max(0,Number(group.minSelections)||0)
        return <div key={group.id} className="rounded-lg border bg-muted/10 p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-medium">{group.name}{group.isRequired?' *':''}</p><span className="text-[11px] text-muted-foreground">{min===max?`عدد ${max}`:`من ${min} إلى ${max}`}</span></div><div className="flex flex-wrap gap-2">{group.options.map((opt)=>{const checked=selectedIds.includes(opt.id);return <button key={opt.id} type="button" onClick={()=>setCfgMods((prev)=>{const cur=prev[group.id]??[]; if(cur.includes(opt.id)) return {...prev,[group.id]:cur.filter(id=>id!==opt.id)}; if(max===1) return {...prev,[group.id]:[opt.id]}; if(cur.length>=max) return prev; return {...prev,[group.id]:[...cur,opt.id]}})} className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', checked?'border-primary bg-primary/10 text-primary':'border-border bg-background hover:bg-accent/40')}>{opt.label}{Number(opt.priceAdjustment)?` (+${formatMoney(Number(opt.priceAdjustment))})`:''}{checked?' ×':''}</button>})}</div>{selectedIds.length>0 && <button type="button" className="mt-2 text-xs text-destructive hover:underline" onClick={()=>setCfgMods((prev)=>({...prev,[group.id]:[]}))}>حذف اختيارات هذه الإضافات</button>}</div>
      })}
    </CardContent><div className="flex justify-end gap-2 border-t p-3"><Button variant="outline" onClick={()=>setConfigOpen(false)}>إلغاء</Button><Button disabled={pending || ((product.variants?.length??0)>0 && !cfgVariantId) || !(product.modifierGroups??[]).every(g=>{const c=(cfgMods[g.id]??[]).length;const min=g.isRequired?Math.max(1,Number(g.minSelections)||1):Math.max(0,Number(g.minSelections)||0);const max=Math.max(min,Number(g.maxSelections)||1);return c>=min&&c<=max})} onClick={()=>{const modifierSelections=Object.entries(cfgMods).filter(([,ids])=>ids.length).map(([groupId,valueIds])=>({groupId,valueIds})); edit({action:'item_config',orderItemId:item.id,variantId:(product.variants?.length??0)>0?(cfgVariantId||null):null,modifierSelections,expectedUpdatedAt:item.updatedAt,reason:'تعديل المتغير/الإضافات من نافذة الفاتورة',idempotencyKey:key()} as any); setConfigOpen(false)}}>حفظ التعديل</Button></div></Card></div>}
  </div>
}

function InvoiceEditor({ invoice, products, categories, editable, pending, received, method, electronicPaymentConfirmed, externalTransactionReference, confirmationNote, reason, setReceived, setMethod, setElectronicPaymentConfirmed, setExternalTransactionReference, setConfirmationNote, setReason, edit, removeItem, collect, cancel, onPrint, modal = false }: { invoice: InvoiceRow; products: { id: string; name: string; price: string; categoryId?: string; isAvailable?: boolean; categoryName?: string; variants?: { id: string; label: string; price: string }[]; modifierGroups?: { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; options: { id: string; label: string; priceAdjustment: string }[] }[] }[]; categories?: { id: string; name: string }[]; editable: boolean; pending: boolean; received: string; method: string; electronicPaymentConfirmed: boolean; externalTransactionReference: string; confirmationNote: string; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setElectronicPaymentConfirmed: (v: boolean) => void; setExternalTransactionReference: (v: string) => void; setConfirmationNote: (v: string) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; removeItem: (item: InvoiceRow['items'][number]) => void; collect: () => void; cancel: () => void; onPrint: () => void; modal?: boolean }) {
  const cancellable = (invoice.status === 'new' || invoice.status === 'preparing') && Number(invoice.paid) === 0
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>(invoice.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(invoice.discountType ? invoice.discountValue ?? '' : '')
  const [invoiceNotes, setInvoiceNotes] = useState(invoice.notes ?? '')
  const [financialNotice, setFinancialNotice] = useState<string | null>(null)
  const [variantModal, setVariantModal] = useState<{ product: { id: string; name: string; price: string; variants: { id: string; label: string; price: string }[] }; onConfirm: (variantId: string, qty: number) => void } | null>(null)
  const [addProductModal, setAddProductModal] = useState(false)
  const [addProductSearch, setAddProductSearch] = useState('')
  const [addProductCategory, setAddProductCategory] = useState('all')
  const [addProductSelected, setAddProductSelected] = useState<{ id: string; name: string; price: string; variants?: { id: string; label: string; price: string }[]; modifierGroups?: { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; options: { id: string; label: string; priceAdjustment: string }[] }[] } | null>(null)
  const [addProductQty, setAddProductQty] = useState(1)
  const [addProductVariantId, setAddProductVariantId] = useState<string | undefined>(undefined)
  const [addProductModifiers, setAddProductModifiers] = useState<Record<string, string[]>>({})
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
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(val)) { setFinancialNotice('يرجى إدخال قيمة خصم صحيحة'); return }
    if (discountType === 'percentage' && !/^\d+$/.test(val)) { setFinancialNotice('النسبة المئوية يجب أن تكون رقماً صحيحاً'); return }
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
    }).map((item) => <InvoiceLineEditor key={item.id} item={item} editable={editable} pending={pending} edit={edit} removeItem={removeItem} products={products} />)}</div>
    {editable && products.length > 0 && <Button type="button" className="w-full justify-between" onClick={() => { setAddProductSearch(''); setAddProductCategory('all'); setAddProductSelected(null); setAddProductQty(1); setAddProductModal(true) }}><Icon name="plus" size={16} /> إضافة صنف</Button>}
    <Totals invoice={invoice} />
    {editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-200/70 p-3"><div className="flex flex-wrap gap-2"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">بدون خصم للفاتورة</option><option value="percentage">نسبة مئوية (%)</option><option value="amount">مبلغ ثابت</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="قيمة خصم الفاتورة" className="max-w-44" /></div><Input value={invoiceNotes} onChange={(event) => setInvoiceNotes(event.target.value)} placeholder="ملاحظات الفاتورة..." />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>تطبيق خصم الفاتورة</Button></div>}
    {(editable || cancellable) && (
      <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>
        {editable && (
          <>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              className="rounded-lg border bg-background p-2"
              aria-label="طريقة الدفع"
            >
              <option value="cash">نقدي</option>
              <option value="mobile_wallet">محفظة إلكترونية</option>
              <option value="instapay">إنستا باي</option>
              <option value="card">بطاقة</option>
              <option value="online">أونلاين</option>
              <option value="electronic_wallet">محفظة إلكترونية</option>
              <option value="card_pos">بطاقة نقطة بيع</option>
            </select>
            {method === 'cash' ? (
              <Input
                value={received}
                onChange={(event) => setReceived(event.target.value)}
                inputMode="decimal"
                placeholder={`المبلغ المستلم (المطلوب ${invoice.remaining})`}
              />
            ) : (
              <div className="flex min-h-[120px] flex-col gap-2">
                <label className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={electronicPaymentConfirmed}
                    onChange={(event) => setElectronicPaymentConfirmed(event.target.checked)}
                    disabled={pending}
                  />
                  أؤكد استلام الدفع الإلكتروني بالقيمة النهائية للفاتورة
                </label>
                <Input
                  value={externalTransactionReference}
                  onChange={(event) => setExternalTransactionReference(event.target.value)}
                  placeholder="مرجع المعاملة الخارجية (مطلوب للدفع الإلكتروني)"
                  disabled={pending}
                />
                <Input
                  value={confirmationNote}
                  onChange={(event) => setConfirmationNote(event.target.value)}
                  placeholder="ملاحظة تأكيد اختيارية"
                  disabled={pending}
                />
              </div>
            )}
            <Button
              disabled={pending || (method !== 'cash' && (!electronicPaymentConfirmed || !externalTransactionReference))}
              onClick={collect}
            >
              تحصيل
            </Button>
            <Button variant="secondary" onClick={onPrint}>
              طباعة / معاينة
            </Button>
          </>
        )}
        {cancellable && (
          <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="سبب الإلغاء (مطلوب)"
            />
            <Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>
              إلغاء الفاتورة
            </Button>
          </div>
        )}
      </div>
    )}
      {variantModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>╪º╪«╪¬╪▒ ┘à╪¬╪║┘è╪▒ ┘ä┘Ç {variantModal.product.name}</CardTitle>
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
                      ╪Ñ╪╢╪º┘ü╪⌐
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={() => setVariantModal(null)}>╪Ñ┘ä╪║╪º╪í</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {addProductModal && (
        <div role="dialog" aria-modal="true" aria-label="إضافة صنف للفاتورة" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4" dir="rtl">
          <Card className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden sm:max-w-3xl">
            <CardHeader className="flex-row items-center justify-between gap-3 border-b">
              <div className="min-w-0">
                <CardTitle>إضافة صنف للفاتورة {invoice.number}</CardTitle>
                <p className="text-xs text-muted-foreground">اختر الصنف، المتغير، الإضافات، ثم الكمية.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAddProductModal(false)}>إغلاق</Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input icon="search" value={addProductSearch} onChange={(e) => setAddProductSearch(e.target.value)} placeholder="ابحث عن صنف…" aria-label="بحث الأصناف" />
                  <select value={addProductCategory} onChange={(e) => setAddProductCategory(e.target.value)} className="h-10 rounded border bg-background px-3 text-sm sm:col-span-2">
                    <option value="all">جميع الأقسام</option>
                    {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredAddProducts.length === 0 ? (
                    <p className="col-span-full py-4 text-center text-sm text-muted-foreground">لا توجد أصناف مطابقة</p>
                  ) : filteredAddProducts.map((p) => {
                    const isSelected = addProductSelected?.id === p.id
                    const hasMods = (p.modifierGroups?.length ?? 0) > 0
                    return (
                      <button key={p.id} type="button" disabled={!p.isAvailable} onClick={() => { setAddProductSelected(p as any); setAddProductVariantId(undefined); setAddProductQty(1); setAddProductModifiers({}) }} className={cn('flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-colors', isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:bg-accent/40', !p.isAvailable ? 'cursor-not-allowed opacity-50' : '')}>
                        <span className="break-words text-sm font-medium text-foreground">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.variants?.length ? 'يحتاج متغيرًا' : (p.categoryName ?? '')}{hasMods ? ' · إضافات' : ''}</span>
                        <span className="text-sm font-semibold text-primary">{formatMoney(Number(p.price))}</span>
                        {!p.isAvailable ? <Badge tone="muted" className="mt-1">غير متوفر</Badge> : isSelected ? <Badge tone="primary" className="mt-1 text-[10px]">محدد</Badge> : null}
                      </button>
                    )
                  })}
                </div>

﻿                  {addProductSelected && (
                  <div className="mt-2 space-y-3 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{addProductSelected.name}</p>
                        <p className="text-xs text-muted-foreground">اختر المتغير والإضافات إن وجدت.</p>
                      </div>
                      <span className="text-sm font-semibold text-primary">{formatMoney(Number(addProductSelected.price))}</span>
                    </div>
                    {(addProductSelected.variants?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2"><label className="block text-xs font-medium text-muted-foreground">المتغير *</label>{addProductVariantId && <button type="button" className="text-xs text-destructive hover:underline" onClick={() => setAddProductVariantId(undefined)}>حذف المتغير</button>}</div>
                        <select value={addProductVariantId ?? ''} onChange={(e) => setAddProductVariantId(e.target.value || undefined)} className="h-10 w-full rounded border bg-background px-3 text-sm">
                          <option value="">اختر المتغير</option>
                          {(addProductSelected.variants ?? []).map((v) => <option key={v.id} value={v.id}>{v.label} — {formatMoney(Number(v.price))}</option>)}
                        </select>
                      </div>
                    )}
                    {(addProductSelected.modifierGroups ?? []).map((group) => {
                      const selectedIds = addProductModifiers[group.id] ?? []
                      const max = Math.max(1, Number(group.maxSelections) || 1)
                      const min = group.isRequired ? Math.max(1, Number(group.minSelections) || 1) : Math.max(0, Number(group.minSelections) || 0)
                      return (
                        <div key={group.id} className="rounded-lg border bg-muted/10 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{group.name}{group.isRequired ? ' *' : ''}</p>
                            <span className="text-[11px] text-muted-foreground">{min === max ? `عدد ${max}` : `من ${min} إلى ${max}`}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.options.map((opt) => {
                              const checked = selectedIds.includes(opt.id)
                              return (
                                <button key={opt.id} type="button" onClick={() => setAddProductModifiers((prev) => {
                                  const cur = prev[group.id] ?? []
                                  if (cur.includes(opt.id)) return { ...prev, [group.id]: cur.filter((id) => id !== opt.id) }
                                  if (max === 1) return { ...prev, [group.id]: [opt.id] }
                                  if (cur.length >= max) return prev
                                  return { ...prev, [group.id]: [...cur, opt.id] }
                                })} className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', checked ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-accent/40')}>
                                  {opt.label}{Number(opt.priceAdjustment) ? ` (+${formatMoney(Number(opt.priceAdjustment))})` : ''}
                                  {checked ? ' ×' : ''}
                                </button>
                              )
                            })}
                          </div>
                          {selectedIds.length > 0 && <button type="button" className="mt-2 text-xs text-destructive underline-offset-2 hover:underline" onClick={() => setAddProductModifiers((prev) => ({ ...prev, [group.id]: [] }))}>حذف اختيارات هذه الإضافات</button>}
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted-foreground">الكمية</label>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => setAddProductQty((q) => Math.max(1, q - 1))}>−</Button>
                        <input type="number" min={1} max={99} value={addProductQty} onChange={(e) => setAddProductQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className="h-9 w-16 rounded border bg-background px-2 text-center" readOnly />
                        <Button variant="outline" size="sm" onClick={() => setAddProductQty((q) => Math.min(99, q + 1))}>+</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            <div className="shrink-0 border-t bg-card p-3">
              {(() => {
                const groups = addProductSelected?.modifierGroups ?? []
                const modifiersValid = groups.every((g) => { const c = (addProductModifiers[g.id] ?? []).length; const min = g.isRequired ? Math.max(1, Number(g.minSelections) || 1) : Math.max(0, Number(g.minSelections) || 0); const max = Math.max(min, Number(g.maxSelections) || 1); return c >= min && c <= max })
                const hasVariants = (addProductSelected?.variants?.length ?? 0) > 0
                const canAdd = !!addProductSelected && (!hasVariants || !!addProductVariantId) && modifiersValid && !pending
                const modifierSelections = Object.entries(addProductModifiers).filter(([, ids]) => ids.length).map(([groupId, valueIds]) => ({ groupId, valueIds }))
                return (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">{addProductSelected ? `${addProductQty} × ${addProductSelected.name}` : 'اختر صنفًا للإضافة'}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setAddProductModal(false)}>إلغاء</Button>
                      <Button disabled={!canAdd} onClick={() => {
                        if (!addProductSelected || !canAdd) return
                        edit({ action: 'add', productId: addProductSelected.id, variantId: hasVariants ? addProductVariantId : undefined, quantity: addProductQty, modifierSelections: modifierSelections.length ? modifierSelections : undefined } as any)
                        setAddProductModal(false); setAddProductSelected(null); setAddProductVariantId(undefined); setAddProductQty(1); setAddProductModifiers({})
                      }} className="w-auto">إضافة للفاتورة</Button>
                    </div>
                  </div>
                )
              })()}
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
  function applyFinancials() { if (!editable) return; const val = discountValue.trim(); if (discountType === 'none') { setFinancialNotice(null); edit({ action: 'financials', discountType: 'none', discountValue: '0', notes: invoiceNotes.trim() || null }); return } const value = Number(val); if (!Number.isFinite(value) || value < 0) { setFinancialNotice('┘é┘è┘à╪⌐ ╪º┘ä╪«╪╡┘à ╪║┘è╪▒ ╪╡╪¡┘è╪¡╪⌐'); return } setFinancialNotice(null); edit({ action: 'financials', discountType, discountValue: val, notes: invoiceNotes.trim() || null }) }
 return <Card className={modal ? 'border-0 p-0 shadow-none' : 'p-4'}>{!modal && <div className="mb-3 flex justify-between"><div><h3 className="font-bold">{invoice.number}</h3><p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)} ┬╖ {invoice.creator ?? 'ΓÇö'}</p></div><span>{invoice.status}</span></div>}<div className="space-y-2">{invoice.items.map(item => <div key={item.id} className="flex items-center justify-between gap-2 border-b py-2"><span>{item.name} ├ù {item.quantity}</span><span>{money(item.lineTotal)}</span>{editable && <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>ΓêÆ</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button></div>}</div>)}</div>{editable && <select className="mt-3 w-full rounded-lg border p-2 text-sm" defaultValue="" onChange={e => { if (e.target.value) { edit({ action: 'add', productId: e.target.value, quantity: 1 }); e.currentTarget.value = '' } }}><option value="">╪Ñ╪╢╪º┘ü╪⌐ ╪╡┘å┘ü ┘à┘å ╪º┘ä┘â╪¬╪º┘ä┘ê╪¼ΓÇª</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ΓÇö {money(p.price)}</option>)}</select>}<Totals invoice={invoice} />{editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-100 p-3"><div className="flex gap-2"><select value={discountType} onChange={e => setDiscountType(e.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border p-2 text-sm"><option value="none">╪¿╪»┘ê┘å ╪«╪╡┘à</option><option value="percentage">┘å╪│╪¿╪⌐ ┘à╪ª┘ê┘è╪⌐ (%)</option><option value="amount">┘à╪¿┘ä╪║ ╪½╪º╪¿╪¬</option></select><Input value={discountValue} onChange={e => setDiscountValue(e.target.value)} inputMode="decimal" placeholder="┘é┘è┘à╪⌐ ╪º┘ä╪«╪╡┘à" className="rounded-lg border p-2 text-sm" /></div><Input value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} placeholder="┘à┘ä╪º╪¡╪╕╪º╪¬ ╪╣┘ä┘ë ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐ΓÇª" className="rounded-lg border p-2 text-sm w-full" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>╪¬╪╖╪¿┘è┘é ╪º┘ä╪«╪╡┘à ┘ê╪º┘ä┘à┘ä╪º╪¡╪╕╪º╪¬</Button></div>}{(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={e => setMethod(e.target.value)} className="rounded-lg border p-2"><option value="cash">┘å┘é╪»┘è</option><option value="mobile_wallet">┘à╪¡┘ü╪╕╪⌐ ╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è╪⌐</option><option value="instapay">╪º┘å╪│╪¬╪º ╪¿╪º┘è</option></select><Input value={received} onChange={e => setReceived(e.target.value)} inputMode="decimal" placeholder={`╪º┘ä┘à╪│╪¬┘ä┘à (╪º┘ä┘à╪╖┘ä┘ê╪¿ ${invoice.remaining})`} /><Button disabled={pending} onClick={collect}>╪¬╪¡╪╡┘è┘ä</Button><Button variant="secondary" onClick={onPrint}>╪╖╪¿╪º╪╣╪⌐ / ┘à╪╣╪º┘è┘å╪⌐</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="╪│╪¿╪¿ ╪º┘ä╪Ñ┘ä╪║╪º╪í (┘à╪╖┘ä┘ê╪¿)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>╪Ñ┘ä╪║╪º╪í ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐</Button></div>}</div>}</Card>
}

function Totals({ invoice }: { invoice: InvoiceRow }) { return <div className="mt-4 space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>إجمالي الأصناف</span><span>{money(invoice.subtotal)}</span></div><div className="flex justify-between"><span>الخصم</span><span>{Number(invoice.discount) > 0 ? `-${money(invoice.discount)}` : money(0)}</span></div><div className="flex justify-between"><span>الضريبة</span><span>{money(invoice.tax)}</span></div><div className="flex justify-between font-bold"><span>المجموع النهائي</span><strong>{money(invoice.total)}</strong></div><div className="flex justify-between"><span>المدفوع</span><span>{money(invoice.paid)}</span></div><div className="flex justify-between font-bold text-primary"><span>المتبقي</span><span>{money(invoice.remaining)}</span></div></div> }
