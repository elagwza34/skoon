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
  | { action: 'add'; productId: string; variantId?: string; quantity: number; idempotencyKey?: string }
  | { action: 'quantity'; orderItemId: string; quantity: number; idempotencyKey?: string }
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
			setReceivedNotice('┘è╪¼╪¿ ╪Ñ╪»╪«╪º┘ä ╪º┘ä┘à╪¿┘ä╪║ ╪º┘ä┘à╪│╪¬┘ä┘à ┘é╪¿┘ä ╪º┘ä╪¬╪¡╪╡┘è┘ä');
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
  function edit(input: InvoiceEditInput) { if (!selected) return; startTransition(async () => { const payload = { ...input } as InvoiceEditInput & { idempotencyKey: string }; if (!payload.idempotencyKey) { payload.idempotencyKey = key(); } const response = await fetch(`/api/staff/invoices/${selected.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'Idempotency-Key': payload.idempotencyKey }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); refresh(response.ok ? '╪¬┘à ╪¡┘ü╪╕ ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐.' : body.error ?? '╪¬╪╣╪░╪▒ ╪¡┘ü╪╕ ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐.') }) }
  function removeItem(item: InvoiceRow['items'][number]) {
    if (!selected || pending) return
    const removalReason = window.prompt(`╪│╪¿╪¿ ╪Ñ╪▓╪º┘ä╪⌐ ${item.variantLabel ? `${item.name} ΓÇö ${item.variantLabel}` : item.name}`, '╪ú╪╢┘è┘ü ╪¿╪º┘ä╪«╪╖╪ú')?.trim()
    if (!removalReason || removalReason.length < 3) return setNotice('╪│╪¿╪¿ ╪Ñ╪▓╪º┘ä╪⌐ ╪º┘ä╪╡┘å┘ü ┘à╪╖┘ä┘ê╪¿ (3 ╪ú╪¡╪▒┘ü ╪╣┘ä┘ë ╪º┘ä╪ú┘é┘ä).')
    if (!window.confirm(`╪¬╪ú┘â┘è╪» ╪Ñ╪▓╪º┘ä╪⌐ ╪º┘ä╪╡┘å┘ü ┘à┘å ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐ ${selected.number}╪ƒ`)) return
    if (selected.items.length === 1) return cancel(removalReason)
    startTransition(async () => {
      const response = await fetch(`/api/staff/orders/${selected.id}/items/${item.id}/void`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key() }, body: JSON.stringify({ reason: removalReason }) })
      const body = await response.json().catch(() => ({}))
      refresh(response.ok ? '╪¬┘à╪¬ ╪Ñ╪▓╪º┘ä╪⌐ ╪º┘ä╪╡┘å┘ü ┘ê╪Ñ╪╣╪º╪»╪⌐ ╪º╪¡╪¬╪│╪º╪¿ ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐.' : body.error ?? '╪¬╪╣╪░╪▒ ╪Ñ╪▓╪º┘ä╪⌐ ╪º┘ä╪╡┘å┘ü.')
    })
  }
  function collect() { if (!selected) return; const isNonCash = method !== 'cash'; const amount = isNonCash ? Number(selected.remaining) : (received ? Number(received) : 0); if (!isNonCash && (!received || amount <= 0)) { setNotice('┘è╪¼╪¿ ╪Ñ╪»╪«╪º┘ä ╪º┘ä┘à╪¿┘ä╪║ ╪º┘ä┘à╪│╪¬┘ä┘à ┘é╪¿┘ä ╪º┘ä╪¬╪¡╪╡┘è┘ä'); return } if (isNonCash && !electronicPaymentConfirmed) { setNotice('┘è╪¼╪¿ ╪¬╪ú┘â┘è╪» ╪º╪│╪¬┘ä╪º┘à ╪º┘ä╪»┘ü╪╣ ╪º┘ä╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è ┘é╪¿┘ä ╪º┘ä╪¬╪¡╪╡┘è┘ä'); return }; startTransition(async () => { const invoice = selected; const payload = buildPaymentRequestPayload(method, String(amount), electronicPaymentConfirmed); const response = await fetch(`/api/staff/orders/${invoice.id}/pay`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key() }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) return setNotice(body.error ?? '╪¬╪╣╪░╪▒ ╪¬╪¡╪╡┘è┘ä ╪º┘ä╪»┘ü╪╣╪⌐.'); const persistedInvoice = receiptInvoiceForSettlement(invoice.id, body.invoice as InvoiceRow | undefined); if (!persistedInvoice) return setNotice('╪¬┘à ╪º┘ä╪¬╪¡╪╡┘è┘ä ┘ä┘â┘å ╪¬╪╣╪░╪▒ ╪¬╪¡┘à┘è┘ä ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐ ╪º┘ä┘à╪¡╪»╪½╪⌐ ┘ä┘ä╪╖╪¿╪º╪╣╪⌐.'); setReceipt({ paid: body.amount ?? persistedInvoice.paid, remaining: '0', change: body.changeAmount ?? '0', method: body.method ?? method, invoice: persistedInvoice }); setReceived(''); setElectronicPaymentConfirmed(false); setSelectedId(null); if (isNonCash) { setPreview({ invoice: persistedInvoice, autoPrint: true, payment: { paid: body.amount ?? persistedInvoice.paid, change: '0', method: body.method ?? method } }); } else { refresh('╪¬┘à ╪¬╪│╪¼┘è┘ä ╪º┘ä╪¬╪¡╪╡┘è┘ä.') } }) }
  function cancel(reasonOverride?: string) { const cancellationReason = reasonOverride?.trim() || reason.trim(); if (!selected || !cancellationReason) return setNotice('╪│╪¿╪¿ ╪º┘ä╪Ñ┘ä╪║╪º╪í ┘à╪╖┘ä┘ê╪¿.'); startTransition(async () => { const response = await fetch(`/api/staff/orders/${selected.id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'cancelled', reason: cancellationReason }) }); const body = await response.json().catch(() => ({})); if (response.ok) { setReason(''); setSelectedId(null); refresh('╪¬┘à ╪Ñ┘ä╪║╪º╪í ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐ ┘ê╪¬╪│╪¼┘è┘ä ╪º┘ä╪│╪¿╪¿.') } else setNotice(body.error ?? '╪¬╪╣╪░╪▒ ╪Ñ┘ä╪║╪º╪í ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐.') }) }
  return <Card className="w-full p-4" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{defaultTab === 'paid' ? '╪º┘ä┘ü┘ê╪º╪¬┘è╪▒ ╪º┘ä┘à╪¡╪╡┘ä╪⌐' : defaultTab === 'cancelled' ? '╪º┘ä┘ü┘ê╪º╪¬┘è╪▒ ╪º┘ä┘à┘ä╪║╪º╪⌐' : '╪º┘ä┘ü┘ê╪º╪¬┘è╪▒ ╪º┘ä┘à┘ü╪¬┘ê╪¡╪⌐'}</h2><p className="text-sm text-muted-foreground">╪¿┘è╪º┘å╪º╪¬ ╪¡┘è╪⌐ ┘à┘å ╪º┘ä╪╖┘ä╪¿╪º╪¬ ┘ê╪º┘ä╪¬╪¡╪╡┘è┘ä╪º╪¬ ╪º┘ä┘à╪│╪¼┘ä╪⌐.</p></div>{defaultTab === 'paid' && <Button variant="secondary" onClick={() => window.location.assign('/api/staff/invoices?format=csv')}>╪¬╪╡╪»┘è╪▒ CSV</Button>}</div>
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="╪º╪¿╪¡╪½ ╪¿╪▒┘é┘à ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐ ╪ú┘ê ╪º┘ä┘à┘å╪┤╪ª" className="mb-4" />
    {defaultTab === 'open' && (
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={tableFilter}
          onChange={(event) => setTableFilter(event.target.value)}
          className="rounded-lg border bg-background p-2 text-sm min-w-[160px]"
          aria-label="╪¬╪╡┘ü┘è╪⌐ ╪¡╪│╪¿ ╪º┘ä╪╖╪º┘ê┘ä╪⌐"
        >
          <option value="all">╪¼┘à┘è╪╣ ╪º┘ä╪╖╪º┘ê┘ä╪º╪¬</option>
          {tableOptions.filter((t) => t !== 'all').map((t) => (
            <option key={t} value={t}>{t === '╪¬┘è┘â ╪ú┘ê╪º┘è' ? '╪¬┘è┘â ╪ú┘ê╪º┘è' : `╪╖╪º┘ê┘ä╪⌐ ${t}`}</option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">{rows.length} ┘ü╪º╪¬┘ê╪▒╪⌐ ┘à╪╖╪º╪¿┘é╪⌐</p>
      </div>
    )}
    {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
    {readonlyList ? <InvoiceList rows={rows} tab={defaultTab} onPreview={(invoice) => setPreview({ invoice, autoPrint: true })} /> : <InvoiceList rows={rows} tab="open" selectedId={selected?.id} onSelect={openSettlement} />}
    {selected && <InvoiceSettlementModal invoice={selected} products={products} categories={categories} editable={editable} pending={pending} received={received} method={method} electronicPaymentConfirmed={electronicPaymentConfirmed} reason={reason} setReceived={setReceived} setMethod={(next) => { setMethod(next); setElectronicPaymentConfirmed(false); if (next !== 'cash') setReceived('') }} setElectronicPaymentConfirmed={setElectronicPaymentConfirmed} setReason={setReason} edit={edit} removeItem={removeItem} collect={collect} cancel={() => cancel()} onPrint={() => { if (method === 'cash' && (!received || Number(received) <= 0)) { setNotice('┘è╪¼╪¿ ╪Ñ╪»╪«╪º┘ä ╪º┘ä┘à╪¿┘ä╪║ ╪º┘ä┘à╪│╪¬┘ä┘à ┘é╪¿┘ä ╪º┘ä┘à╪╣╪º┘è┘å╪⌐ ╪ú┘ê ╪º┘ä╪╖╪¿╪º╪╣╪⌐'); return } setPreview({ invoice: selected, autoPrint: true }) }} onClose={closeSettlement} />}
    {preview && <ThermalReceiptPreview invoice={preview.invoice} payment={preview.payment} autoPrint={preview.autoPrint} onClose={() => setPreview(null)} />}
    {receipt && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-sm p-5" dir="rtl"><h3 className="font-bold">╪Ñ┘è╪╡╪º┘ä ╪º┘ä╪¬╪¡╪╡┘è┘ä</h3><p>╪º┘ä╪╖╪▒┘è┘é╪⌐: {receipt.method}</p><p>╪º┘ä┘à╪¡╪╡┘ä: {money(receipt.paid)}</p><p>╪º┘ä╪¿╪º┘é┘è ┘ä┘ä╪╣┘à┘è┘ä: {money(receipt.change)}</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setPreview({ invoice: receipt.invoice, autoPrint: true, payment: receipt }); setReceipt(null) }}>╪╖╪¿╪º╪╣╪⌐ ╪º┘ä╪Ñ┘è╪╡╪º┘ä</Button><Button onClick={() => setReceipt(null)}>╪Ñ╪║┘ä╪º┘é</Button></div></Card></div>}
  </Card>
}

function InvoiceList({ rows, tab, selectedId, onSelect, onPreview }: { rows: InvoiceRow[]; tab: InvoiceTab; selectedId?: string; onSelect?: (invoice: InvoiceRow) => void; onPreview?: (invoice: InvoiceRow) => void }) {
  if (!rows.length) return <EmptyState title="┘ä╪º ╪¬┘ê╪¼╪» ┘ü┘ê╪º╪¬┘è╪▒" description="┘ä╪º ╪¬┘ê╪¼╪» ╪│╪¼┘ä╪º╪¬ ┘à╪╖╪º╪¿┘é╪⌐ ┘ä┘ç╪░╪º ╪º┘ä┘é╪│┘à." />
      return <div className={tab === 'open' ? 'space-y-2' : 'overflow-x-auto'}>{tab === 'open' ? rows.map((invoice) => <button key={invoice.id} onClick={() => onSelect?.(invoice)} className={`w-full rounded-xl border p-3 text-right ${selectedId === invoice.id ? 'border-primary bg-accent/40' : 'border-border bg-card'}`}><div className="flex justify-between gap-3"><strong>{invoice.number}</strong><span>{money(invoice.total)}</span></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{invoice.creator ?? 'ΓÇö'} ┬╖ {dateTime(invoice.createdAt)}</span><span>{invoice.table ? `╪╖╪º┘ê┘ä╪⌐ ${invoice.table}` : '╪¬┘è┘â ╪ú┘ê╪º┘è'} ┬╖ ╪º┘ä┘à╪¬╪¿┘é┘è {money(invoice.remaining)}</span></div></button>) : <table className="w-full min-w-[760px] text-right text-sm"><thead className="border-b text-muted-foreground"><tr><th className="p-3">╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐</th><th>╪º┘ä╪¬╪º╪▒┘è╪«</th><th>╪º┘ä╪╖╪º┘ê┘ä╪⌐</th><th>╪º┘ä┘à┘å╪┤╪ª</th><th>╪º┘ä╪Ñ╪¼┘à╪º┘ä┘è</th><th>╪º┘ä╪¡╪º┘ä╪⌐</th><th>╪º┘ä╪Ñ╪¼╪▒╪º╪í</th></tr></thead><tbody>{rows.map((invoice) => <tr key={invoice.id} className="border-b border-border/60"><td className="p-3 font-medium">{invoice.number}</td><td>{dateTime(invoice.createdAt)}</td><td>{invoice.table}</td><td>{invoice.creator ?? 'ΓÇö'}</td><td>{money(invoice.total)}</td><td>{tab === 'paid' ? invoice.payments.map(p => p.method).join(' / ') || '┘à╪»┘ü┘ê╪╣╪⌐' : '┘à┘ä╪║╪º╪⌐'}</td><td><Button size="sm" variant="outline" onClick={() => onPreview?.(invoice)}>╪╖╪¿╪º╪╣╪⌐</Button></td></tr>)}</tbody></table>}</div>
}

function InvoiceSettlementModal({ invoice, products, categories, editable, pending, received, method, electronicPaymentConfirmed, reason, setReceived, setMethod, setElectronicPaymentConfirmed, setReason, edit, removeItem, collect, cancel, onPrint, onClose }: { invoice: InvoiceRow; products: { id: string; name: string; price: string; categoryId?: string; isAvailable?: boolean; categoryName?: string; variants?: { id: string; label: string; price: string }[] }[]; categories?: { id: string; name: string }[]; editable: boolean; pending: boolean; received: string; method: string; electronicPaymentConfirmed: boolean; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setElectronicPaymentConfirmed: (v: boolean) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; removeItem: (item: InvoiceRow['items'][number]) => void; collect: () => void; cancel: () => void; onPrint: () => void; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="invoice-settlement-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" dir="rtl">
    <Card className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl">
      <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <div className="min-w-0"><h2 id="invoice-settlement-title" className="truncate text-lg font-bold">╪¬┘é┘ü┘è┘ä ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐ {invoice.number}</h2><p className="truncate text-xs text-muted-foreground">{dateTime(invoice.createdAt)} ┬╖ {invoice.creator ?? 'ΓÇö'} ┬╖ {invoice.status} ┬╖ {invoice.table ? `╪╖╪º┘ê┘ä╪⌐ ${invoice.table}` : '╪¬┘è┘â ╪ú┘ê╪º┘è'}</p></div>
        <Button variant="ghost" disabled={pending} onClick={onClose}>╪Ñ╪║┘ä╪º┘é</Button>
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
    if (type !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) { setError('╪ú╪»╪«┘ä ┘é┘è┘à╪⌐ ╪«╪╡┘à ╪╡╪¡┘è╪¡╪⌐'); return }
    if (type === 'percentage' && !/^\d+$/.test(value.trim())) { setError('╪º┘ä┘å╪│╪¿╪⌐ ┘è╪¼╪¿ ╪ú┘å ╪¬┘â┘ê┘å ╪▒┘é┘à┘ï╪º ╪╡╪¡┘è╪¡┘ï╪º'); return }
    setError(null)
    edit({ action: 'line_discount', orderItemId: item.id, discountType: type, discountValue: type === 'none' ? '0' : value.trim(), eligibleForInvoiceDiscount: eligible })
  }
  return <Card className="border border-amber-200/70 p-3" dir="rtl"><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">╪«╪╡┘à ╪╡┘å┘ü</h3><span className="text-xs text-muted-foreground">┘è┘Å╪¡╪│╪¿ ┘é╪¿┘ä ╪«╪╡┘à ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐</span></div><div className="grid gap-2 sm:grid-cols-4"><select value={item.id} onChange={(event) => { const next = items.find((candidate) => candidate.id === event.target.value); setItemId(event.target.value); setType(next?.discountType ?? 'none'); setValue(next?.discountType ? next.discountValue : ''); setEligible(next?.eligibleForInvoiceDiscount ?? true) }} className="rounded-lg border bg-background p-2 text-sm">{items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">╪¿╪»┘ê┘å ╪«╪╡┘à</option><option value="percentage">┘å╪│╪¿╪⌐ ┘à╪ª┘ê┘è╪⌐ (%)</option><option value="amount">┘à╪¿┘ä╪║ ╪½╪º╪¿╪¬</option></select><Input value={value} disabled={type === 'none'} onChange={(event) => setValue(event.target.value)} inputMode="decimal" placeholder="┘é┘è┘à╪⌐ ╪º┘ä╪«╪╡┘à" /><Button disabled={pending} onClick={save}>╪¡┘ü╪╕ ╪«╪╡┘à ╪º┘ä╪╡┘å┘ü</Button></div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={eligible} onChange={(event) => setEligible(event.target.checked)} />┘è╪┤┘à┘ä┘ç ╪º┘ä╪«╪╡┘à ╪º┘ä╪╣╪º┘à ┘ä┘ä┘ü╪º╪¬┘ê╪▒╪⌐</label>{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</Card>
}

function InvoiceLineEditor({ item, editable, pending, edit, removeItem }: { item: InvoiceRow['items'][number]; editable: boolean; pending: boolean; edit: (input: InvoiceEditInput) => void; removeItem: (item: InvoiceRow['items'][number]) => void }) {
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>(item.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(item.discountType ? item.discountValue : '')
  const [eligibleForInvoiceDiscount, setEligibleForInvoiceDiscount] = useState(item.eligibleForInvoiceDiscount)
  const [error, setError] = useState<string | null>(null)
  function applyItemDiscount() {
    if (discountType !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(discountValue.trim())) { setError('╪ú╪»╪«┘ä ┘é┘è┘à╪⌐ ╪«╪╡┘à ╪╡╪¡┘è╪¡╪⌐'); return }
    if (discountType === 'percentage' && !/^\d+$/.test(discountValue.trim())) { setError('╪º┘ä┘å╪│╪¿╪⌐ ┘è╪¼╪¿ ╪ú┘å ╪¬┘â┘ê┘å ╪▒┘é┘à┘ï╪º ╪╡╪¡┘è╪¡┘ï╪º'); return }
    setError(null)
    edit({ action: 'line_discount', orderItemId: item.id, discountType, discountValue: discountType === 'none' ? '0' : discountValue.trim(), eligibleForInvoiceDiscount })
  }
  return <div className="grid gap-2 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{item.variantLabel ? `${item.name} ΓÇö ${item.variantLabel}` : item.name}</p>{item.details?.length ? <p className="text-xs text-muted-foreground">{item.details.join(' ┬╖ ')}</p> : null}<p className="text-xs text-muted-foreground" dir="ltr">{item.quantity} ├ù {money(item.unitPrice)}</p></div><strong className="shrink-0">{money(item.lineTotal)}</strong></div>{Number(item.discountAmount) > 0 ? <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">╪«╪╡┘à ╪º┘ä╪╡┘å┘ü: -{money(item.discountAmount)}</p> : null}</div>
    {editable && <div className="flex flex-wrap items-center gap-1.5"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="h-8 rounded border bg-background px-1 text-xs"><option value="none">╪¿╪»┘ê┘å ╪«╪╡┘à</option><option value="percentage">┘å╪│╪¿╪⌐ %</option><option value="amount">┘à╪¿┘ä╪║</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="╪º┘ä┘é┘è┘à╪⌐" className="h-8 w-20 text-xs" /><label className="flex items-center gap-1 whitespace-nowrap text-[11px]"><input type="checkbox" checked={eligibleForInvoiceDiscount} onChange={(event) => setEligibleForInvoiceDiscount(event.target.checked)} />╪«╪╡┘à ╪╣╪º┘à</label><Button size="sm" variant="secondary" disabled={pending} onClick={applyItemDiscount}>╪¬╪╖╪¿┘è┘é</Button><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>ΓêÆ</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button><Button size="sm" variant="destructive" disabled={pending} onClick={() => removeItem(item)}>╪Ñ╪▓╪º┘ä╪⌐ ╪º┘ä╪╡┘å┘ü</Button>{error && <p className="basis-full text-xs text-destructive">{error}</p>}</div>}
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
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(val)) { setFinancialNotice('╪ú╪»╪«┘ä ┘é┘è┘à╪⌐ ╪«╪╡┘à ╪╡╪¡┘è╪¡╪⌐'); return }
    if (discountType === 'percentage' && !/^\d+$/.test(val)) { setFinancialNotice('╪º┘ä┘å╪│╪¿╪⌐ ┘è╪¼╪¿ ╪ú┘å ╪¬┘â┘ê┘å ╪▒┘é┘à┘ï╪º ╪╡╪¡┘è╪¡┘ï╪º'); return }
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
    {editable && <Button type="button" className="w-full justify-between" onClick={() => { setAddProductSearch(''); setAddProductCategory('all'); setAddProductSelected(null); setAddProductQty(1); setAddProductModal(true) }}><Icon name="plus" size={16} /> ╪Ñ╪╢╪º┘ü╪⌐ ╪╡┘å┘ü</Button>}
    <Totals invoice={invoice} />
    {editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-200/70 p-3"><div className="flex flex-wrap gap-2"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">╪¿╪»┘ê┘å ╪«╪╡┘à ┘ä┘ä┘ü╪º╪¬┘ê╪▒╪⌐</option><option value="percentage">┘å╪│╪¿╪⌐ ┘à╪ª┘ê┘è╪⌐ (%)</option><option value="amount">┘à╪¿┘ä╪║ ╪½╪º╪¿╪¬</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="┘é┘è┘à╪⌐ ╪«╪╡┘à ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐" className="max-w-44" /></div><Input value={invoiceNotes} onChange={(event) => setInvoiceNotes(event.target.value)} placeholder="┘à┘ä╪º╪¡╪╕╪º╪¬ ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐ΓÇª" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>╪¬╪╖╪¿┘è┘é ╪«╪╡┘à ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐</Button></div>}
    {(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-lg border bg-background p-2" aria-label="╪╖╪▒┘è┘é╪⌐ ╪º┘ä╪»┘ü╪╣"><option value="cash">┘å┘é╪»┘è</option><option value="mobile_wallet">┘à╪¡┘ü╪╕╪⌐ ╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è╪⌐</option><option value="instapay">╪Ñ┘å╪│╪¬╪º ╪¿╪º┘è</option></select>{method === 'cash' ? <Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder={`╪º┘ä┘à╪│╪¬┘ä┘à (╪º┘ä┘à╪╖┘ä┘ê╪¿ ${invoice.remaining})`} /> : <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm"><input type="checkbox" checked={electronicPaymentConfirmed} onChange={(event) => setElectronicPaymentConfirmed(event.target.checked)} disabled={pending} />╪ú╪ñ┘â╪» ╪º╪│╪¬┘ä╪º┘à ╪º┘ä╪»┘ü╪╣ ╪º┘ä╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è ╪¿╪º┘ä┘é┘è┘à╪⌐ ╪º┘ä┘å┘ç╪º╪ª┘è╪⌐ ┘ä┘ä┘ü╪º╪¬┘ê╪▒╪⌐</label>}<Button disabled={pending || (method !== 'cash' && !electronicPaymentConfirmed)} onClick={collect}>╪¬╪¡╪╡┘è┘ä</Button><Button variant="secondary" onClick={onPrint}>╪╖╪¿╪º╪╣╪⌐ / ┘à╪╣╪º┘è┘å╪⌐</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="╪│╪¿╪¿ ╪º┘ä╪Ñ┘ä╪║╪º╪í (┘à╪╖┘ä┘ê╪¿)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>╪Ñ┘ä╪║╪º╪í ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐</Button></div>}</div>}
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
        <div role="dialog" aria-modal="true" aria-label="╪Ñ╪╢╪º┘ü╪⌐ ╪╡┘å┘ü" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4" dir="rtl">
          <Card className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden sm:max-w-2xl">
            <CardHeader className="flex-row items-center justify-between border-b">
              <div>
                <CardTitle>╪Ñ╪╢╪º┘ü╪⌐ ╪╡┘å┘ü ┘ä┘ä┘ü╪º╪¬┘ê╪▒╪⌐ {invoice.number}</CardTitle>
                <p className="text-xs text-muted-foreground">╪º╪¿╪¡╪½ ╪╣┘å ╪╡┘å┘ü ┘ê╪º╪«╪¬╪▒ ╪º┘ä┘à╪¬╪║┘è╪▒ ┘ê╪º┘ä┘â┘à┘è╪⌐</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAddProductModal(false)}>╪Ñ╪║┘ä╪º┘é</Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input icon="search" value={addProductSearch} onChange={(e) => setAddProductSearch(e.target.value)} placeholder="╪º╪¿╪¡╪½ ╪╣┘å ╪╡┘å┘üΓÇª" aria-label="╪¿╪¡╪½ ╪º┘ä╪ú╪╡┘å╪º┘ü" />
                  <select value={addProductCategory} onChange={(e) => setAddProductCategory(e.target.value)} className="h-10 rounded border bg-background px-3 text-sm">
                    <option value="all">╪¼┘à┘è╪╣ ╪º┘ä╪ú┘é╪│╪º┘à</option>
                    {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredAddProducts.length === 0 ? (
                    <p className="col-span-full text-center text-sm text-muted-foreground py-4">┘ä╪º ╪¬┘ê╪¼╪» ╪ú╪╡┘å╪º┘ü ┘à╪╖╪º╪¿┘é╪⌐</p>
                  ) : (
                    filteredAddProducts.map((p) => {
                      const isSelected = addProductSelected?.id === p.id
                      return (
                        <div key={p.id} className={cn('flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-colors', isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/40', !p.isAvailable ? 'opacity-50 cursor-not-allowed' : '')}>
                          <span className="break-words text-sm font-medium text-foreground">{p.name}</span>
                          {p.variants && p.variants.length > 0 ? <span className="text-xs text-muted-foreground">المتغيرات المتاحة</span> : <span className="text-xs text-muted-foreground">{p.categoryName ?? ''}</span>}
                          <span className="text-sm font-semibold text-primary">{formatMoney(Number(p.price))}</span>
                          {!p.isAvailable ? <Badge tone="muted" className="mt-1">غير متوفر</Badge> : null}
                          {isSelected ? (
                            <div className="flex items-center gap-1 mt-1">
                              <Badge tone="primary" className="text-[10px]">محدد</Badge>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setAddProductQty(1)}>1</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setAddProductQty(2)}>2</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setAddProductQty(3)}>3</Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
                {addProductSelected && (
                  <div className="mt-4 rounded-lg border p-3">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-medium">{addProductSelected?.name}</p>
                        {addProductSelected?.variants && addProductSelected.variants.length > 0 ? <p className="text-xs text-muted-foreground">╪º┘ä┘à╪¬╪║┘è╪▒╪º╪¬ ╪º┘ä┘à╪¬╪º╪¡╪⌐:</p> : null}
                      </div>
                      <span className="text-sm font-semibold text-primary">{formatMoney(Number(addProductSelected?.price ?? 0))}</span>
                    </div>
                    {addProductSelected?.variants && addProductSelected.variants.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        <label className="text-xs font-medium text-muted-foreground block mb-1">╪º┘ä┘à╪¬╪║┘è╪▒ *</label>
                        <select value={addProductVariantId ?? ''} onChange={(e) => setAddProductVariantId(e.target.value)} className="h-10 w-full rounded border bg-background px-3 text-sm">
                          <option value="">╪º╪«╪¬╪▒ ╪º┘ä┘à╪¬╪║┘è╪▒</option>
                          {addProductSelected.variants.map((v) => <option key={v.id} value={v.id}>{v.label} ΓÇö {formatMoney(Number(v.price))}</option>)}
                        </select>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted-foreground">╪º┘ä┘â┘à┘è╪⌐</label>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => setAddProductQty((q) => Math.max(1, q - 1))}>ΓêÆ</Button>
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
                <p className="text-sm text-muted-foreground">{addProductSelected ? `${addProductQty} ├ù ${formatMoney(Number(addProductSelected.price))} = ${formatMoney(Number(addProductSelected.price) * addProductQty)}` : '╪º╪«╪¬╪▒ ╪╡┘å┘ü╪º┘ï ┘ä╪Ñ╪╢╪º┘ü╪¬┘ç'}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setAddProductModal(false)}>╪Ñ┘ä╪║╪º╪í</Button>
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
                    ╪Ñ╪╢╪º┘ü╪⌐ ┘ä┘ä┘ü╪º╪¬┘ê╪▒╪⌐
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
  function applyFinancials() { if (!editable) return; const val = discountValue.trim(); if (discountType === 'none') { setFinancialNotice(null); edit({ action: 'financials', discountType: 'none', discountValue: '0', notes: invoiceNotes.trim() || null }); return } const value = Number(val); if (!Number.isFinite(value) || value < 0) { setFinancialNotice('┘é┘è┘à╪⌐ ╪º┘ä╪«╪╡┘à ╪║┘è╪▒ ╪╡╪¡┘è╪¡╪⌐'); return } setFinancialNotice(null); edit({ action: 'financials', discountType, discountValue: val, notes: invoiceNotes.trim() || null }) }
 return <Card className={modal ? 'border-0 p-0 shadow-none' : 'p-4'}>{!modal && <div className="mb-3 flex justify-between"><div><h3 className="font-bold">{invoice.number}</h3><p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)} ┬╖ {invoice.creator ?? 'ΓÇö'}</p></div><span>{invoice.status}</span></div>}<div className="space-y-2">{invoice.items.map(item => <div key={item.id} className="flex items-center justify-between gap-2 border-b py-2"><span>{item.name} ├ù {item.quantity}</span><span>{money(item.lineTotal)}</span>{editable && <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>ΓêÆ</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button></div>}</div>)}</div>{editable && <select className="mt-3 w-full rounded-lg border p-2 text-sm" defaultValue="" onChange={e => { if (e.target.value) { edit({ action: 'add', productId: e.target.value, quantity: 1 }); e.currentTarget.value = '' } }}><option value="">╪Ñ╪╢╪º┘ü╪⌐ ╪╡┘å┘ü ┘à┘å ╪º┘ä┘â╪¬╪º┘ä┘ê╪¼ΓÇª</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ΓÇö {money(p.price)}</option>)}</select>}<Totals invoice={invoice} />{editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-100 p-3"><div className="flex gap-2"><select value={discountType} onChange={e => setDiscountType(e.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border p-2 text-sm"><option value="none">╪¿╪»┘ê┘å ╪«╪╡┘à</option><option value="percentage">┘å╪│╪¿╪⌐ ┘à╪ª┘ê┘è╪⌐ (%)</option><option value="amount">┘à╪¿┘ä╪║ ╪½╪º╪¿╪¬</option></select><Input value={discountValue} onChange={e => setDiscountValue(e.target.value)} inputMode="decimal" placeholder="┘é┘è┘à╪⌐ ╪º┘ä╪«╪╡┘à" className="rounded-lg border p-2 text-sm" /></div><Input value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} placeholder="┘à┘ä╪º╪¡╪╕╪º╪¬ ╪╣┘ä┘ë ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐ΓÇª" className="rounded-lg border p-2 text-sm w-full" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>╪¬╪╖╪¿┘è┘é ╪º┘ä╪«╪╡┘à ┘ê╪º┘ä┘à┘ä╪º╪¡╪╕╪º╪¬</Button></div>}{(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={e => setMethod(e.target.value)} className="rounded-lg border p-2"><option value="cash">┘å┘é╪»┘è</option><option value="mobile_wallet">┘à╪¡┘ü╪╕╪⌐ ╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è╪⌐</option><option value="instapay">╪º┘å╪│╪¬╪º ╪¿╪º┘è</option></select><Input value={received} onChange={e => setReceived(e.target.value)} inputMode="decimal" placeholder={`╪º┘ä┘à╪│╪¬┘ä┘à (╪º┘ä┘à╪╖┘ä┘ê╪¿ ${invoice.remaining})`} /><Button disabled={pending} onClick={collect}>╪¬╪¡╪╡┘è┘ä</Button><Button variant="secondary" onClick={onPrint}>╪╖╪¿╪º╪╣╪⌐ / ┘à╪╣╪º┘è┘å╪⌐</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="╪│╪¿╪¿ ╪º┘ä╪Ñ┘ä╪║╪º╪í (┘à╪╖┘ä┘ê╪¿)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>╪Ñ┘ä╪║╪º╪í ╪º┘ä┘ü╪º╪¬┘ê╪▒╪⌐</Button></div>}</div>}</Card>
}

function Totals({ invoice }: { invoice: InvoiceRow }) { return <div className="mt-4 space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>╪Ñ╪¼┘à╪º┘ä┘è ╪º┘ä╪ú╪╡┘å╪º┘ü</span><span>{money(invoice.subtotal)}</span></div><div className="flex justify-between"><span>╪º┘ä╪«╪╡┘à</span><span>{Number(invoice.discount) > 0 ? `-${money(invoice.discount)}` : money(0)}</span></div><div className="flex justify-between"><span>╪º┘ä╪╢╪▒┘è╪¿╪⌐</span><span>{money(invoice.tax)}</span></div><div className="flex justify-between font-bold"><span>╪º┘ä╪Ñ╪¼┘à╪º┘ä┘è ╪º┘ä┘å┘ç╪º╪ª┘è</span><strong>{money(invoice.total)}</strong></div><div className="flex justify-between"><span>╪º┘ä┘à╪»┘ü┘ê╪╣</span><span>{money(invoice.paid)}</span></div><div className="flex justify-between font-bold text-primary"><span>╪º┘ä┘à╪¬╪¿┘é┘è</span><span>{money(invoice.remaining)}</span></div></div> }
