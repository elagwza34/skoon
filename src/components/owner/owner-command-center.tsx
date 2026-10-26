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
    { label: 'المحصّل اليوم', value: formatCurrency(stats.totalSalesToday), icon: 'trendingUp', hint: 'مدفوعات مكتملة' },
    { label: 'قيمة طلبات اليوم', value: formatCurrency(stats.orderValueToday), icon: 'orders', hint: 'طلبات غير ملغية' },
    { label: 'عدد الطلبات', value: String(stats.ordersToday), icon: 'orders', hint: 'اليوم' },
    { label: 'متوسط الطلب', value: formatCurrency(stats.avgOrderValue), icon: 'reports', hint: stats.paidOrdersToday ? `على ${stats.paidOrdersToday} طلب` : 'لا طلبات' },
    { label: 'قيد التحضير', value: String(stats.ordersInPreparation), icon: 'kitchen', hint: 'طلبات نشطة' },
    { label: 'طاولات مشغولة', value: String(stats.tableCounts.occupied), icon: 'tables', hint: `من ${stats.tables.length}` },
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
          <Link href="/staff" className="flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">إدارة الموظفين وإضافة موظف</Link>
        </div>
      </div>
    </main>
  )
}

function ManagerOperationsCenterCompact({ data }: { data: any }) {
  const cards = [
    { label: 'طلبات نشطة', value: data.activeOrders, tone: 'primary' },
    { label: 'طلبات متأخرة', value: data.delayedOrders, tone: data.delayedOrders > 0 ? 'destructive' : 'success' },
    { label: 'بانتظار المطبخ', value: data.awaitingKitchen, tone: 'info' },
    { label: 'جاهزة للخدمة', value: data.readyForService, tone: 'success' },
    { label: 'طاولات نشطة', value: data.activeTables, tone: 'warning' },
    { label: 'موظفون في وردية', value: data.employeesOnShift, tone: 'muted' },
  ]
  return (
    <Card>
      <CardHeader className="p-3 sm:p-4">
        <CardTitle className="text-sm sm:text-base">مركز عمليات المدير</CardTitle>
        <p className="text-xs sm:text-sm text-muted-foreground">صورة حية للفرع من بيانات التشغيل الحالية.</p>
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
              <p className="text-[10px] sm:text-xs text-muted-foreground">محصل اليوم</p>
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
        <CardTitle className="text-sm sm:text-base">تنبيهات تشغيلية</CardTitle>
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
            <p className="text-xs text-muted-foreground">لا توجد تنبيهات تشغيلية متأخرة.</p>
          )}
          {serviceRequests && (
            <div className="mt-3 sm:mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ['بانتظار', serviceRequests.pending],
                ['شكاوى', serviceRequests.complaints],
                ['مصعّدة', serviceRequests.escalated],
                ['متأخرة', serviceRequests.overdue],
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
        <CardTitle className="text-sm sm:text-base">مسؤولية الطلبات</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['غير مسؤول', data.totalUnassigned],
            ['تشغيلي', data.operational],
            ['يحتاج قرار', data.ambiguous],
            ['تاريخي', data.historical],
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
            <CardTitle className="text-sm sm:text-base">المبيعات</CardTitle>
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
        <CardTitle className="text-sm sm:text-base">توزيع حالات الطلبات</CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">اليوم — من قاعدة البيانات</p>
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
    { value: 'all', label: 'الكل' },
    { value: 'new', label: 'جديد' },
    { value: 'preparing', label: 'قيد التحضير' },
    { value: 'ready', label: 'جاهز' },
    { value: 'served', label: 'تم التقديم' },
    { value: 'cancelled', label: 'ملغي' },
  ]
  return (
    <Card>
      <CardHeader className="p-3 sm:p-4 flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <CardTitle className="text-sm sm:text-base">أحدث الطلبات</CardTitle>
          <CardDescription className="text-[10px] sm:text-xs">بحث وفلترة داخل الصفحة</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن طلب…"
            className="h-8 w-48 sm:w-64 text-xs sm:text-sm"
          />
          <Segmented options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} (${statusCounts[f.value] ?? 0})` }))} value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)} ariaLabel="تصفية حالة الطلب" />
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 h-60 sm:h-72 overflow-y-auto">
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد طلبات بهذه الحالة.</p>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] sm:text-xs text-muted-foreground">
                <th className="px-1 py-1.5 text-start">رقم الطلب</th>
                <th className="px-1 py-1.5 text-start">الطاولة</th>
                <th className="px-1 py-1.5 text-start">المصدر</th>
                <th className="px-1 py-1.5 text-start">الأصناف</th>
                <th className="px-1 py-1.5 text-start">الإجمالي</th>
                <th className="px-1 py-1.5 text-start">الوقت</th>
                <th className="px-1 py-1.5 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const meta = ORDER_STATUS_META[o.status as keyof typeof ORDER_STATUS_META]
                return (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-accent/40">
                    <td className="px-1 py-1.5 font-medium text-foreground">{o.number}</td>
                    <td className="px-1 py-1.5 text-muted-foreground">{o.table}</td>
                    <td className="px-1 py-1.5 text-muted-foreground">{o.source === 'qr' ? 'QR' : o.source === 'waiter' ? 'ويتر' : 'كاشير'}</td>
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
  return <Card><CardHeader className="p-3 sm:p-4"><CardTitle className="text-sm sm:text-base">الأصناف الأعلى</CardTitle></CardHeader><CardContent className="space-y-2 p-3 sm:p-4">{products.length ? products.slice(0, 6).map((product) => <div key={product.name} className="flex items-center justify-between gap-2 border-b pb-2"><span className="min-w-0 truncate">{product.emoji} {product.name}</span><span className="shrink-0 text-xs text-muted-foreground">{product.qty} · {formatCurrency(product.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>}</CardContent></Card>
}

function TablesStatusCompact({ tables, tableCounts }: { tables: OwnerCommandCenterProps['stats']['tables']; tableCounts: OwnerCommandCenterProps['stats']['tableCounts'] }) {
  return <Card><CardHeader className="p-3 sm:p-4"><CardTitle className="text-sm sm:text-base">حالة الطاولات</CardTitle><p className="text-xs text-muted-foreground">متاحة {tableCounts.available} · مشغولة {tableCounts.occupied} · تنظيف {tableCounts.cleaning}</p></CardHeader><CardContent className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">{tables.map((table) => <div key={table.number} className="rounded border p-2 text-sm"><b>طاولة {table.number}</b><p className="text-xs text-muted-foreground">{table.status} · {table.capacity} مقاعد</p></div>)}</CardContent></Card>
}

function QuickActionsCompact({ user }: { user: OwnerCommandCenterProps['session'] }) {
  return <Card><CardHeader className="p-3 sm:p-4"><CardTitle className="text-sm sm:text-base">جلسة المالك</CardTitle></CardHeader><CardContent className="space-y-2 p-3 text-sm sm:p-4"><p>المستخدم: <b>{user.name}</b></p><p>الدور: <b>{user.role}</b></p><p className="text-xs text-muted-foreground">هذه اللوحة للرقابة والقراءة فقط.</p></CardContent></Card>
}
