'use client'

import { useMemo, useState } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { StatCard } from '@/components/ui/stat'
import { ORDER_STATUS_META, type OrderStatusKey } from '@/lib/order-status'
import { serviceRequestMonitorGroup } from '@/lib/service-request-policy'
import type { OwnerWaiterMonitor as OwnerWaiterMonitorData } from '@/lib/staff-waiter'
import { cn } from '@/lib/utils'

type OrderFilter = 'all' | 'qr_waiting' | 'qr_approved' | 'awaiting_service' | 'partial' | 'served'
type RequestFilter = 'all' | 'pending' | 'claimed' | 'completed'

const delayedAfterMs = 20 * 60 * 1000
const requestLabels: Record<string, string> = {
  waiter_call: 'Ù†Ø¯Ø§Ø¡ ÙˆÙŠØªØ±', bill: 'Ø·Ù„Ø¨ Ø§Ù„Ø­Ø³Ø§Ø¨', water: 'Ù…ÙŠØ§Ù‡', utensils: 'Ø£Ø¯ÙˆØ§Øª', assistance: 'Ù…Ø³Ø§Ø¹Ø¯Ø©', complaint: 'Ø´ÙƒÙˆÙ‰',
}

function elapsed(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  return minutes < 60 ? `${minutes} Ø¯` : `${Math.floor(minutes / 60)} Ø³ ${minutes % 60} Ø¯`
}

function orderGroup(order: OwnerWaiterMonitorData['orders'][number]): Exclude<OrderFilter, 'all'> | 'other' {
  if (order.source === 'qr' && !order.qrApprovedAt) return 'qr_waiting'
  if (order.source === 'qr' && order.qrApprovedAt) return 'qr_approved'
  if (order.status === 'served') return 'served'
  if (order.servedItemsCount > 0) return 'partial'
  if (order.status === 'ready') return 'awaiting_service'
  return 'other'
}

