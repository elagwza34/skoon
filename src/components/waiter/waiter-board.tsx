'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { PosCheckout } from '@/components/pos/pos-checkout'
import { ServiceRequestBoard } from '@/components/service-requests/service-request-board'
import { ORDER_STATUS_META, type OrderStatusKey } from '@/lib/order-status'
import { formatCurrency, formatRelative, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WaiterWorkspace } from '@/lib/staff-waiter'

type WorkspaceTab = 'home' | 'tables' | 'qr' | 'orders' | 'ready' | 'service' | 'shift' | 'create'

/** Real, branch-scoped waiter workstation. All mutations refresh the server snapshot. */
export function WaiterBoard({ workspace }: { workspace: WaiterWorkspace }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tab, setTab] = useState<WorkspaceTab>('home')
  const [filter, setFilter] = useState('new')
  const [orderScope, setOrderScope] = useState<'mine' | 'all'>('all')
  const [clock, setClock] = useState<number | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editing, setEditing] = useState<WaiterWorkspace['openOrders'][number] | null>(null)

  const catalog = useMemo(() => ({
    categories: workspace.categories,
    products: workspace.products.map((product) => ({ ...product, categoryName: workspace.categories.find((category) => category.id === product.categoryId)?.name ?? 'â€”' })),
    tables: workspace.tables.map(({ id, number, name }) => ({ id, number, name })),
  }), [workspace])
  const selectedTable = workspace.tables.find((table) => table.id === selectedTableId) ?? null
  const selectedOrders = selectedTable ? workspace.openOrders.filter((order) => order.tableNumber === selectedTable.number) : []
  const scopedOrders = useMemo(() => orderScope === 'mine'
    ? workspace.openOrders.filter((order) => order.responsibleWaiterId === workspace.currentUserId)
    : workspace.openOrders,
  [orderScope, workspace.currentUserId, workspace.openOrders])
  const visible = useMemo(() => scopedOrders.filter((order) => order.status === filter), [scopedOrders, filter])
  // A partially ready ticket is actionable: only lines marked ready by the
  // kitchen appear in the serving controls. The server revalidates the line.
  const ready = useMemo(() => workspace.openOrders.filter((order) => ['preparing', 'ready'].includes(order.status) && order.items.some((item) => item.preparedQty > item.servedQty)), [workspace.openOrders])
  const qrOrders = useMemo(() => workspace.openOrders.filter((order) => order.source === 'qr'), [workspace.openOrders])
  useEffect(() => {
    const tick = () => setClock(Date.now())
    tick()
    const interval = window.setInterval(tick, 60_000)
    return () => window.clearInterval(interval)
  }, [])
  // Do not call Date.now during SSR: the initial server/client snapshot must
  // match. The live timer starts after hydration and refreshes once per minute.
  const delayed = useMemo(() => clock === null ? [] : workspace.openOrders.filter((order) => ['new', 'preparing', 'ready'].includes(order.status) && clock - new Date(order.createdAt).getTime() > 20 * 60_000), [clock, workspace.openOrders])

  async function act(id: string, action: 'send_to_kitchen' | 'status' | 'serve_items', to?: 'served', items?: { orderItemId: string; quantity: number }[], interventionReason?: string) {
    if (pendingId) return
    setPendingId(id); setError(null); setSuccess(null)
    try {
      const body = action === 'send_to_kitchen' ? { action } : action === 'serve_items' ? { action, items, ...(interventionReason ? { interventionReason } : {}) } : { to }
      const res = await fetch(`/api/staff/orders/${id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø·Ù„Ø¨')
      setSuccess(action === 'send_to_kitchen' ? 'ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨ Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø·Ø¨Ø®.' : 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø·Ù„Ø¨ ÙˆØ¥Ø¨Ù„Ø§Øº Ø§Ù„ÙƒØ§Ø´ÙŠØ±.')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø·Ù„Ø¨')
    } finally { setPendingId(null) }
  }

  async function qrAction(id: string, action: 'claim_qr' | 'approve_qr' | 'reject_qr', reason?: string): Promise<boolean> {
    if (pendingId) return false
    setPendingId(id); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/staff/orders/${id}/waiter`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...(reason ? { reason } : {}) }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø·Ù„Ø¨ QR')
      setSuccess(action === 'claim_qr' ? 'ØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ù…Ø³Ø¤ÙˆÙ„ÙŠØ© Ø·Ù„Ø¨ QR.' : action === 'approve_qr' ? 'ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø·Ù„Ø¨ ÙˆØ¥Ø±Ø³Ø§Ù„Ù‡ Ù„Ù„Ù…Ø·Ø¨Ø®.' : 'ØªÙ… Ø±ÙØ¶ Ø·Ù„Ø¨ QR ÙˆØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø³Ø¨Ø¨.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø·Ù„Ø¨ QR'); return false } finally { setPendingId(null) }
  }

  async function handoverAction(id: string, action: 'accept' | 'reject', reason?: string): Promise<boolean> {
    if (pendingId) return false
    setPendingId(id); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/staff/waiter/handovers/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action === 'reject' ? { action, reason } : { action }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø·Ù„Ø¨ Ø§Ù„ØªØ³Ù„ÙŠÙ…')
      setSuccess(action === 'accept' ? `ØªÙ… Ù‚Ø¨ÙˆÙ„ Ø§Ù„ØªØ³Ù„ÙŠÙ… ÙˆÙ†Ù‚Ù„ ${data.transferredOrders ?? 0} Ø·Ù„Ø¨.` : 'ØªÙ… Ø±ÙØ¶ Ø·Ù„Ø¨ Ø§Ù„ØªØ³Ù„ÙŠÙ… ÙˆØªÙˆØ«ÙŠÙ‚ Ø§Ù„Ø³Ø¨Ø¨.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø·Ù„Ø¨ Ø§Ù„ØªØ³Ù„ÙŠÙ…'); return false } finally { setPendingId(null) }
  }

  async function transferAction(orderId: string, tableId: string, reason: string): Promise<boolean> {
    if (pendingId) return false
    setPendingId(orderId); setError(null); setSuccess(null)
    try {
      const response = await fetch(`/api/staff/orders/${orderId}/waiter`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'transfer_table', tableId, reason }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error ?? 'ØªØ¹Ø°Ø± Ù†Ù‚Ù„ Ø§Ù„Ø·Ø§ÙˆÙ„Ø©')
      setSelectedTableId(tableId); setSuccess('ØªÙ… Ù†Ù‚Ù„ Ø§Ù„Ø·Ù„Ø¨ Ù„Ù„Ø·Ø§ÙˆÙ„Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø¯ÙˆÙ† ØªØºÙŠÙŠØ± Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø£Ùˆ Ø§Ù„Ø¯ÙØ¹.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ù†Ù‚Ù„ Ø§Ù„Ø·Ø§ÙˆÙ„Ø©'); return false } finally { setPendingId(null) }
  }

  return <div className="min-h-screen w-full bg-background" dir="rtl">
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur lg:px-6"><div><h1 className="text-xl font-bold">Ù…Ø­Ø·Ø© Ø§Ù„ÙˆÙŠØªØ±</h1><p className="text-sm text-muted-foreground">{workspace.branchName} Â· {workspace.employeeName}</p>{workspace.shift ? <p className="text-xs text-muted-foreground">ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø© Â· Ù…ÙØªÙˆØ­Ø© Ù…Ù†Ø° {formatTime(new Date(workspace.shift.openedAt))}</p> : <p className="text-xs text-muted-foreground text-destructive">Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©</p>}</div><div className="text-xs text-muted-foreground">{workspace.openOrders.length} Ø·Ù„Ø¨ Ù†Ø´Ø· Â· {ready.length} Ø¬Ø§Ù‡Ø² Ù„Ù„ØªÙ‚Ø¯ÙŠÙ…</div><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => window.history.back()}>Ø±Ø¬ÙˆØ¹</Button><form action="/login?next=/waiter"><Button type="submit" variant="ghost">ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬</Button></form></div></header>
    <nav className="sticky top-[73px] z-20 w-full border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:px-6" aria-label="Ø£Ù‚Ø³Ø§Ù… Ù…Ø­Ø·Ø© Ø§Ù„ÙˆÙŠØªØ±"><Segmented options={[{ value: 'home', label: 'Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©' }, { value: 'tables', label: 'Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª' }, { value: 'qr', label: 'Ø·Ù„Ø¨Ø§Øª QR' }, { value: 'orders', label: 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª' }, { value: 'ready', label: 'Ø§Ù„Ø¬Ø§Ù‡Ø² Ù„Ù„ØªÙ‚Ø¯ÙŠÙ…' }, { value: 'service', label: 'Ø§Ù„Ø®Ø¯Ù…Ø©' }, { value: 'shift', label: 'Ø§Ù„ÙˆØ±Ø¯ÙŠØ©' }]} value={tab} onChange={(value) => setTab(value as WorkspaceTab)} ariaLabel="Ø£Ù‚Ø³Ø§Ù… Ù…Ø­Ø·Ø© Ø§Ù„ÙˆÙŠØªØ±" className="w-full justify-start overflow-x-auto" /></nav>
    <main className="w-full p-4 lg:p-6"><div className="flex w-full flex-col gap-5">
    {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
    {success ? <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{success}</p> : null}
    {tab === 'home' ? <WaiterHome tables={workspace.tables.length} activeOrders={workspace.openOrders.length} readyItems={ready.reduce((total, order) => total + order.items.reduce((sum, item) => sum + Math.max(0, Math.min(item.qty, item.preparedQty) - item.servedQty), 0), 0)} qrOrders={qrOrders.length} delayed={delayed.length} onOpen={(next) => setTab(next)} delayedOrders={delayed.slice(0, 3)} pendingId={pendingId} onAct={act} onEdit={setEditing} /> : null}
    {tab === 'tables' ? <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª Ù…Ø­Ø³ÙˆØ¨Ø© Ù…Ù† Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ© Ø§Ù„Ù…ÙØªÙˆØ­Ø©. Ù…Ø®Ø·Ø· Ø§Ù„Ø£Ø±Ø¶ÙŠØ© ØºÙŠØ± Ù…ØªØ§Ø­ Ù„Ø£Ù† Ù†Ù…ÙˆØ°Ø¬ Ø§Ù„Ù…ÙˆØ§Ù‚Ø¹ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ Ø­Ø§Ù„ÙŠÙ‹Ø§.</p><Button size="sm" onClick={() => setTab('create')}><Icon name="plus" size={15} />Ø·Ù„Ø¨ Ø¬Ø¯ÙŠØ¯</Button></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{workspace.tables.map((table) => <button key={table.id} type="button" onClick={() => setSelectedTableId(table.id)} className={cn('rounded-lg border bg-card p-4 text-right transition-colors hover:bg-accent', table.openOrders > 0 ? 'border-warning/40' : 'border-success/40', selectedTableId === table.id && 'ring-2 ring-primary')}><span className="block text-xl font-bold">Ø·Ø§ÙˆÙ„Ø© {table.number}</span><span className="text-xs text-muted-foreground">{table.name ?? `${table.capacity} Ù…Ù‚Ø§Ø¹Ø¯`}</span><span className={cn('mt-2 block text-xs font-medium', table.openOrders ? 'text-warning' : 'text-success')}>{table.openOrders ? `${table.openOrders} Ø·Ù„Ø¨ Ù†Ø´Ø·` : 'Ù…ØªØ§Ø­Ø©'}</span></button>)}</div>
      {selectedTable ? <Card><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Ø·Ø§ÙˆÙ„Ø© {selectedTable.number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selectedTable.name ?? 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø© Ù„Ù„Ø·Ø§ÙˆÙ„Ø©'}</p></div><Button size="sm" onClick={() => setTab('create')}><Icon name="plus" size={15} />Ø·Ù„Ø¨ Ø¬Ø¯ÙŠØ¯</Button></CardHeader><CardContent><OrderCards orders={selectedOrders} pendingId={pendingId} onAct={act} onEdit={setEditing} /></CardContent></Card> : <EmptyState icon="tables" title="Ø§Ø®ØªØ± Ø·Ø§ÙˆÙ„Ø©" description="Ø§Ø³ØªØ¹Ø±Ø¶ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø© Ù„Ù„Ø·Ø§ÙˆÙ„Ø© Ø£Ùˆ Ø£Ù†Ø´Ø¦ Ø·Ù„Ø¨Ù‹Ø§ Ø¬Ø¯ÙŠØ¯Ù‹Ø§." />}</> : null}
    {tab === 'tables' && selectedTable ? <TableTransferPanel orders={selectedOrders} tables={workspace.tables} currentUserId={workspace.currentUserId} pendingId={pendingId} onTransfer={transferAction} /> : null}
    {tab === 'qr' ? <QrOrdersPanel orders={qrOrders} currentUserId={workspace.currentUserId} pendingId={pendingId} onAction={qrAction} /> : null}
    {tab === 'orders' ? <><div className="mb-3 flex flex-col gap-2"><Segmented options={[{ value: 'all', label: 'ÙƒÙ„ Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙØ±Ø¹' }, { value: 'mine', label: 'Ø·Ù„Ø¨Ø§ØªÙŠ ÙÙ‚Ø·' }]} value={orderScope} onChange={(value) => setOrderScope(value as 'mine' | 'all')} ariaLabel="Ù†Ø·Ø§Ù‚ Ø§Ù„Ø·Ù„Ø¨Ø§Øª" /><Segmented options={[{ value: 'new', label: 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø¥Ø±Ø³Ø§Ù„' }, { value: 'preparing', label: 'Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ø¶ÙŠØ±' }, { value: 'ready', label: 'Ø¬Ø§Ù‡Ø²' }, { value: 'cancelled', label: 'Ù…Ù„ØºÙ‰' }]} value={filter} onChange={setFilter} ariaLabel="ØªØµÙÙŠØ© Ø§Ù„Ø·Ù„Ø¨Ø§Øª" /></div><OrderCards orders={visible} pendingId={pendingId} onAct={act} onEdit={setEditing} /></> : null}
    {tab === 'ready' ? <><ReadyItemServeList orders={ready} pendingId={pendingId} onServe={(orderId, itemId, quantity) => act(orderId, 'serve_items', undefined, [{ orderItemId: itemId, quantity }])} /><OrderCards orders={ready} pendingId={pendingId} onAct={act} onEdit={setEditing} emptyTitle="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ø¬Ø§Ù‡Ø²Ø©" emptyDescription="Ø³ØªØ¸Ù‡Ø± Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ù‡Ù†Ø§ ÙÙˆØ± Ø£Ù† ÙŠØ­Ø¯Ø¯ Ø§Ù„Ù…Ø·Ø¨Ø® Ø£Ù†Ù‡Ø§ Ø¬Ø§Ù‡Ø²Ø©." /></> : null}
    {tab === 'ready' ? <EmergencyServingPanel orders={ready} currentUserId={workspace.currentUserId} pendingId={pendingId} onServe={(orderId, itemId, quantity, reason) => act(orderId, 'serve_items', undefined, [{ orderItemId: itemId, quantity }], reason)} /> : null}
    {tab === 'service' ? <ServiceRequestBoard /> : null}
    {tab === 'shift' ? <HandoverShiftPanel shift={workspace.shift} handovers={workspace.incomingHandovers} pendingId={pendingId} onAction={handoverAction} /> : null}
    {tab === 'create' ? <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨ Ø­Ù‚ÙŠÙ‚ÙŠ Ø¨Ø£Ø³Ø¹Ø§Ø± ÙŠØ­Ø³Ø¨Ù‡Ø§ Ø§Ù„Ø®Ø§Ø¯Ù…Ø› Ù„Ø§ ÙŠÙ…Ù†Ø­ Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø£ÙŠ ØµÙ„Ø§Ø­ÙŠØ© ØªØ­ØµÙŠÙ„.</p><PosCheckout catalog={catalog} initialTableId={selectedTable?.id} /></div> : null}
    {editing ? <WaiterOrderEditor order={editing} products={catalog.products} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setSuccess('ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨ Ù‚Ø¨Ù„ Ø¥Ø±Ø³Ø§Ù„Ù‡ Ù„Ù„Ù…Ø·Ø¨Ø®.'); startTransition(() => router.refresh()) }} /> : null}
    </div></main>
  </div>
}

type WaiterAction = (id: string, action: 'send_to_kitchen' | 'status' | 'serve_items', to?: 'served', items?: { orderItemId: string; quantity: number }[]) => void

function TableTransferPanel({ orders, tables, currentUserId, pendingId, onTransfer }: { orders: WaiterWorkspace['openOrders']; tables: WaiterWorkspace['tables']; currentUserId: string; pendingId: string | null; onTransfer: (orderId: string, tableId: string, reason: string) => Promise<boolean> }) {
  const eligible = orders.filter((order) => order.responsibleWaiterId === currentUserId && ['new', 'preparing', 'ready'].includes(order.status) && order.paymentStatus === 'unpaid')
  const [orderId, setOrderId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [reason, setReason] = useState('')
  const available = tables.filter((table) => table.openOrders === 0)
  if (!eligible.length) return null
  async function submit() {
    if (!orderId || !destinationId || reason.trim().length < 3 || !window.confirm('ØªØ£ÙƒÙŠØ¯ Ù†Ù‚Ù„ Ø§Ù„Ø·Ù„Ø¨ Ø¥Ù„Ù‰ Ø§Ù„Ø·Ø§ÙˆÙ„Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©ØŸ')) return
    if (await onTransfer(orderId, destinationId, reason.trim())) { setOrderId(''); setDestinationId(''); setReason('') }
  }
  return <Card className="mt-4"><CardHeader><CardTitle>Ù†Ù‚Ù„ Ø·Ø§ÙˆÙ„Ø©</CardTitle><p className="text-sm text-muted-foreground">Ø§Ù„Ù†Ù‚Ù„ Ù„Ø§ ÙŠØºÙŠØ± Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø£Ùˆ Ø³Ø¬Ù„ Ø§Ù„ØªØ­ØµÙŠÙ„ØŒ ÙˆÙŠØ¸Ù„ Ø§Ù„ÙˆÙŠØªØ± Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„ ÙƒÙ…Ø§ Ù‡Ùˆ.</p></CardHeader><CardContent className="grid gap-2 md:grid-cols-4"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Ø§Ø®ØªØ± Ø§Ù„Ø·Ù„Ø¨</option>{eligible.map((order) => <option key={order.id} value={order.id}>{order.number}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={destinationId} onChange={(event) => setDestinationId(event.target.value)}><option value="">Ø§Ù„Ø·Ø§ÙˆÙ„Ø© Ø§Ù„Ù…ØªØ§Ø­Ø©</option>{available.map((table) => <option key={table.id} value={table.id}>Ø·Ø§ÙˆÙ„Ø© {table.number}</option>)}</select><Input value={reason} maxLength={255} onChange={(event) => setReason(event.target.value)} placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ù†Ù‚Ù„ (Ù…Ø·Ù„ÙˆØ¨)" /><Button disabled={!orderId || !destinationId || reason.trim().length < 3 || pendingId === orderId} onClick={() => void submit()}>{pendingId === orderId ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ù†Ù‚Ù„â€¦' : 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ù†Ù‚Ù„'}</Button></CardContent></Card>
}

function EmergencyServingPanel({ orders, currentUserId, pendingId, onServe }: { orders: WaiterWorkspace['openOrders']; currentUserId: string; pendingId: string | null; onServe: (orderId: string, itemId: string, quantity: number, reason: string) => void }) {
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const emergencyLines = orders.flatMap((order) => order.responsibleWaiterId && order.responsibleWaiterId !== currentUserId ? order.items.map((item) => ({ order, item, remaining: Math.max(0, Math.min(item.qty, item.preparedQty) - item.servedQty) })).filter((line) => line.remaining > 0) : [])
  if (!emergencyLines.length) return null
  return <Card className="border-warning/50"><CardHeader><CardTitle>ØªÙ‚Ø¯ÙŠÙ… Ø·Ø§Ø±Ø¦ Ù„Ø¹Ù†Ø§ØµØ± Ø¬Ø§Ù‡Ø²Ø©</CardTitle><p className="text-sm text-muted-foreground">Ù„Ø§ ÙŠØ¸Ù‡Ø± Ø¥Ù„Ø§ Ø§Ù„Ø¹Ù†ØµØ± Ø§Ù„Ø°ÙŠ Ø­Ø¯Ø¯Ù‡ Ø§Ù„Ù…Ø·Ø¨Ø® Ø¬Ø§Ù‡Ø²Ù‹Ø§. Ø§Ù„Ø³Ø¨Ø¨ Ø¥Ù„Ø²Ø§Ù…ÙŠ ÙˆÙŠÙØ³Ø¬Ù‘Ù„ Ø¨Ø§Ø³Ù… Ù…Ù‚Ø¯Ù… Ø§Ù„Ø®Ø¯Ù…Ø© Ø§Ù„ÙØ¹Ù„ÙŠ.</p></CardHeader><CardContent className="space-y-3">{emergencyLines.map(({ order, item, remaining }) => { const reason = reasons[item.id] ?? ''; return <div key={item.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_auto]"><div><p className="font-medium">{order.number} Â· {item.name}</p><p className="text-xs text-muted-foreground">Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„: {order.responsibleWaiterName ?? 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'} Â· Ø§Ù„Ø¬Ø§Ù‡Ø² Ù„Ù„ØªÙ‚Ø¯ÙŠÙ…: {remaining}</p></div><Input value={reason} maxLength={255} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Ø³Ø¨Ø¨ Ø§Ù„ØªØ¯Ø®Ù„ Ø§Ù„Ø·Ø§Ø±Ø¦ (Ù…Ø·Ù„ÙˆØ¨)" /><Button variant="outline" disabled={pendingId === order.id || reason.trim().length < 3} onClick={() => { if (window.confirm('ØªØ£ÙƒÙŠØ¯ ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø¹Ù†ØµØ± Ø§Ù„Ø¬Ø§Ù‡Ø² Ø·Ø§Ø±Ø¦Ù‹Ø§ØŸ')) onServe(order.id, item.id, remaining, reason.trim()) }}>{pendingId === order.id ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦' : 'ØªÙ‚Ø¯ÙŠÙ… Ø·Ø§Ø±Ø¦'}</Button></div> })}</CardContent></Card>
}

function HandoverShiftPanel({ shift, handovers, pendingId, onAction }: { shift: WaiterWorkspace['shift']; handovers: WaiterWorkspace['incomingHandovers']; pendingId: string | null; onAction: (id: string, action: 'accept' | 'reject', reason?: string) => Promise<boolean> }) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  return <section className="space-y-4"><Card><CardHeader><CardTitle>ÙˆØ±Ø¯ÙŠØ© Ø§Ù„ÙˆÙŠØªØ±</CardTitle><p className="mt-1 text-sm text-muted-foreground">{shift ? `Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø© Ù…Ù†Ø° ${formatTime(new Date(shift.openedAt))}.` : 'Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©.'}</p></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Link href="/shifts" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">ÙØªØ­ ØµÙØ­Ø© Ø§Ù„ÙˆØ±Ø¯ÙŠØ©</Link><p className="text-xs text-muted-foreground">Ù„Ø§ ØªÙØºÙ„Ù‚ ÙˆØ±Ø¯ÙŠØ© Ø§Ù„ÙˆÙŠØªØ± Ù…Ø§ Ø¯Ø§Ù…Øª Ù„Ø¯ÙŠÙ‡Ø§ Ø·Ù„Ø¨Ø§Øª ØªØ´ØºÙŠÙ„ÙŠØ©Ø› Ø§Ù„Ù‚Ø¨ÙˆÙ„ ÙŠÙ†Ù‚Ù„Ù‡Ø§ Ø°Ø±ÙŠÙ‹Ø§ Ø¥Ù„Ù‰ ÙˆØ±Ø¯ÙŠØªÙƒ Ø§Ù„Ù…ÙØªÙˆØ­Ø©.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Ø·Ù„Ø¨Ø§Øª ØªØ³Ù„ÙŠÙ… Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„ÙŠØ§Øª Ø§Ù„ÙˆØ§Ø±Ø¯Ø©</CardTitle><p className="mt-1 text-sm text-muted-foreground">Ø±Ø§Ø¬Ø¹ Ø§Ù„Ø·Ù„Ø¨Ø§Øª ÙˆØ§Ù„Ø·Ø§ÙˆÙ„Ø§Øª Ù‚Ø¨Ù„ Ø§Ù„Ù‚Ø¨ÙˆÙ„. Ù„Ø§ ÙŠÙ…ÙƒÙ† Ù‚Ø¨ÙˆÙ„ Ø§Ù„Ø·Ù„Ø¨ Ø¨Ø¯ÙˆÙ† ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©.</p></CardHeader><CardContent className="space-y-3">{handovers.length === 0 ? <EmptyState icon="clock" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª ØªØ³Ù„ÙŠÙ…" description="Ø³ØªØ¸Ù‡Ø± Ù‡Ù†Ø§ Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙˆÙŠØªØ±ÙŠÙ† Ø§Ù„Ø¢Ø®Ø±ÙŠÙ† Ø§Ù„ØªÙŠ ØªØ­ØªØ§Ø¬ Ø¥Ù„Ù‰ Ù…ÙˆØ§ÙÙ‚ØªÙƒ." /> : handovers.map((handover) => <div key={handover.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">Ù…Ù†: {handover.senderName}</p><p className="text-xs text-muted-foreground">{formatRelative(new Date(handover.requestedAt))} Â· {handover.outstandingOrders.length} Ø·Ù„Ø¨ ØªØ´ØºÙŠÙ„ÙŠ</p></div><Badge tone="warning">Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ù‚Ø¨ÙˆÙ„Ùƒ</Badge></div>{handover.notes ? <p className="mt-2 text-sm text-muted-foreground">Ù…Ù„Ø§Ø­Ø¸Ø©: {handover.notes}</p> : null}<ul className="mt-2 space-y-1 text-sm">{handover.outstandingOrders.map((order) => <li key={order.id}>#{order.number} Â· Ø·Ø§ÙˆÙ„Ø© {order.tableNumber} Â· {order.status}</li>)}</ul><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={pendingId === handover.id} onClick={() => void onAction(handover.id, 'accept')}>{pendingId === handover.id ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ù‚Ø¨ÙˆÙ„â€¦' : 'Ù‚Ø¨ÙˆÙ„ Ø§Ù„ØªØ³Ù„ÙŠÙ…'}</Button><Button size="sm" variant="outline" disabled={pendingId === handover.id} onClick={() => { setRejecting(handover.id); setReason('') }}>Ø±ÙØ¶</Button></div>{rejecting === handover.id ? <div className="mt-3 space-y-2 rounded border border-warning/40 p-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ø±ÙØ¶ (Ù…Ø·Ù„ÙˆØ¨)" /><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={pendingId === handover.id || reason.trim().length < 3} onClick={() => void (async () => { if (await onAction(handover.id, 'reject', reason.trim())) setRejecting(null) })()}>ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø±ÙØ¶</Button><Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Ø¥Ù„ØºØ§Ø¡</Button></div></div> : null}</div>)}</CardContent></Card></section>
}

function WaiterHome({ tables, activeOrders, readyItems, qrOrders, delayed, delayedOrders, pendingId, onAct, onEdit, onOpen }: { tables: number; activeOrders: number; readyItems: number; qrOrders: number; delayed: number; delayedOrders: WaiterWorkspace['openOrders']; pendingId: string | null; onAct: WaiterAction; onEdit: (order: WaiterWorkspace['openOrders'][number]) => void; onOpen: (tab: WorkspaceTab) => void }) {
  const cards: { label: string; value: number; tab: WorkspaceTab; tone: string }[] = [
    { label: 'Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª', value: tables, tab: 'tables', tone: 'border-primary/40' },
    { label: 'Ø·Ù„Ø¨Ø§Øª Ù†Ø´Ø·Ø©', value: activeOrders, tab: 'orders', tone: 'border-info/40' },
    { label: 'Ø¹Ù†Ø§ØµØ± Ø¬Ø§Ù‡Ø²Ø© Ù„Ù„ØªÙ‚Ø¯ÙŠÙ…', value: readyItems, tab: 'ready', tone: 'border-success/40' },
    { label: 'Ø·Ù„Ø¨Ø§Øª QR', value: qrOrders, tab: 'qr', tone: 'border-warning/40' },
  ]
  return <section className="space-y-5" aria-label="Ù…Ù„Ø®Øµ ÙˆØ±Ø¯ÙŠØ© Ø§Ù„ÙˆÙŠØªØ±">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <button key={card.label} type="button" onClick={() => onOpen(card.tab)} className={cn('rounded-xl border bg-card p-4 text-right transition hover:bg-accent', card.tone)}><span className="block text-2xl font-bold">{card.value}</span><span className="mt-1 block text-sm text-muted-foreground">{card.label}</span></button>)}</div>
    <Card className={delayed ? 'border-warning/50' : undefined}><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„ØªØ´ØºÙŠÙ„</CardTitle><p className="mt-1 text-sm text-muted-foreground">Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªÙŠ ØªØ¬Ø§ÙˆØ²Øª 20 Ø¯Ù‚ÙŠÙ‚Ø© ØªØ¸Ù‡Ø± Ù‡Ù†Ø§ Ù„ØªØªØ§Ø¨Ø¹Ù‡Ø§ Ù…Ø¹ Ø§Ù„Ù…Ø·Ø¨Ø®.</p></div><Badge tone={delayed ? 'warning' : 'success'}>{delayed ? `${delayed} Ù…ØªØ£Ø®Ø±` : 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ ØªØ£Ø®ÙŠØ±'}</Badge></CardHeader><CardContent>{delayedOrders.length ? <OrderCards orders={delayedOrders} pendingId={pendingId} onAct={onAct} onEdit={onEdit} /> : <EmptyState icon="clock" title="Ø§Ù„Ø¹Ù…Ù„ ÙŠØ³ÙŠØ± Ø¶Ù…Ù† Ø§Ù„ÙˆÙ‚Øª" description="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª ØªØ´ØºÙŠÙ„ÙŠØ© Ù…ØªØ£Ø®Ø±Ø© Ø¶Ù…Ù† Ø§Ù„Ù„Ù‚Ø·Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©." />}</CardContent></Card>
    <Card><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Ù…Ù‡Ø§Ù… Ø§Ù„ÙˆØ±Ø¯ÙŠØ©</CardTitle><p className="mt-1 text-sm text-muted-foreground">Ø§Ø¨Ø¯Ø£ Ø£Ùˆ Ø±Ø§Ø¬Ø¹ ÙˆØ±Ø¯ÙŠØªÙƒ Ù…Ù† Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ù…Ø®ØµØµØ©Ø› Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ù…Ù„ÙŠØ§Øª Ù†Ù‚Ø¯ÙŠØ© ÙÙŠ Ù…Ø­Ø·Ø© Ø§Ù„ÙˆÙŠØªØ±.</p></div><Button variant="outline" onClick={() => onOpen('shift')}>Ø¹Ø±Ø¶ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©</Button></CardHeader></Card>
  </section>
}

function QrOrdersPanel({ orders, currentUserId, pendingId, onAction }: { orders: WaiterWorkspace['openOrders']; currentUserId: string; pendingId: string | null; onAction: (id: string, action: 'claim_qr' | 'approve_qr' | 'reject_qr', reason?: string) => Promise<boolean> }) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  return <section className="space-y-3"><Card><CardHeader><CardTitle>Ø·Ù„Ø¨Ø§Øª QR Ø§Ù„ÙˆØ§Ø±Ø¯Ø©</CardTitle><p className="text-sm text-muted-foreground">Ù„Ø§ ÙŠØ¯Ø®Ù„ Ø·Ù„Ø¨ QR Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø·Ø¨Ø® Ù‚Ø¨Ù„ Ø£Ù† ÙŠØ³ØªÙ„Ù…Ù‡ Ù†Ø§Ø¯Ù„ ÙˆÙŠØ¹ØªÙ…Ø¯Ù‡. Ø§Ù„ØªØ­ØµÙŠÙ„ ÙŠØ¨Ù‚Ù‰ Ù„Ù„ÙƒØ§Ø´ÙŠØ±.</p></CardHeader></Card>{orders.length === 0 ? <EmptyState icon="orders" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª QR Ù†Ø´Ø·Ø©" description="Ø³ØªØ¸Ù‡Ø± Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªÙŠ ÙŠØ±Ø³Ù„Ù‡Ø§ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ù…Ù† Ø±Ù…Ø² Ø§Ù„Ø·Ø§ÙˆÙ„Ø© Ù‡Ù†Ø§." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{orders.map((order) => {
    const mine = order.responsibleWaiterId === currentUserId
    const claimed = order.responsibleWaiterId !== null
    const busy = pendingId === order.id
    return <Card key={order.id}><CardHeader className="flex-row items-start justify-between gap-2"><div><CardTitle className="text-base">{order.number}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Ø·Ø§ÙˆÙ„Ø© {order.tableNumber} Â· {formatRelative(new Date(order.createdAt))}</p></div><Badge tone={order.sentToKitchen ? 'success' : claimed ? 'primary' : 'warning'}>{order.sentToKitchen ? 'Ø£ÙØ±Ø³Ù„ Ù„Ù„Ù…Ø·Ø¨Ø®' : mine ? 'Ù…Ø³Ø¤ÙˆÙ„ÙŠØªÙƒ' : claimed ? 'Ù…Ø³ØªÙ„Ù…' : 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…'}</Badge></CardHeader><CardContent className="space-y-3"><ul className="border-y border-border py-2 text-sm">{order.items.map((item) => <li key={item.id} className="py-1">{item.qty}Ã— {item.name}</li>)}</ul>{!claimed && !order.sentToKitchen ? <Button className="w-full" disabled={busy} onClick={() => void onAction(order.id, 'claim_qr')}>{busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…â€¦' : 'Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø·Ù„Ø¨'}</Button> : null}{mine && !order.sentToKitchen ? <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void onAction(order.id, 'approve_qr')}>{busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯â€¦' : 'Ø§Ø¹ØªÙ…Ø§Ø¯ ÙˆØ¥Ø±Ø³Ø§Ù„ Ù„Ù„Ù…Ø·Ø¨Ø®'}</Button><Button variant="outline" disabled={busy} onClick={() => { setRejecting(order.id); setReason('') }}>Ø±ÙØ¶</Button></div> : null}{rejecting === order.id ? <div className="space-y-2 rounded-md border border-warning/40 p-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ø±ÙØ¶ (Ù…Ø·Ù„ÙˆØ¨)" /><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void (async () => { if (await onAction(order.id, 'reject_qr', reason.trim())) setRejecting(null) })()}>ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø±ÙØ¶</Button><Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Ø¥Ù„ØºØ§Ø¡</Button></div></div> : null}</CardContent></Card>
  })}</div>}</section>
}

function ShiftPanel({ shift }: { shift: WaiterWorkspace['shift'] }) {
  return <Card><CardHeader><CardTitle>ÙˆØ±Ø¯ÙŠØ© Ø§Ù„ÙˆÙŠØªØ±</CardTitle><p className="mt-1 text-sm text-muted-foreground">{shift ? `Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø© Ù…Ù†Ø° ${formatTime(new Date(shift.openedAt))}.` : 'Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©.'}</p></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Link href="/shifts" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">ÙØªØ­ ØµÙØ­Ø© Ø§Ù„ÙˆØ±Ø¯ÙŠØ©</Link><p className="text-xs text-muted-foreground">ØªØ³Ù„ÙŠÙ… Ø§Ù„ÙˆØ±Ø¯ÙŠØ© ÙˆØªØ£ÙƒÙŠØ¯ Ø§Ù„Ù…Ø³ØªÙ„Ù… Ù„ÙŠØ³Ø§ Ø³ÙŠØ± Ø¹Ù…Ù„ Ø®Ø§ØµÙ‹Ø§ Ø¨Ø§Ù„ÙˆÙŠØªØ± ÙÙŠ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ Ø§Ù„Ø­Ø§Ù„ÙŠ.</p></CardContent></Card>
}

function OrderCards({ orders, pendingId, onAct, onEdit, emptyTitle = 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª', emptyDescription = 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø© Ø­Ø§Ù„ÙŠÙ‹Ø§.' }: { orders: WaiterWorkspace['openOrders']; pendingId: string | null; onAct: WaiterAction; onEdit: (order: WaiterWorkspace['openOrders'][number]) => void; emptyTitle?: string; emptyDescription?: string }) {
  if (!orders.length) return <EmptyState icon="orders" title={emptyTitle} description={emptyDescription} />
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{orders.map((order) => {
    const meta = ORDER_STATUS_META[order.status as OrderStatusKey]
    return <Card key={order.id} className={cn(order.status === 'ready' && 'border-primary/50', order.status === 'cancelled' && 'border-destructive/40')}><CardHeader className="flex-row items-start justify-between gap-2"><div><CardTitle className="text-base">{order.number}</CardTitle><p className="text-xs text-muted-foreground">Ø·Ø§ÙˆÙ„Ø© {order.tableNumber} Â· {formatRelative(new Date(order.createdAt))}</p></div><Badge tone={(meta?.tone ?? 'muted') as BadgeTone}>{meta?.label ?? order.status}</Badge></CardHeader><CardContent className="flex flex-col gap-3"><ul className="border-y border-border py-2 text-sm">{order.items.map((item, index) => <li key={`${item.name}-${index}`} className="py-1"><span>{item.qty}Ã— {item.name} Â· {formatCurrency(item.unitPrice)}</span>{item.note ? <small className="block text-warning">Ù…Ù„Ø§Ø­Ø¸Ø©: {item.note}</small> : null}</li>)}</ul>{order.orderNotes ? <p className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">Ù…Ù„Ø§Ø­Ø¸Ø© Ø§Ù„Ø·Ù„Ø¨: {order.orderNotes}</p> : null}<div className="flex items-center justify-between gap-2"><span className="font-semibold">{formatCurrency(order.total)}</span>{order.status === 'new' ? (order.sentToKitchen ? <span className="text-sm text-success">Ø£ÙØ±Ø³Ù„ Ù„Ù„Ù…Ø·Ø¨Ø®</span> : <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pendingId === order.id} onClick={() => onEdit(order)}>ØªØ¹Ø¯ÙŠÙ„</Button><Button size="sm" disabled={pendingId === order.id} onClick={() => onAct(order.id, 'send_to_kitchen')}><Icon name="flame" size={14} />{pendingId === order.id ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ø±Ø³Ø§Ù„â€¦' : 'Ø¥Ø±Ø³Ø§Ù„ Ù„Ù„Ù…Ø·Ø¨Ø®'}</Button></div>) : order.status === 'ready' ? <Button size="sm" disabled={pendingId === order.id} onClick={() => onAct(order.id, 'status', 'served')}><Icon name="utensils" size={14} />{pendingId === order.id ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦' : 'ØªÙ… Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…'}</Button> : <span className="text-xs text-muted-foreground">{order.status === 'cancelled' ? (order.cancelReason ?? 'Ø·Ù„Ø¨ Ù…Ù„ØºÙ‰') : 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ø·Ø¨Ø®'}</span>}</div></CardContent></Card>
  })}</div>
}

/** Individual service controls retain the existing order-card "serve all"
 * action while exposing the authoritative per-item endpoint for partial runs. */
function ReadyItemServeList({ orders, pendingId, onServe }: { orders: WaiterWorkspace['openOrders']; pendingId: string | null; onServe: (orderId: string, itemId: string, quantity: number) => void }) {
  if (!orders.length) return <EmptyState icon="orders" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ø¬Ø§Ù‡Ø²Ø©" description="Ø³ØªØ¸Ù‡Ø± Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ù‡Ù†Ø§ ÙÙˆØ± Ø£Ù† ÙŠØ­Ø¯Ø¯ Ø§Ù„Ù…Ø·Ø¨Ø® Ø£Ù†Ù‡Ø§ Ø¬Ø§Ù‡Ø²Ø©." />
  return <div className="grid gap-3 lg:grid-cols-2">{orders.map((order) => <Card key={`items-${order.id}`}><CardHeader><CardTitle className="text-base">{order.number} Â· Ø·Ø§ÙˆÙ„Ø© {order.tableNumber}</CardTitle></CardHeader><CardContent className="space-y-2">{order.items.map((item) => {
    const remaining = Math.max(0, Math.min(item.qty, item.preparedQty) - item.servedQty)
    return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><span>{item.name} Â· Ù‚ÙØ¯Ù… {item.servedQty} Ù…Ù† {item.qty}</span>{remaining > 0 ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pendingId === order.id} onClick={() => onServe(order.id, item.id, 1)}>ØªÙ‚Ø¯ÙŠÙ… ÙˆØ§Ø­Ø¯</Button><Button size="sm" disabled={pendingId === order.id} onClick={() => onServe(order.id, item.id, remaining)}>ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ ({remaining})</Button></div> : <Badge tone="success">ØªÙ… Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…</Badge>}</div>
  })}</CardContent></Card>)}</div>
}

function WaiterOrderEditor({ order, products, onClose, onSaved }: { order: WaiterWorkspace['openOrders'][number]; products: { id: string; name: string; price: string; isAvailable: boolean }[]; onClose: () => void; onSaved: () => void }) {
  const [lines, setLines] = useState(order.items.map((item) => ({ productId: item.productId, qty: item.qty, note: item.note ?? '' })))
  const [notes, setNotes] = useState(order.orderNotes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const previewTotal = lines.reduce((total, line) => total + (Number(productById.get(line.productId)?.price ?? 0) * line.qty), 0)
  function add(productId: string) { setLines((current) => { const existing = current.find((line) => line.productId === productId); return existing ? current.map((line) => line.productId === productId ? { ...line, qty: Math.min(20, line.qty + 1) } : line) : [...current, { productId, qty: 1, note: '' }] }) }
  function changeQty(productId: string, delta: number) { setLines((current) => current.map((line) => line.productId === productId ? { ...line, qty: line.qty + delta } : line).filter((line) => line.qty > 0)) }
  async function save() {
    if (!lines.length || busy) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/staff/orders/${order.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: lines, notes: notes.trim() || undefined }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error ?? 'ØªØ¹Ø°Ø± ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨')
      onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨') } finally { setBusy(false) }
  }
  return <div role="dialog" aria-modal="true" aria-label="ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"><Card className="mx-auto my-6 w-full max-w-3xl"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>ØªØ¹Ø¯ÙŠÙ„ {order.number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ Ù…ØªØ§Ø­ ÙÙ‚Ø· Ù‚Ø¨Ù„ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„ Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø·Ø¨Ø®.</p></div><Button variant="ghost" size="sm" onClick={onClose}>Ø¥ØºÙ„Ø§Ù‚</Button></CardHeader><CardContent className="flex flex-col gap-4">{error ? <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}<div className="grid gap-2 sm:grid-cols-2">{products.map((product) => <Button key={product.id} type="button" variant="outline" disabled={!product.isAvailable} className="justify-between" onClick={() => add(product.id)}><span>{product.name}</span><span>{formatCurrency(Number(product.price))}</span></Button>)}</div><div className="flex flex-col gap-2 border-t pt-3">{lines.map((line) => { const product = productById.get(line.productId); return <div key={line.productId} className="flex flex-wrap items-center gap-2 rounded border p-2"><span className="min-w-32 flex-1 text-sm font-medium">{product?.name ?? 'ØµÙ†Ù ØºÙŠØ± Ù…ØªØ§Ø­'}</span><Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(line.productId, -1)}><Icon name="minus" size={14} /></Button><span className="w-6 text-center">{line.qty}</span><Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(line.productId, 1)}><Icon name="plus" size={14} /></Button><Input value={line.note} maxLength={255} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, note: event.target.value } : item))} placeholder="Ù…Ù„Ø§Ø­Ø¸Ø© Ù„Ù„ØµÙ†Ù" className="h-8 sm:w-56" /></div> })}</div><label className="flex flex-col gap-1 text-sm"><span className="text-muted-foreground">Ù…Ù„Ø§Ø­Ø¸Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨ (Ø§Ø®ØªÙŠØ§Ø±ÙŠØ©)</span><Input value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Ø£ÙŠ ØªØ¹Ù„ÙŠÙ…Ø§Øª Ø¹Ø§Ù…Ø© Ù„Ù„Ù…Ø·Ø¨Ø®" /></label><div className="flex items-center justify-between border-t pt-3"><span className="font-bold">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ù…Ø¹Ø§ÙŠÙ†Ø©: {formatCurrency(previewTotal)}</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Ø¥Ù„ØºØ§Ø¡</Button><Button disabled={!lines.length || busy} onClick={save}>{busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦' : 'Ø­ÙØ¸ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„'}</Button></div></div></CardContent></Card></div>
}


