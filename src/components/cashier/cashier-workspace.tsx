'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
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
import type { WaiterWorkspace } from '@/lib/staff-waiter'
import { PosCheckout } from '@/components/pos/pos-checkout'
import { TablesSidebar } from './tables-sidebar'
import { CashierDashboard } from './cashier-dashboard'
import { InvoiceBoard } from './invoice-board'
import { SharedFloatPanel } from './shared-float-panel'
import { logoutAction } from '@/app/login/actions'

type Tab = 'pos' | 'tables' | 'open' | 'paid' | 'cancelled' | 'balances' | 'shifts'
const tabs: { value: Tab; label: string }[] = [
  { value: 'pos', label: 'POS' }, { value: 'tables', label: 'الطاولات' },
  { value: 'open', label: 'الفواتير المفتوحة' },
  { value: 'paid', label: 'فواتير مدفوعة' }, { value: 'cancelled', label: 'فواتير ملغاة' },
  { value: 'balances', label: 'الأرصدة' }, { value: 'shifts', label: 'الورديات' },
]

export function CashierWorkspace({ session, board, branchName, invoices, products, catalog, sharedFloat, openOrders = [] }: {
  session: StaffSession; board: ShiftBoardData; branchName: string | null; invoices: InvoiceRow[]
  products: { id: string; name: string; price: string; categoryId?: string; isAvailable?: boolean; categoryName?: string; variants?: { id: string; label: string; price: string }[]; modifierGroups?: { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; options: { id: string; label: string; priceAdjustment: string }[] }[] }[]; catalog: PosCatalog; sharedFloat: SharedFloatSummary
  openOrders?: WaiterWorkspace['openOrders']
}) {
  const router = useRouter(); const [refreshPending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>('pos'); const [openModal, setOpenModal] = useState(false)
  const [openingCash, setOpeningCash] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [logoutError, setLogoutError] = useState<string | null>(null)
  const refresh = useCallback(() => startTransition(() => router.refresh()), [startTransition, router])
  const current = board.current
  async function openShift() {
    const amount = Number(openingCash)
    if (!Number.isFinite(amount) || amount < 0) { setError('أدخل رصيد افتتاح صحيحاً'); return }
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/staff/shifts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ openingCash: amount, branchId: Number(board.branchId) }) })
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error ?? 'تعذر فتح الوردية')
      setOpenModal(false); setOpeningCash(''); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر فتح الوردية') } finally { setBusy(false) }
  }
  const opened = current ? `${formatDateShort(new Date(current.openedAt))} — ${formatTime(new Date(current.openedAt))}` : 'لا توجد وردية مفتوحة'
  async function handleLogout() {
    setLogoutError(null)
    setBusy(true)
    try {
      // Block logout if a shift is open (cashier must close shift first)
      if (current) {
        setLogoutError('لا يمكن تسجيل الخروج بينما وردية مفتوحة — أغلق الوردية أولاً من صفحة الورديات')
        return
      }
      await logoutAction()
      router.push('/login')
    } catch (e) {
      setLogoutError(e instanceof Error ? e.message : 'تعذر تسجيل الخروج')
    } finally {
      setBusy(false)
    }
  }

  // Avoid overlapping refreshes and requests while the station is offline.
  useEffect(() => {
    const timer = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible' && !refreshPending && !busy) refresh()
    }, 5_000)
    return () => clearInterval(timer)
  }, [refresh, refreshPending, busy])

  return <div className="min-h-screen w-full bg-background" dir="rtl">
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 shadow-sm lg:px-6">
        <div><h1 className="text-xl font-bold">لوحة الكاشير</h1><p className="text-sm text-muted-foreground">{branchName ?? '—'} · {session.name}</p></div>
        <div className="text-xs text-muted-foreground"><b className="text-foreground">{current ? 'وردية مفتوحة' : 'لا توجد وردية'}</b><br />فتحها: {current?.openBy ?? '—'} · {opened}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => window.history.back()}>رجوع</Button>
          <Button variant="outline" onClick={() => setTab('shifts')}>الورديات</Button>
          {!current && <Button onClick={() => setOpenModal(true)}>فتح وردية</Button>}
          <Button onClick={handleLogout} variant="ghost" disabled={busy}>{busy ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</Button>
        </div>
      </header>
      <nav className="border-b border-border bg-background/95 px-4 py-2 lg:px-6" aria-label="أقسام محطة الكاشير">
        <Segmented options={tabs} value={tab} onChange={setTab} ariaLabel="أقسام الكاشير" className="w-full justify-start overflow-x-auto" />
      </nav>
    </div>
    <main className="w-full p-4 lg:p-6">
      {error && <p role="alert" className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {logoutError && <p role="alert" className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{logoutError}</p>}
      {tab === 'pos' && <div className="flex flex-col gap-5"><PosCheckout catalog={catalog} /><InvoiceBoard key="pos" invoices={invoices} products={products} defaultTab="open" workspace /></div>}
      {tab === 'tables' && <div className="flex flex-col gap-5"><TablesSidebar catalog={catalog} invoices={invoices} openOrders={openOrders} /></div>}
      {tab === 'open' && <InvoiceBoard key="open" invoices={invoices} products={products} defaultTab="open" />}
      {tab === 'paid' && <InvoiceBoard key="paid" invoices={invoices} products={products} defaultTab="paid" />}
      {tab === 'cancelled' && <InvoiceBoard key="cancelled" invoices={invoices} products={products} defaultTab="cancelled" />}
      {tab === 'balances' && <SharedFloatPanel summary={sharedFloat} cashierId={session.id} />}
      {tab === 'shifts' && <div className="flex flex-col gap-5"><CashierDashboard session={session} board={board} branchName={branchName} compact /><ShiftHistory board={board} /></div>}
    </main>
    {openModal && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>فتح وردية جديدة</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm text-muted-foreground">سيسجل الرصيد الافتتاحي في الوردية الحالية للفرع.</p><Input autoFocus inputMode="decimal" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0.00" aria-label="رصيد الافتتاح" /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpenModal(false)}>إلغاء</Button><Button disabled={busy} onClick={openShift}>{busy ? 'جارٍ الفتح…' : 'تأكيد الفتح'}</Button></div></CardContent></Card></div>}
  </div>
}