export function OwnerWaiterMonitor({ monitor }: { monitor: OwnerWaiterMonitorData }) {
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all')
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('all')
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const orders = useMemo(() => monitor.orders.filter((order) => {
    const matchingFilter = orderFilter === 'all' || orderGroup(order) === orderFilter
    const matchingSearch = !query || [order.number, order.tableNumber, order.branchName, order.responsibleWaiterName ?? ''].some((value) => value.toLowerCase().includes(query))
    return matchingFilter && matchingSearch
  }), [monitor.orders, orderFilter, query])
  const requests = useMemo(() => monitor.serviceRequests.filter((request) => {
    const matchingFilter = requestFilter === 'all' || serviceRequestMonitorGroup(request.status) === requestFilter
    const matchingSearch = !query || [request.tableNumber, request.branchName, request.claimedByName ?? '', requestLabels[request.type] ?? request.type].some((value) => value.toLowerCase().includes(query))
    return matchingFilter && matchingSearch
  }), [monitor.serviceRequests, query, requestFilter])

  const pendingRequests = monitor.serviceRequests.filter((request) => request.status === 'pending').length
  const delayedRequests = monitor.serviceRequests.filter((request) => ['pending', 'accepted', 'in_progress'].includes(request.status) && Date.now() - new Date(request.createdAt).getTime() >= delayedAfterMs).length
  const activeOrders = monitor.orders.filter((order) => order.status !== 'served').length
  const occupiedTables = monitor.tables.filter((table) => table.activeOrders > 0).length

  return <main dir="rtl" className="min-h-dvh bg-background p-3 sm:p-5">
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
      <header className="rounded-xl border bg-card p-4">
        <h1 className="text-xl font-bold">Ù…Ø±Ø§Ù‚Ø¨Ø© Ø§Ù„ÙˆÙŠØªØ± ÙˆØ§Ù„Ø®Ø¯Ù…Ø©</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ø¹Ø±Ø¶ Ù„Ù„Ù…Ø§Ù„Ùƒ ÙÙ‚Ø·. Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø§Ø´Ø© Ù„Ø§ ØªÙ†ÙØ° Ø§Ø¹ØªÙ…Ø§Ø¯ QR Ø£Ùˆ ØªÙ‚Ø¯ÙŠÙ… Ø·Ù„Ø¨Ø§Øª Ø£Ùˆ Ø£ÙŠ Ø¥Ø¬Ø±Ø§Ø¡ ØªØ´ØºÙŠÙ„ÙŠ.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ù…Ù„Ø®Øµ Ø§Ù„ØªØ´ØºÙŠÙ„">
        <StatCard label="Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©" value={String(activeOrders)} icon="orders" hint="Ø·Ù„Ø¨Ø§Øª ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø©" />
        <StatCard label="Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª Ø§Ù„Ù…Ø´ØºÙˆÙ„Ø©" value={`${occupiedTables}/${monitor.tables.length}`} icon="tables" hint="Ø·Ø§ÙˆÙ„Ø§Øª Ø¨Ù‡Ø§ Ø·Ù„Ø¨ Ù†Ø´Ø·" />
        <StatCard label="Ø·Ù„Ø¨Ø§Øª Ø®Ø¯Ù…Ø© Ù…Ø¹Ù„Ù‚Ø©" value={String(pendingRequests)} icon="waiter" hint="Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…" />
        <StatCard label="Ø·Ù„Ø¨Ø§Øª Ø®Ø¯Ù…Ø© Ù…ØªØ£Ø®Ø±Ø©" value={String(delayedRequests)} icon="clock" hint="20 Ø¯Ù‚ÙŠÙ‚Ø© Ø£Ùˆ Ø£ÙƒØ«Ø±" className={delayedRequests ? 'border-destructive/50' : undefined} />
      </section>

      <Input value={search} onChange={(event) => setSearch(event.target.value)} icon="search" placeholder="Ø§Ø¨Ø­Ø« Ø¨Ø±Ù‚Ù… Ø§Ù„Ø·Ù„Ø¨ Ø£Ùˆ Ø§Ù„Ø·Ø§ÙˆÙ„Ø© Ø£Ùˆ Ø§Ù„ÙØ±Ø¹ Ø£Ùˆ Ø§Ù„ÙˆÙŠØªØ±" aria-label="Ø¨Ø­Ø« ÙÙŠ Ù…Ø±Ø§Ù‚Ø¨Ø© Ø§Ù„ÙˆÙŠØªØ± ÙˆØ§Ù„Ø®Ø¯Ù…Ø©" />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø© ÙˆØ®Ø¯Ù…Ø© Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª</h2><p className="text-sm text-muted-foreground">Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„ ÙˆØ§Ù„Ø­Ø§Ù„Ø© ÙˆØªÙˆÙ‚ÙŠØª Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø·Ù„Ø¨.</p></div><Segmented ariaLabel="ØªØµÙÙŠØ© Ø§Ù„Ø·Ù„Ø¨Ø§Øª" value={orderFilter} onChange={setOrderFilter} options={[
          { value: 'all', label: `Ø§Ù„ÙƒÙ„ (${monitor.orders.length})` }, { value: 'qr_waiting', label: 'QR Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯' }, { value: 'qr_approved', label: 'QR Ù…Ø¹ØªÙ…Ø¯' }, { value: 'awaiting_service', label: 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…' }, { value: 'partial', label: 'ØªÙ‚Ø¯ÙŠÙ… Ø¬Ø²Ø¦ÙŠ' }, { value: 'served', label: 'ØªÙ… Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…' },
        ]} /></div>
        {orders.length === 0 ? <EmptyState icon="orders" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø©" description="ØºÙŠÙ‘Ø± Ø§Ù„ØªØµÙÙŠØ© Ø£Ùˆ Ø§Ù„Ø¨Ø­Ø« Ù„Ø¹Ø±Ø¶ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…ØªØ§Ø­Ø©." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{orders.map((order) => {
          const delayed = order.status !== 'served' && Date.now() - new Date(order.createdAt).getTime() >= delayedAfterMs
          const group = orderGroup(order)
          return <Card key={order.id} className={cn(delayed && 'border-warning/60')}><CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-2"><div><CardTitle className="text-base">{order.number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{order.branchName} Â· Ø·Ø§ÙˆÙ„Ø© {order.tableNumber}</p></div><Badge tone={(ORDER_STATUS_META[order.status as OrderStatusKey]?.tone ?? 'muted') as BadgeTone}>{ORDER_STATUS_META[order.status as OrderStatusKey]?.label ?? order.status}</Badge></CardHeader><CardContent className="space-y-2 text-sm"><p>Ø§Ù„ÙˆÙŠØªØ±: <b>{order.responsibleWaiterName ?? 'ØºÙŠØ± Ù…Ø¹ÙŠÙ†'}</b></p><p>Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„Ù…Ù‚Ø¯Ù…Ø©: {order.servedItemsCount}/{order.itemsCount}</p><p className={cn('text-muted-foreground', delayed && 'font-medium text-warning')}>Ù…Ù†Ø° {elapsed(order.createdAt)}{delayed ? ' Â· ÙŠØ­ØªØ§Ø¬ Ù…ØªØ§Ø¨Ø¹Ø©' : ''}</p><p className="text-xs text-muted-foreground">{group === 'qr_waiting' ? 'Ø·Ù„Ø¨ QR Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯' : group === 'qr_approved' ? 'Ø·Ù„Ø¨ QR Ù…Ø¹ØªÙ…Ø¯' : group === 'awaiting_service' ? 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„ÙˆÙŠØªØ±' : group === 'partial' ? 'ØªÙ‚Ø¯ÙŠÙ… Ø¬Ø²Ø¦ÙŠ' : group === 'served' ? 'ØªÙ… ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø·Ù„Ø¨' : 'Ù‚ÙŠØ¯ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø©'}</p></CardContent></Card>
        })}</div>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø©</h2><p className="text-sm text-muted-foreground">Ø·Ù„Ø¨Ø§Øª Ø¹Ø§Ù…Ø© ÙˆØ§Ø±Ø¯Ø© Ù…Ù† Ø§Ù„Ø·Ø§ÙˆÙ„Ø§ØªØŒ Ù„Ù„Ù…ØªØ§Ø¨Ø¹Ø© ÙÙ‚Ø·.</p></div><Segmented ariaLabel="ØªØµÙÙŠØ© Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø©" value={requestFilter} onChange={setRequestFilter} options={[
          { value: 'all', label: `Ø§Ù„ÙƒÙ„ (${monitor.serviceRequests.length})` }, { value: 'pending', label: 'Ù…Ø¹Ù„Ù‚Ø©' }, { value: 'claimed', label: 'Ù…Ø³ØªÙ„Ù…Ø©' }, { value: 'completed', label: 'Ù…ÙƒØªÙ…Ù„Ø©' },
        ]} /></div>
        {requests.length === 0 ? <EmptyState icon="waiter" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ø®Ø¯Ù…Ø© Ù…Ø·Ø§Ø¨Ù‚Ø©" description="Ø³ØªØ¸Ù‡Ø± Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ù‡Ù†Ø§ ÙÙˆØ± Ø¥Ù†Ø´Ø§Ø¦Ù‡Ø§ Ù…Ù† Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{requests.map((request) => {
          const delayed = ['pending', 'accepted', 'in_progress'].includes(request.status) && Date.now() - new Date(request.createdAt).getTime() >= delayedAfterMs
          const group = serviceRequestMonitorGroup(request.status)
          return <Card key={request.id} className={cn(delayed && 'border-destructive/60 bg-destructive/[0.03]')}><CardContent className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{requestLabels[request.type] ?? request.type}</h3><p className="text-sm text-muted-foreground">{request.branchName} Â· Ø·Ø§ÙˆÙ„Ø© {request.tableNumber}</p></div><Badge tone={group === 'completed' ? 'success' : group === 'claimed' ? 'primary' : 'warning'}>{group === 'pending' ? 'Ù…Ø¹Ù„Ù‚' : group === 'claimed' ? 'Ù…Ø³ØªÙ„Ù…' : 'Ù…ÙƒØªÙ…Ù„'}</Badge></div><p className="text-sm">Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„: <b>{request.claimedByName ?? request.resolvedByName ?? 'ØºÙŠØ± Ù…Ø¹ÙŠÙ†'}</b></p><p className={cn('text-xs text-muted-foreground', delayed && 'font-medium text-destructive')}>Ø£ÙÙ†Ø´Ø¦ Ù…Ù†Ø° {elapsed(request.createdAt)}{delayed ? ' Â· Ù…ØªØ£Ø®Ø±' : ''}</p>{request.claimedAt ? <p className="text-xs text-muted-foreground">ØªÙ… Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…: {new Date(request.claimedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p> : null}{request.resolvedAt ? <p className="text-xs text-muted-foreground">Ø§ÙƒØªÙ…Ù„: {new Date(request.resolvedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p> : null}</CardContent></Card>
        })}</div>}
      </section>

      <section className="space-y-3"><div><h2 className="text-lg font-bold">Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª</h2><p className="text-sm text-muted-foreground">Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ© Ø§Ù„Ù†Ø´Ø·Ø© ÙÙŠ ÙƒÙ„ Ø·Ø§ÙˆÙ„Ø©.</p></div>{monitor.tables.length === 0 ? <EmptyState icon="tables" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ø§ÙˆÙ„Ø§Øª Ù†Ø´Ø·Ø©" description="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ø§ÙˆÙ„Ø§Øª Ù…ÙØ¹Ù„Ø© Ø¶Ù…Ù† Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ØªØ§Ø­Ø©." /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{monitor.tables.map((table) => <Card key={table.id}><CardContent className="flex items-center justify-between p-4"><div><p className="font-bold">Ø·Ø§ÙˆÙ„Ø© {table.number}</p><p className="text-sm text-muted-foreground">{table.branchName}{table.name ? ` Â· ${table.name}` : ''}</p></div><Badge tone={table.activeOrders ? 'primary' : 'muted'}>{table.activeOrders ? `${table.activeOrders} Ø·Ù„Ø¨ Ù†Ø´Ø·` : 'Ù…ØªØ§Ø­Ø©'}</Badge></CardContent></Card>)}</div>}</section>
    </div>
  </main>
}


