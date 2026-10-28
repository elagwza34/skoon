'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'
import { formatCurrency, formatRelative } from '@/lib/format'
import { ORDER_STATUS_META } from '@/lib/order-status'

type StatusFilter = 'all' | 'new' | 'preparing' | 'ready' | 'served' | 'cancelled'

export interface OwnerCommandCenterProps {
  stats: {
    totalSalesToday: number
    orderValueToday: number
    ordersToday: number
    avgOrderValue: number
    ordersInPreparation: number
    paidOrdersToday: number
    statusDistribution: { key: string; label: string; value: number; color: string }[]
    salesSeriesByRange: Record<string, { label: string; value: number }[]>
    recentOrders: Array<{ id: string; number: string; table: string; status: string; itemsCount: number; total: number; minutesAgo: number; source: string }>
    topProducts: Array<{ name: string; emoji: string; qty: number; revenue: number }>
    tables: Array<{ number: string; status: string; capacity: number }>
    tableCounts: { available: number; occupied: number; cleaning: number }
  }
  managerOperations: any | null
  waiterReadiness: any | null
  session: { role: string; name: string; permissions?: string[] }
}

export function OwnerCommandCenter({ stats, managerOperations, waiterReadiness, session }: OwnerCommandCenterProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const filteredOrders = stats.recentOrders.filter((o) => {
    const matchFilter = statusFilter === 'all' || o.status === statusFilter
    const matchSearch = !search || [o.number, o.table, o.source].some((v) => v.toLowerCase().includes(search.toLowerCase()))
    return matchFilter && matchSearch
  })

  const statusCounts = stats.statusDistribution.reduce<Record<string, number>>((acc, item) => { acc[item.key] = item.value; return acc }, {})

  const kpis = [
    { label: 'Ø§Ù„Ù…Ø­ØµÙ‘Ù„ Ø§Ù„ÙŠÙˆÙ…', value: formatCurrency(stats.totalSalesToday), icon: 'trendingUp', hint: 'Ù…Ø¯ÙÙˆØ¹Ø§Øª Ù…ÙƒØªÙ…Ù„Ø©' },
    { label: 'Ù‚ÙŠÙ…Ø© Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙŠÙˆÙ…', value: formatCurrency(stats.orderValueToday), icon: 'orders', hint: 'Ø·Ù„Ø¨Ø§Øª ØºÙŠØ± Ù…Ù„ØºÙŠØ©' },
    { label: 'Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª', value: String(stats.ordersToday), icon: 'orders', hint: 'Ø§Ù„ÙŠÙˆÙ…' },
    { label: 'Ù…ØªÙˆØ³Ø· Ø§Ù„Ø·Ù„Ø¨', value: formatCurrency(stats.avgOrderValue), icon: 'reports', hint: stats.paidOrdersToday ? `Ø¹Ù„Ù‰ ${stats.paidOrdersToday} Ø·Ù„Ø¨` : 'Ù„Ø§ Ø·Ù„Ø¨Ø§Øª' },
    { label: 'Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ø¶ÙŠØ±', value: String(stats.ordersInPreparation), icon: 'kitchen', hint: 'Ø·Ù„Ø¨Ø§Øª Ù†Ø´Ø·Ø©' },
    { label: 'Ø·Ø§ÙˆÙ„Ø§Øª Ù…Ø´ØºÙˆÙ„Ø©', value: String(stats.tableCounts.occupied), icon: 'tables', hint: `Ù…Ù† ${stats.tables.length}` },
  ]

  return (
    <main dir="rtl" className="min-h-dvh bg-background p-2 sm:p-3">
      <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
                <span className="text-sm font-bold text-foreground">{kpi.value}</span>
                <span className="text-[10px] text-muted-foreground">{kpi.hint}</span>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon name={kpi.icon as any} size={16} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-2 mt-2 sm:grid-cols-12">
        <div className="col-span-12 lg:col-span-8">
          {managerOperations ? <ManagerOperationsCenterCompact data={managerOperations} /> : null}
        </div>
        <div className="col-span-12 lg:col-span-4 space-y-2">
          {managerOperations ? <AlertsPanel urgent={managerOperations.urgent} serviceRequests={managerOperations.serviceRequests} /> : null}
          {waiterReadiness ? <ResponsibilityPanel data={waiterReadiness} /> : null}
        </div>
        <div className="col-span-12 lg:col-span-7">
          <SalesCardCompact seriesByRange={stats.salesSeriesByRange} />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <OrderStatusDistribution data={stats.statusDistribution} total={stats.ordersToday} />
        </div>
        <div className="col-span-12 lg:col-span-8">
          <RecentOrdersCompact orders={filteredOrders} statusFilter={statusFilter} setStatusFilter={setStatusFilter} search={search} setSearch={setSearch} statusCounts={statusCounts} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <TopProductsCompact products={stats.topProducts} />
        </div>
        <div className="col-span-12 lg:col-span-8">
          <TablesStatusCompact tables={stats.tables} tableCounts={stats.tableCounts} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <QuickActionsCompact user={session} />
          <Link href="/staff" className="flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† ÙˆØ¥Ø¶Ø§ÙØ© Ù…ÙˆØ¸Ù</Link>
        </div>
      </div>
    </main>
  )
}