function ShiftHistory({ board }: { board: ShiftBoardData }) {
  return <Card><CardHeader><CardTitle>وردَيّاتي</CardTitle></CardHeader><CardContent>{board.recent.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-right text-sm"><thead className="text-muted-foreground"><tr><th>الفتح</th><th>الإغلاق</th><th>الافتتاح</th><th>المتوقع</th><th>المعدود</th><th>الفرق</th><th>الحالة</th><th>التسليم</th></tr></thead><tbody>{board.recent.map((shift) => <tr key={shift.id} className="border-t"><td className="py-3">{formatDateShort(new Date(shift.openedAt))} {formatTime(new Date(shift.openedAt))}</td><td>{shift.closedAt ? `${formatDateShort(new Date(shift.closedAt))} ${formatTime(new Date(shift.closedAt))}` : '—'}</td><td>{formatCurrency(Number(shift.openingCash))}</td><td>{formatCurrency(Number(shift.expectedCash))}</td><td>{formatCurrency(Number(shift.closingCash))}</td><td>{formatCurrency(Number(shift.cashDifference))}</td><td><Badge tone={shift.status === 'open' ? 'primary' : 'success'}>{shift.status === 'open' ? 'مفتوحة' : 'مغلقة'}</Badge></td><td>{shift.handoverTo ?? '—'}</td></tr>)}</tbody></table></div> : <EmptyState icon="shifts" title="لا توجد ورديات" description="ستظهر وردياتك هنا بعد فتح أول وردية." />}</CardContent></Card>
}
