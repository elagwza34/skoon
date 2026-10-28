'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort, formatTime } from '@/lib/format'
import type { StaffSession } from '@/lib/session'
import type { ShiftBoardData } from '@/lib/staff-shifts'
import type { InvoiceRow } from '@/lib/staff-invoices'
import type { SharedFloatSummary } from '@/lib/staff-float'
import type { PosCatalog } from '@/lib/staff-pos'
import { PosCheckout } from '@/components/pos/pos-checkout'
import { CashierDashboard } from './cashier-dashboard'
import { InvoiceBoard } from './invoice-board'
import { SharedFloatPanel } from './shared-float-panel'

type Tab = 'pos' | 'open' | 'paid' | 'cancelled' | 'balances' | 'shifts'
const tabs: { value: Tab; label: string }[] = [
  { value: 'pos', label: 'POS' }, { value: 'open', label: 'Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…ÙØªÙˆØ­Ø©' },
  { value: 'paid', label: 'ÙÙˆØ§ØªÙŠØ± Ù…Ø¯ÙÙˆØ¹Ø©' }, { value: 'cancelled', label: 'ÙÙˆØ§ØªÙŠØ± Ù…Ù„ØºØ§Ø©' },
  { value: 'balances', label: 'Ø§Ù„Ø£Ø±ØµØ¯Ø©' }, { value: 'shifts', label: 'Ø§Ù„ÙˆØ±Ø¯ÙŠØ§Øª' },
]

export function CashierWorkspace({ session, board, branchName, invoices, products, catalog, sharedFloat }: {
  session: StaffSession; board: ShiftBoardData; branchName: string | null; invoices: InvoiceRow[]
  products: { id: string; name: string; price: string }[]; catalog: PosCatalog; sharedFloat: SharedFloatSummary
}) {
  const router = useRouter(); const [, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>('pos'); const [openModal, setOpenModal] = useState(false)
  const [openingCash, setOpeningCash] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const refresh = () => startTransition(() => router.refresh())
  const current = board.current
  async function openShift() {
    const amount = Number(openingCash)
    if (!Number.isFinite(amount) || amount < 0) { setError('Ø£Ø¯Ø®Ù„ Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ ØµØ­ÙŠØ­Ø§Ù‹'); return }
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/staff/shifts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ openingCash: amount, branchId: Number(board.branchId) }) })
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error ?? 'ØªØ¹Ø°Ø± ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©')
      setOpenModal(false); setOpeningCash(''); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©') } finally { setBusy(false) }
  }
  const opened = current ? `${formatDateShort(new Date(current.openedAt))} â€” ${formatTime(new Date(current.openedAt))}` : 'Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©'
  return <div className="min-h-screen w-full bg-background" dir="rtl">
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur lg:px-6">
      <div><h1 className="text-xl font-bold">Ù„ÙˆØ­Ø© Ø§Ù„ÙƒØ§Ø´ÙŠØ±</h1><p className="text-sm text-muted-foreground">{branchName ?? 'â€”'} Â· {session.name}</p></div>
      <div className="text-xs text-muted-foreground"><b className="text-foreground">{current ? 'ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©' : 'Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ©'}</b><br />ÙØªØ­Ù‡Ø§: {current?.openBy ?? 'â€”'} Â· {opened}</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => window.history.back()}>Ø±Ø¬ÙˆØ¹</Button>
        <Button variant="outline" onClick={() => setTab('shifts')}>Ø§Ù„ÙˆØ±Ø¯ÙŠØ§Øª</Button>
        {!current && <Button onClick={() => setOpenModal(true)}>ÙØªØ­ ÙˆØ±Ø¯ÙŠØ©</Button>}
        <form action="/login?next=/cashier"><Button type="submit" variant="ghost">ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬</Button></form>
      </div>
    </header>
    <nav className="sticky top-[73px] z-20 w-full border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:px-6" aria-label="Ø£Ù‚Ø³Ø§Ù… Ù…Ø­Ø·Ø© Ø§Ù„ÙƒØ§Ø´ÙŠØ±">
      <Segmented options={tabs} value={tab} onChange={setTab} ariaLabel="Ø£Ù‚Ø³Ø§Ù… Ø§Ù„ÙƒØ§Ø´ÙŠØ±" className="w-full justify-start overflow-x-auto" />
    </nav>
    <main className="w-full p-4 lg:p-6">
      {error && <p role="alert" className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {tab === 'pos' && <div className="flex flex-col gap-5"><PosCheckout catalog={catalog} /><InvoiceBoard key="pos" invoices={invoices} products={products} defaultTab="open" workspace /></div>}
      {tab === 'open' && <InvoiceBoard key="open" invoices={invoices} products={products} defaultTab="open" />}
      {tab === 'paid' && <InvoiceBoard key="paid" invoices={invoices} products={products} defaultTab="paid" />}
      {tab === 'cancelled' && <InvoiceBoard key="cancelled" invoices={invoices} products={products} defaultTab="cancelled" />}
      {tab === 'balances' && <SharedFloatPanel summary={sharedFloat} cashierId={session.id} />}
      {tab === 'shifts' && <div className="flex flex-col gap-5"><CashierDashboard session={session} board={board} branchName={branchName} compact /><ShiftHistory board={board} /></div>}
    </main>
    {openModal && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>ÙØªØ­ ÙˆØ±Ø¯ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm text-muted-foreground">Ø³ÙŠØ³Ø¬Ù„ Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ ÙÙŠ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© Ù„Ù„ÙØ±Ø¹.</p><Input autoFocus inputMode="decimal" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0.00" aria-label="Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­" /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpenModal(false)}>Ø¥Ù„ØºØ§Ø¡</Button><Button disabled={busy} onClick={openShift}>{busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„ÙØªØ­â€¦' : 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„ÙØªØ­'}</Button></div></CardContent></Card></div>}
  </div>
}