function ManagerOperationsCenterCompact({ data }: { data: any }) {
  const cards = [
    { label: 'Ø·Ù„Ø¨Ø§Øª Ù†Ø´Ø·Ø©', value: data.activeOrders, tone: 'primary' },
    { label: 'Ø·Ù„Ø¨Ø§Øª Ù…ØªØ£Ø®Ø±Ø©', value: data.delayedOrders, tone: data.delayedOrders > 0 ? 'destructive' : 'success' },
    { label: 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…Ø·Ø¨Ø®', value: data.awaitingKitchen, tone: 'info' },
    { label: 'Ø¬Ø§Ù‡Ø²Ø© Ù„Ù„Ø®Ø¯Ù…Ø©', value: data.readyForService, tone: 'success' },
    { label: 'Ø·Ø§ÙˆÙ„Ø§Øª Ù†Ø´Ø·Ø©', value: data.activeTables, tone: 'warning' },
    { label: 'Ù…ÙˆØ¸ÙÙˆÙ† ÙÙŠ ÙˆØ±Ø¯ÙŠØ©', value: data.employeesOnShift, tone: 'muted' },
  ]
  return (
    <Card>
      <CardHeader className="p-3 sm:p-4">
        <CardTitle className="text-sm sm:text-base">Ù…Ø±ÙƒØ² Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ù…Ø¯ÙŠØ±</CardTitle>
        <p className="text-xs sm:text-sm text-muted-foreground">ØµÙˆØ±Ø© Ø­ÙŠØ© Ù„Ù„ÙØ±Ø¹ Ù…Ù† Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„Ø­Ø§Ù„ÙŠØ©.</p>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.label} className="p-2 sm:p-3 border-t-2 border-t-border/50">
              <CardContent className="p-0 sm:p-1 pt-2 sm:pt-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{c.label}</p>
                <p className="text-sm sm:text-lg font-bold">{data[c.label]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-3 sm:mt-4 grid gap-2 sm:grid-cols-2">
          <Card className="p-2 sm:p-3">
            <CardContent className="p-0 sm:p-1 pt-2 sm:pt-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Ù…Ø­ØµÙ„ Ø§Ù„ÙŠÙˆÙ…</p>
              <p className="text-sm sm:text-lg font-bold">{formatCurrency(data.collectedToday)}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  )
}

function AlertsPanel({ urgent, serviceRequests }: { urgent: any[]; serviceRequests: any | null }) {
  return (
    <Card>
      <CardHeader className="p-3 sm:p-4">
        <CardTitle className="text-sm sm:text-base">ØªÙ†Ø¨ÙŠÙ‡Ø§Øª ØªØ´ØºÙŠÙ„ÙŠØ©</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <div className="space-y-2">
          {urgent.length ? (
            <ul className="space-y-1">
              {urgent.slice(0, 5).map((alert, i) => (
                <li key={`${alert.type}-${i}`} className="rounded border border-destructive/30 p-2">
                  <p className="text-xs font-medium text-destructive">{alert.title}</p>
                  <p className="text-[10px] text-muted-foreground">{alert.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ ØªÙ†Ø¨ÙŠÙ‡Ø§Øª ØªØ´ØºÙŠÙ„ÙŠØ© Ù…ØªØ£Ø®Ø±Ø©.</p>
          )}
          {serviceRequests && (
            <div className="mt-3 sm:mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ['Ø¨Ø§Ù†ØªØ¸Ø§Ø±', serviceRequests.pending],
                ['Ø´ÙƒØ§ÙˆÙ‰', serviceRequests.complaints],
                ['Ù…ØµØ¹Ù‘Ø¯Ø©', serviceRequests.escalated],
                ['Ù…ØªØ£Ø®Ø±Ø©', serviceRequests.overdue],
              ].map(([label, value]) => (
                <Card key={label} className="p-2 sm:p-3">
                  <CardContent className="p-0 sm:p-1 pt-2 sm:pt-0">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
                    <p className="text-xs sm:text-sm font-bold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ResponsibilityPanel({ data }: { data: any }) {
  return (
    <Card>
      <CardHeader className="p-3 sm:p-4">
        <CardTitle className="text-sm sm:text-base">Ù…Ø³Ø¤ÙˆÙ„ÙŠØ© Ø§Ù„Ø·Ù„Ø¨Ø§Øª</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['ØºÙŠØ± Ù…Ø³Ø¤ÙˆÙ„', data.totalUnassigned],
            ['ØªØ´ØºÙŠÙ„ÙŠ', data.operational],
            ['ÙŠØ­ØªØ§Ø¬ Ù‚Ø±Ø§Ø±', data.ambiguous],
            ['ØªØ§Ø±ÙŠØ®ÙŠ', data.historical],
          ].map(([label, value]) => (
            <Card key={label} className="p-2 sm:p-3">
              <CardContent className="p-0 sm:p-1 pt-2 sm:pt-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
                <p className="text-xs sm:text-sm font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SalesCardCompact({ seriesByRange }: { seriesByRange: Record<string, { label: string; value: number }[]> }) {
  const range = 'day'
  const series = seriesByRange[range] ?? []
  const total = series.reduce((s, d) => s + d.value, 0)
  return (
    <Card>
      <CardHeader className="p-3 sm:p-4 flex-col items-start gap-3">
        <div className="flex items-start justify-between gap-3 w-full">
          <div>
            <CardTitle className="text-sm sm:text-base">Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª</CardTitle>
            <CardDescription className="text-[10px] sm:text-xs">{formatCurrency(total)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 h-48 sm:h-56">
        <div className="h-full w-full flex items-end gap-1">
          {series.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1 h-full">
              <div className={`w-full bg-primary rounded-t-sm ${(d.value / Math.max(1, ...series.map((s) => s.value))) * 100}%`} />
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function OrderStatusDistribution({ data, total }: { data: { key: string; label: string; value: number; color: string }[]; total: number }) {
  return (
    <Card>
      <CardHeader className="p-3 sm:p-4">
        <CardTitle className="text-sm sm:text-base">ØªÙˆØ²ÙŠØ¹ Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø·Ù„Ø¨Ø§Øª</CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">Ø§Ù„ÙŠÙˆÙ… â€” Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª</p>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-2">
          {data.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
              <div className="flex min-w-0 flex-1 gap-2">
                <div className="h-2 flex-1 rounded-full bg-muted" />
                <div className="h-2 rounded-full" style={{ backgroundColor: item.color, width: `${(item.value / Math.max(1, total)) * 100}%` }} />
              </div>
              <span className="text-xs font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RecentOrdersCompact({
  orders,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  statusCounts,
}: {
  orders: Array<{ id: string; number: string; table: string; status: string; itemsCount: number; total: number; minutesAgo: number; source: string }>
  statusFilter: string
  setStatusFilter: (v: StatusFilter) => void
  search: string
  setSearch: (v: string) => void
  statusCounts: Record<string, number>
}) {
  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Ø§Ù„ÙƒÙ„' },
    { value: 'new', label: 'Ø¬Ø¯ÙŠØ¯' },
    { value: 'preparing', label: 'Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ø¶ÙŠØ±' },
    { value: 'ready', label: 'Ø¬Ø§Ù‡Ø²' },
    { value: 'served', label: 'ØªÙ… Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…' },
    { value: 'cancelled', label: 'Ù…Ù„ØºÙŠ' },
  ]
  return (
    <Card>
      <CardHeader className="p-3 sm:p-4 flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <CardTitle className="text-sm sm:text-base">Ø£Ø­Ø¯Ø« Ø§Ù„Ø·Ù„Ø¨Ø§Øª</CardTitle>
          <CardDescription className="text-[10px] sm:text-xs">Ø¨Ø­Ø« ÙˆÙÙ„ØªØ±Ø© Ø¯Ø§Ø®Ù„ Ø§Ù„ØµÙØ­Ø©</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ø·Ù„Ø¨â€¦"
            className="h-8 w-48 sm:w-64 text-xs sm:text-sm"
          />
          <Segmented options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} (${statusCounts[f.value] ?? 0})` }))} value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)} ariaLabel="ØªØµÙÙŠØ© Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ù„Ø¨" />
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 h-60 sm:h-72 overflow-y-auto">
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ø¨Ù‡Ø°Ù‡ Ø§Ù„Ø­Ø§Ù„Ø©.</p>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] sm:text-xs text-muted-foreground">
                <th className="px-1 py-1.5 text-start">Ø±Ù‚Ù… Ø§Ù„Ø·Ù„Ø¨</th>
                <th className="px-1 py-1.5 text-start">Ø§Ù„Ø·Ø§ÙˆÙ„Ø©</th>
                <th className="px-1 py-1.5 text-start">Ø§Ù„Ù…ØµØ¯Ø±</th>
                <th className="px-1 py-1.5 text-start">Ø§Ù„Ø£ØµÙ†Ø§Ù</th>
                <th className="px-1 py-1.5 text-start">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</th>
                <th className="px-1 py-1.5 text-start">Ø§Ù„ÙˆÙ‚Øª</th>
                <th className="px-1 py-1.5 text-start">Ø§Ù„Ø­Ø§Ù„Ø©</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const meta = ORDER_STATUS_META[o.status as keyof typeof ORDER_STATUS_META]
                return (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-accent/40">
                    <td className="px-1 py-1.5 font-medium text-foreground">{o.number}</td>
                    <td className="px-1 py-1.5 text-muted-foreground">{o.table}</td>
                    <td className="px-1 py-1.5 text-muted-foreground">{o.source === 'qr' ? 'QR' : o.source === 'waiter' ? 'ÙˆÙŠØªØ±' : 'ÙƒØ§Ø´ÙŠØ±'}</td>
                    <td className="px-1 py-1.5 text-muted-foreground">{o.itemsCount}</td>
                    <td className="px-1 py-1.5 font-medium text-foreground">{formatCurrency(o.total)}</td>
                    <td className="px-1 py-1.5 text-muted-foreground">{formatRelative(new Date(Date.now() - o.minutesAgo * 60000))}</td>
                    <td className="px-1 py-1.5"><Badge tone={(meta?.tone ?? 'muted') as BadgeTone}>{meta?.label ?? o.status}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function TopProductsCompact({ products }: { products: OwnerCommandCenterProps['stats']['topProducts'] }) {
  return <Card><CardHeader className="p-3 sm:p-4"><CardTitle className="text-sm sm:text-base">Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„Ø£Ø¹Ù„Ù‰</CardTitle></CardHeader><CardContent className="space-y-2 p-3 sm:p-4">{products.length ? products.slice(0, 6).map((product) => <div key={product.name} className="flex items-center justify-between gap-2 border-b pb-2"><span className="min-w-0 truncate">{product.emoji} {product.name}</span><span className="shrink-0 text-xs text-muted-foreground">{product.qty} Â· {formatCurrency(product.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª.</p>}</CardContent></Card>
}

function TablesStatusCompact({ tables, tableCounts }: { tables: OwnerCommandCenterProps['stats']['tables']; tableCounts: OwnerCommandCenterProps['stats']['tableCounts'] }) {
  return <Card><CardHeader className="p-3 sm:p-4"><CardTitle className="text-sm sm:text-base">Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª</CardTitle><p className="text-xs text-muted-foreground">Ù…ØªØ§Ø­Ø© {tableCounts.available} Â· Ù…Ø´ØºÙˆÙ„Ø© {tableCounts.occupied} Â· ØªÙ†Ø¸ÙŠÙ {tableCounts.cleaning}</p></CardHeader><CardContent className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">{tables.map((table) => <div key={table.number} className="rounded border p-2 text-sm"><b>Ø·Ø§ÙˆÙ„Ø© {table.number}</b><p className="text-xs text-muted-foreground">{table.status} Â· {table.capacity} Ù…Ù‚Ø§Ø¹Ø¯</p></div>)}</CardContent></Card>
}

function QuickActionsCompact({ user }: { user: OwnerCommandCenterProps['session'] }) {
  return <Card><CardHeader className="p-3 sm:p-4"><CardTitle className="text-sm sm:text-base">Ø¬Ù„Ø³Ø© Ø§Ù„Ù…Ø§Ù„Ùƒ</CardTitle></CardHeader><CardContent className="space-y-2 p-3 text-sm sm:p-4"><p>Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…: <b>{user.name}</b></p><p>Ø§Ù„Ø¯ÙˆØ±: <b>{user.role}</b></p><p className="text-xs text-muted-foreground">Ù‡Ø°Ù‡ Ø§Ù„Ù„ÙˆØ­Ø© Ù„Ù„Ø±Ù‚Ø§Ø¨Ø© ÙˆØ§Ù„Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø·.</p></CardContent></Card>
}


