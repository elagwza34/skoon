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
			setReceivedNotice('ÙŠØ¬Ø¨ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³ØªÙ„Ù… Ù‚Ø¨Ù„ Ø§Ù„ØªØ­ØµÙŠÙ„');
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
  function edit(input: InvoiceEditInput) { if (!selected) return; startTransition(async () => { const response = await fetch(`/api/staff/invoices/${selected.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); const body = await response.json().catch(() => ({})); refresh(response.ok ? 'ØªÙ… Ø­ÙØ¸ Ø§Ù„ÙØ§ØªÙˆØ±Ø©.' : body.error ?? 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„ÙØ§ØªÙˆØ±Ø©.') }) }
  function collect() { if (!selected) return; if (!received || Number(received) <= 0) { setNotice('ÙŠØ¬Ø¨ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³ØªÙ„Ù… Ù‚Ø¨Ù„ Ø§Ù„ØªØ­ØµÙŠÙ„'); return }
    const amount = Number(received)
    if (method !== 'cash' && amount < Number(selected.remaining)) { setNotice('Ù„Ø·Ø±Ù‚ Ø§Ù„Ø¯ÙØ¹ ØºÙŠØ± Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙŠØ¬Ø¨ ØªØ­ØµÙŠÙ„ Ø§Ù„Ù…Ø¨Ù„Øº ÙƒØ§Ù…Ù„Ø§Ù‹'); return }; startTransition(async () => { const invoice = selected; const response = await fetch(`/api/staff/orders/${invoice.id}/pay`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key() }, body: JSON.stringify({ action: 'pay', method, received: received || invoice.remaining }) }); const body = await response.json().catch(() => ({})); if (!response.ok) return setNotice(body.error ?? 'ØªØ¹Ø°Ø± ØªØ­ØµÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø©.'); setReceipt({ paid: body.amount ?? invoice.remaining, remaining: '0', change: body.changeAmount ?? '0', method: body.method ?? method, invoice }); setReceived(''); setSelectedId(null); refresh('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„ØªØ­ØµÙŠÙ„.') }) }
  function cancel() { if (!selected || !reason.trim()) return setNotice('Ø³Ø¨Ø¨ Ø§Ù„Ø¥Ù„ØºØ§Ø¡ Ù…Ø·Ù„ÙˆØ¨.'); startTransition(async () => { const response = await fetch(`/api/staff/orders/${selected.id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'cancelled', reason: reason.trim() }) }); const body = await response.json().catch(() => ({})); if (response.ok) { setReason(''); setSelectedId(null); refresh('ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ÙØ§ØªÙˆØ±Ø© ÙˆØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø³Ø¨Ø¨.') } else setNotice(body.error ?? 'ØªØ¹Ø°Ø± Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ÙØ§ØªÙˆØ±Ø©.') }) }
  return <Card className="w-full p-4" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{defaultTab === 'paid' ? 'Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø­ØµÙ„Ø©' : defaultTab === 'cancelled' ? 'Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ù„ØºØ§Ø©' : 'Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…ÙØªÙˆØ­Ø©'}</h2><p className="text-sm text-muted-foreground">Ø¨ÙŠØ§Ù†Ø§Øª Ø­ÙŠØ© Ù…Ù† Ø§Ù„Ø·Ù„Ø¨Ø§Øª ÙˆØ§Ù„ØªØ­ØµÙŠÙ„Ø§Øª Ø§Ù„Ù…Ø³Ø¬Ù„Ø©.</p></div>{defaultTab === 'paid' && <Button variant="secondary" onClick={() => window.location.assign('/api/staff/invoices?format=csv')}>ØªØµØ¯ÙŠØ± CSV</Button>}</div>
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ø§Ø¨Ø­Ø« Ø¨Ø±Ù‚Ù… Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø£Ùˆ Ø§Ù„Ù…Ù†Ø´Ø¦" className="mb-4" />
    {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
    {readonlyList ? <InvoiceList rows={rows} tab={defaultTab} onPreview={(invoice) => setPreview({ invoice, autoPrint: true })} /> : <InvoiceList rows={rows} tab="open" selectedId={selected?.id} onSelect={openSettlement} />}
    {selected && <InvoiceSettlementModal invoice={selected} products={products} editable={editable} pending={pending} received={received} method={method} reason={reason} setReceived={setReceived} setMethod={setMethod} setReason={setReason} edit={edit} collect={collect} cancel={cancel} onPrint={() => { if (!received || Number(received) <= 0) { setNotice('ÙŠØ¬Ø¨ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³ØªÙ„Ù… Ù‚Ø¨Ù„ Ø§Ù„Ù…Ø¹Ø§ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø·Ø¨Ø§Ø¹Ø©'); return } setPreview({ invoice: selected, autoPrint: true }) }} onClose={closeSettlement} />}
    {preview && <ThermalReceiptPreview invoice={preview.invoice} payment={preview.payment} autoPrint={preview.autoPrint} onClose={() => setPreview(null)} />}
    {receipt && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-sm p-5" dir="rtl"><h3 className="font-bold">Ø¥ÙŠØµØ§Ù„ Ø§Ù„ØªØ­ØµÙŠÙ„</h3><p>Ø§Ù„Ø·Ø±ÙŠÙ‚Ø©: {receipt.method}</p><p>Ø§Ù„Ù…Ø­ØµÙ„: {money(receipt.paid)}</p><p>Ø§Ù„Ø¨Ø§Ù‚ÙŠ Ù„Ù„Ø¹Ù…ÙŠÙ„: {money(receipt.change)}</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setPreview({ invoice: receipt.invoice, autoPrint: true, payment: receipt }); setReceipt(null) }}>Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø¥ÙŠØµØ§Ù„</Button><Button onClick={() => setReceipt(null)}>Ø¥ØºÙ„Ø§Ù‚</Button></div></Card></div>}
  </Card>
}

function InvoiceList({ rows, tab, selectedId, onSelect, onPreview }: { rows: InvoiceRow[]; tab: InvoiceTab; selectedId?: string; onSelect?: (invoice: InvoiceRow) => void; onPreview?: (invoice: InvoiceRow) => void }) {
  if (!rows.length) return <EmptyState title="Ù„Ø§ ØªÙˆØ¬Ø¯ ÙÙˆØ§ØªÙŠØ±" description="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ø¬Ù„Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ù‚Ø³Ù…." />
  return <div className={tab === 'open' ? 'space-y-2' : 'overflow-x-auto'}>{tab === 'open' ? rows.map((invoice) => <button key={invoice.id} onClick={() => onSelect?.(invoice)} className={`w-full rounded-xl border p-3 text-right ${selectedId === invoice.id ? 'border-primary bg-accent/40' : 'border-border bg-card'}`}><div className="flex justify-between gap-3"><strong>{invoice.number}</strong><span>{money(invoice.total)}</span></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{invoice.creator ?? 'â€”'} Â· {dateTime(invoice.createdAt)}</span><span>Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ {money(invoice.remaining)}</span></div></button>) : <table className="w-full min-w-[760px] text-right text-sm"><thead className="border-b text-muted-foreground"><tr><th className="p-3">Ø§Ù„ÙØ§ØªÙˆØ±Ø©</th><th>Ø§Ù„ØªØ§Ø±ÙŠØ®</th><th>Ø§Ù„Ø·Ø§ÙˆÙ„Ø©</th><th>Ø§Ù„Ù…Ù†Ø´Ø¦</th><th>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</th><th>Ø§Ù„Ø­Ø§Ù„Ø©</th><th>Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡</th></tr></thead><tbody>{rows.map((invoice) => <tr key={invoice.id} className="border-b border-border/60"><td className="p-3 font-medium">{invoice.number}</td><td>{dateTime(invoice.createdAt)}</td><td>{invoice.table}</td><td>{invoice.creator ?? 'â€”'}</td><td>{money(invoice.total)}</td><td>{tab === 'paid' ? invoice.payments.map(p => p.method).join(' / ') || 'Ù…Ø¯ÙÙˆØ¹Ø©' : 'Ù…Ù„ØºØ§Ø©'}</td><td><Button size="sm" variant="outline" onClick={() => onPreview?.(invoice)}>Ø·Ø¨Ø§Ø¹Ø©</Button></td></tr>)}</tbody></table>}</div>
}

function InvoiceSettlementModal({ invoice, products, editable, pending, received, method, reason, setReceived, setMethod, setReason, edit, collect, cancel, onPrint, onClose }: { invoice: InvoiceRow; products: { id: string; name: string; price: string }[]; editable: boolean; pending: boolean; received: string; method: string; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; collect: () => void; cancel: () => void; onPrint: () => void; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="invoice-settlement-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" dir="rtl">
    <Card className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl">
      <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <div className="min-w-0"><h2 id="invoice-settlement-title" className="truncate text-lg font-bold">ØªÙ‚ÙÙŠÙ„ Ø§Ù„ÙØ§ØªÙˆØ±Ø© {invoice.number}</h2><p className="truncate text-xs text-muted-foreground">{dateTime(invoice.createdAt)} Â· {invoice.creator ?? 'â€”'} Â· {invoice.status}</p></div>
        <Button variant="ghost" disabled={pending} onClick={onClose}>Ø¥ØºÙ„Ø§Ù‚</Button>
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
    if (type !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) { setError('Ø£Ø¯Ø®Ù„ Ù‚ÙŠÙ…Ø© Ø®ØµÙ… ØµØ­ÙŠØ­Ø©'); return }
    if (type === 'percentage' && !/^\d+$/.test(value.trim())) { setError('Ø§Ù„Ù†Ø³Ø¨Ø© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø±Ù‚Ù…Ù‹Ø§ ØµØ­ÙŠØ­Ù‹Ø§'); return }
    setError(null)
    edit({ action: 'line_discount', orderItemId: item.id, discountType: type, discountValue: type === 'none' ? '0' : value.trim(), eligibleForInvoiceDiscount: eligible })
  }
  return <Card className="border border-amber-200/70 p-3" dir="rtl"><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Ø®ØµÙ… ØµÙ†Ù</h3><span className="text-xs text-muted-foreground">ÙŠÙØ­Ø³Ø¨ Ù‚Ø¨Ù„ Ø®ØµÙ… Ø§Ù„ÙØ§ØªÙˆØ±Ø©</span></div><div className="grid gap-2 sm:grid-cols-4"><select value={item.id} onChange={(event) => { const next = items.find((candidate) => candidate.id === event.target.value); setItemId(event.target.value); setType(next?.discountType ?? 'none'); setValue(next?.discountType ? next.discountValue : ''); setEligible(next?.eligibleForInvoiceDiscount ?? true) }} className="rounded-lg border bg-background p-2 text-sm">{items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">Ø¨Ø¯ÙˆÙ† Ø®ØµÙ…</option><option value="percentage">Ù†Ø³Ø¨Ø© Ù…Ø¦ÙˆÙŠØ© (%)</option><option value="amount">Ù…Ø¨Ù„Øº Ø«Ø§Ø¨Øª</option></select><Input value={value} disabled={type === 'none'} onChange={(event) => setValue(event.target.value)} inputMode="decimal" placeholder="Ù‚ÙŠÙ…Ø© Ø§Ù„Ø®ØµÙ…" /><Button disabled={pending} onClick={save}>Ø­ÙØ¸ Ø®ØµÙ… Ø§Ù„ØµÙ†Ù</Button></div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={eligible} onChange={(event) => setEligible(event.target.checked)} />ÙŠØ´Ù…Ù„Ù‡ Ø§Ù„Ø®ØµÙ… Ø§Ù„Ø¹Ø§Ù… Ù„Ù„ÙØ§ØªÙˆØ±Ø©</label>{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</Card>
}

function InvoiceLineEditor({ item, editable, pending, edit }: { item: InvoiceRow['items'][number]; editable: boolean; pending: boolean; edit: (input: InvoiceEditInput) => void }) {
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>(item.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(item.discountType ? item.discountValue : '')
  const [eligibleForInvoiceDiscount, setEligibleForInvoiceDiscount] = useState(item.eligibleForInvoiceDiscount)
  const [error, setError] = useState<string | null>(null)
  function applyItemDiscount() {
    if (discountType !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(discountValue.trim())) { setError('Ø£Ø¯Ø®Ù„ Ù‚ÙŠÙ…Ø© Ø®ØµÙ… ØµØ­ÙŠØ­Ø©'); return }
    if (discountType === 'percentage' && !/^\d+$/.test(discountValue.trim())) { setError('Ø§Ù„Ù†Ø³Ø¨Ø© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø±Ù‚Ù…Ù‹Ø§ ØµØ­ÙŠØ­Ù‹Ø§'); return }
    setError(null)
    edit({ action: 'line_discount', orderItemId: item.id, discountType, discountValue: discountType === 'none' ? '0' : discountValue.trim(), eligibleForInvoiceDiscount })
  }
  return <div className="grid gap-2 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0"><div className="flex items-center justify-between gap-3"><span className="font-medium">{item.name} Ã— {item.quantity}</span><strong>{money(item.lineTotal)}</strong></div>{Number(item.discountAmount) > 0 ? <p className="mt-1 text-xs text-black">Ø®ØµÙ… Ø§Ù„ØµÙ†Ù: -{money(item.discountAmount)}</p> : null}</div>
    {editable && <div className="flex flex-wrap items-center gap-1.5"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="h-8 rounded border bg-background px-1 text-xs"><option value="none">Ø¨Ø¯ÙˆÙ† Ø®ØµÙ…</option><option value="percentage">Ù†Ø³Ø¨Ø© %</option><option value="amount">Ù…Ø¨Ù„Øº</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="Ø§Ù„Ù‚ÙŠÙ…Ø©" className="h-8 w-20 text-xs" /><label className="flex items-center gap-1 whitespace-nowrap text-[11px]"><input type="checkbox" checked={eligibleForInvoiceDiscount} onChange={(event) => setEligibleForInvoiceDiscount(event.target.checked)} />Ø®ØµÙ… Ø¹Ø§Ù…</label><Button size="sm" variant="secondary" disabled={pending} onClick={applyItemDiscount}>ØªØ·Ø¨ÙŠÙ‚</Button><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>âˆ’</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button>{error && <p className="basis-full text-xs text-destructive">{error}</p>}</div>}
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
    if (discountType !== 'none' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(discountValue.trim())) { setFinancialNotice('Ø£Ø¯Ø®Ù„ Ù‚ÙŠÙ…Ø© Ø®ØµÙ… ØµØ­ÙŠØ­Ø©'); return }
    if (discountType === 'percentage' && !/^\d+$/.test(discountValue.trim())) { setFinancialNotice('Ø§Ù„Ù†Ø³Ø¨Ø© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø±Ù‚Ù…Ù‹Ø§ ØµØ­ÙŠØ­Ù‹Ø§'); return }
    setFinancialNotice(null)
    edit({ action: 'financials', discountType, discountValue: discountType === 'none' ? '0' : discountValue.trim(), notes: invoiceNotes.trim() || null })
  }
  return <Card className={modal ? 'border-0 p-0 shadow-none' : 'p-4'} dir="rtl">
    {!modal && <div className="mb-3 flex justify-between"><div><h3 className="font-bold">{invoice.number}</h3><p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)}</p></div><span>{invoice.status}</span></div>}
    <div className="space-y-1">{invoice.items.map((item) => <InvoiceLineEditor key={item.id} item={item} editable={editable} pending={pending} edit={edit} />)}</div>
    {editable && <select className="mt-3 w-full rounded-lg border bg-background p-2 text-sm" defaultValue="" onChange={(event) => { if (event.target.value) { edit({ action: 'add', productId: event.target.value, quantity: 1 }); event.currentTarget.value = '' } }}><option value="">Ø¥Ø¶Ø§ÙØ© ØµÙ†Ù Ù…Ù† Ø§Ù„ÙƒØªØ§Ù„ÙˆØ¬â€¦</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} â€” {money(product.price)}</option>)}</select>}
    <Totals invoice={invoice} />
    {editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-200/70 p-3"><div className="flex flex-wrap gap-2"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border bg-background p-2 text-sm"><option value="none">Ø¨Ø¯ÙˆÙ† Ø®ØµÙ… Ù„Ù„ÙØ§ØªÙˆØ±Ø©</option><option value="percentage">Ù†Ø³Ø¨Ø© Ù…Ø¦ÙˆÙŠØ© (%)</option><option value="amount">Ù…Ø¨Ù„Øº Ø«Ø§Ø¨Øª</option></select><Input value={discountValue} disabled={discountType === 'none'} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="Ù‚ÙŠÙ…Ø© Ø®ØµÙ… Ø§Ù„ÙØ§ØªÙˆØ±Ø©" className="max-w-44" /></div><Input value={invoiceNotes} onChange={(event) => setInvoiceNotes(event.target.value)} placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„ÙØ§ØªÙˆØ±Ø©â€¦" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>ØªØ·Ø¨ÙŠÙ‚ Ø®ØµÙ… Ø§Ù„ÙØ§ØªÙˆØ±Ø©</Button></div>}
    {(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-lg border bg-background p-2"><option value="cash">Ù†Ù‚Ø¯ÙŠ</option><option value="mobile_wallet">Ù…Ø­ÙØ¸Ø© Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ©</option><option value="instapay">Ø¥Ù†Ø³ØªØ§ Ø¨Ø§ÙŠ</option></select><Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder={`Ø§Ù„Ù…Ø³ØªÙ„Ù… (Ø§Ù„Ù…Ø·Ù„ÙˆØ¨ ${invoice.remaining})`} /><Button disabled={pending} onClick={collect}>ØªØ­ØµÙŠÙ„</Button><Button variant="secondary" onClick={onPrint}>Ø·Ø¨Ø§Ø¹Ø© / Ù…Ø¹Ø§ÙŠÙ†Ø©</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ø¥Ù„ØºØ§Ø¡ (Ù…Ø·Ù„ÙˆØ¨)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ÙØ§ØªÙˆØ±Ø©</Button></div>}</div>}
  </Card>
}

function LegacyInvoiceEditor({ invoice, products, editable, pending, received, method, reason, setReceived, setMethod, setReason, edit, collect, cancel, onPrint, modal = false }: { invoice: InvoiceRow; products: { id: string; name: string; price: string }[]; editable: boolean; pending: boolean; received: string; method: string; reason: string; setReceived: (v: string) => void; setMethod: (v: string) => void; setReason: (v: string) => void; edit: (input: InvoiceEditInput) => void; collect: () => void; cancel: () => void; onPrint: () => void; modal?: boolean }) {
 const cancellable = (invoice.status === 'new' || invoice.status === 'preparing') && Number(invoice.paid) === 0
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState(invoice.notes ?? '')
  const [financialNotice, setFinancialNotice] = useState<string | null>(null)
  function applyFinancials() { if (!editable) return; const value = Number(discountValue); if (discountType !== 'none' && (!Number.isFinite(value) || value < 0)) { setFinancialNotice('Ù‚ÙŠÙ…Ø© Ø§Ù„Ø®ØµÙ… ØºÙŠØ± ØµØ­ÙŠØ­Ø©'); return } edit({ action: 'financials', discountType: discountType === 'none' ? 'none' : discountType, discountValue: discountType === 'none' ? 0 : value, notes: invoiceNotes.trim() || null }) }
 return <Card className={modal ? 'border-0 p-0 shadow-none' : 'p-4'}>{!modal && <div className="mb-3 flex justify-between"><div><h3 className="font-bold">{invoice.number}</h3><p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)} Â· {invoice.creator ?? 'â€”'}</p></div><span>{invoice.status}</span></div>}<div className="space-y-2">{invoice.items.map(item => <div key={item.id} className="flex items-center justify-between gap-2 border-b py-2"><span>{item.name} Ã— {item.quantity}</span><span>{money(item.lineTotal)}</span>{editable && <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={pending || item.quantity <= 1} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity - 1 })}>âˆ’</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => edit({ action: 'quantity', orderItemId: item.id, quantity: item.quantity + 1 })}>+</Button></div>}</div>)}</div>{editable && <select className="mt-3 w-full rounded-lg border p-2 text-sm" defaultValue="" onChange={e => { if (e.target.value) { edit({ action: 'add', productId: e.target.value, quantity: 1 }); e.currentTarget.value = '' } }}><option value="">Ø¥Ø¶Ø§ÙØ© ØµÙ†Ù Ù…Ù† Ø§Ù„ÙƒØªØ§Ù„ÙˆØ¬â€¦</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} â€” {money(p.price)}</option>)}</select>}<Totals invoice={invoice} />{editable && <div className="mt-3 space-y-2 rounded-lg border border-amber-100 p-3"><div className="flex gap-2"><select value={discountType} onChange={e => setDiscountType(e.target.value as 'none' | 'percentage' | 'amount')} className="rounded-lg border p-2 text-sm"><option value="none">Ø¨Ø¯ÙˆÙ† Ø®ØµÙ…</option><option value="percentage">Ù†Ø³Ø¨Ø© Ù…Ø¦ÙˆÙŠØ© (%)</option><option value="amount">Ù…Ø¨Ù„Øº Ø«Ø§Ø¨Øª</option></select><Input value={discountValue} onChange={e => setDiscountValue(e.target.value)} inputMode="decimal" placeholder="Ù‚ÙŠÙ…Ø© Ø§Ù„Ø®ØµÙ…" className="rounded-lg border p-2 text-sm" /></div><Input value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø¹Ù„Ù‰ Ø§Ù„ÙØ§ØªÙˆØ±Ø©â€¦" className="rounded-lg border p-2 text-sm w-full" />{financialNotice && <p className="text-xs text-destructive">{financialNotice}</p>}<Button disabled={pending} onClick={applyFinancials}>ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ø®ØµÙ… ÙˆØ§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª</Button></div>}{(editable || cancellable) && <div className={modal ? 'sticky bottom-0 z-10 mt-4 grid gap-2 border-t bg-card py-3 sm:grid-cols-2' : 'mt-4 grid gap-2 sm:grid-cols-2'}>{editable && <><select value={method} onChange={e => setMethod(e.target.value)} className="rounded-lg border p-2"><option value="cash">Ù†Ù‚Ø¯ÙŠ</option><option value="mobile_wallet">Ù…Ø­ÙØ¸Ø© Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ©</option><option value="instapay">Ø§Ù†Ø³ØªØ§ Ø¨Ø§ÙŠ</option></select><Input value={received} onChange={e => setReceived(e.target.value)} inputMode="decimal" placeholder={`Ø§Ù„Ù…Ø³ØªÙ„Ù… (Ø§Ù„Ù…Ø·Ù„ÙˆØ¨ ${invoice.remaining})`} /><Button disabled={pending} onClick={collect}>ØªØ­ØµÙŠÙ„</Button><Button variant="secondary" onClick={onPrint}>Ø·Ø¨Ø§Ø¹Ø© / Ù…Ø¹Ø§ÙŠÙ†Ø©</Button></>}{cancellable && <div className="sm:col-span-2 rounded-lg border border-rose-200 p-3"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ø¥Ù„ØºØ§Ø¡ (Ù…Ø·Ù„ÙˆØ¨)" /><Button className="mt-2" variant="destructive" disabled={pending} onClick={cancel}>Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ÙØ§ØªÙˆØ±Ø©</Button></div>}</div>}</Card>
}

function Totals({ invoice }: { invoice: InvoiceRow }) { return <div className="mt-4 space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</span><strong>{money(invoice.subtotal)}</strong></div><div className="flex justify-between"><span>Ø§Ù„Ø®ØµÙ…</span><span>{Number(invoice.discount) > 0 ? `-${money(invoice.discount)}` : money(0)}</span></div><div className="flex justify-between font-bold"><span>Ø§Ù„Ù…Ø¯ÙÙˆØ¹</span><span>{money(invoice.paid)}</span></div></div> }