function ShiftHistory({ board }: { board: ShiftBoardData }) {
  return <Card><CardHeader><CardTitle>ÙˆØ±Ø¯ÙŽÙŠÙ‘Ø§ØªÙŠ</CardTitle></CardHeader><CardContent>{board.recent.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-right text-sm"><thead className="text-muted-foreground"><tr><th>Ø§Ù„ÙØªØ­</th><th>Ø§Ù„Ø¥ØºÙ„Ø§Ù‚</th><th>Ø§Ù„Ø§ÙØªØªØ§Ø­</th><th>Ø§Ù„Ù…ØªÙˆÙ‚Ø¹</th><th>Ø§Ù„Ù…Ø¹Ø¯ÙˆØ¯</th><th>Ø§Ù„ÙØ±Ù‚</th><th>Ø§Ù„Ø­Ø§Ù„Ø©</th><th>Ø§Ù„ØªØ³Ù„ÙŠÙ…</th></tr></thead><tbody>{board.recent.map((shift) => <tr key={shift.id} className="border-t"><td className="py-3">{formatDateShort(new Date(shift.openedAt))} {formatTime(new Date(shift.openedAt))}</td><td>{shift.closedAt ? `${formatDateShort(new Date(shift.closedAt))} ${formatTime(new Date(shift.closedAt))}` : 'â€”'}</td><td>{formatCurrency(Number(shift.openingCash))}</td><td>{formatCurrency(Number(shift.expectedCash))}</td><td>{formatCurrency(Number(shift.closingCash))}</td><td>{formatCurrency(Number(shift.cashDifference))}</td><td><Badge tone={shift.status === 'open' ? 'primary' : 'success'}>{shift.status === 'open' ? 'Ù…ÙØªÙˆØ­Ø©' : 'Ù…ØºÙ„Ù‚Ø©'}</Badge></td><td>{shift.handoverTo ?? 'â€”'}</td></tr>)}</tbody></table></div> : <EmptyState icon="shifts" title="Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ§Øª" description="Ø³ØªØ¸Ù‡Ø± ÙˆØ±Ø¯ÙŠØ§ØªÙƒ Ù‡Ù†Ø§ Ø¨Ø¹Ø¯ ÙØªØ­ Ø£ÙˆÙ„ ÙˆØ±Ø¯ÙŠØ©." />}</CardContent></Card>
}


