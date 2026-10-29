'use client'

import { useMemo, useState, useTransition } from 'react'
import { toDataURL } from 'qrcode'
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
  waiter_call: 'نداء ويتر', bill: 'طلب الحساب', water: 'مياه', utensils: 'أدوات', assistance: 'مساعدة', complaint: 'شكوى',
}

function elapsed(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  return minutes < 60 ? `${minutes} د` : `${Math.floor(minutes / 60)} س ${minutes % 60} د`
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
        <h1 className="text-xl font-bold">مراقبة الويتر والخدمة</h1>
        <p className="mt-1 text-sm text-muted-foreground">عرض للمالك فقط. هذه الشاشة لا تنفذ اعتماد QR أو تقديم طلبات أو أي إجراء تشغيلي.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="ملخص التشغيل">
        <StatCard label="الطلبات النشطة" value={String(activeOrders)} icon="orders" hint="طلبات غير مكتملة" />
        <StatCard label="الطاولات المشغولة" value={`${occupiedTables}/${monitor.tables.length}`} icon="tables" hint="طاولات بها طلب نشط" />
        <StatCard label="طلبات خدمة معلقة" value={String(pendingRequests)} icon="waiter" hint="بانتظار الاستلام" />
        <StatCard label="طلبات خدمة متأخرة" value={String(delayedRequests)} icon="clock" hint="20 دقيقة أو أكثر" className={delayedRequests ? 'border-destructive/50' : undefined} />
      </section>

      <Input value={search} onChange={(event) => setSearch(event.target.value)} icon="search" placeholder="ابحث برقم الطلب أو الطاولة أو الفرع أو الويتر" aria-label="بحث في مراقبة الويتر والخدمة" />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">الطلبات النشطة وخدمة الطاولات</h2><p className="text-sm text-muted-foreground">المسؤول والحالة وتوقيت إنشاء الطلب.</p></div><Segmented ariaLabel="تصفية الطلبات" value={orderFilter} onChange={setOrderFilter} options={[
          { value: 'all', label: `الكل (${monitor.orders.length})` }, { value: 'qr_waiting', label: 'QR بانتظار الاعتماد' }, { value: 'qr_approved', label: 'QR معتمد' }, { value: 'awaiting_service', label: 'بانتظار التقديم' }, { value: 'partial', label: 'تقديم جزئي' }, { value: 'served', label: 'تم التقديم' },
        ]} /></div>
        {orders.length === 0 ? <EmptyState icon="orders" title="لا توجد طلبات مطابقة" description="غيّر التصفية أو البحث لعرض الطلبات المتاحة." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{orders.map((order) => {
          const delayed = order.status !== 'served' && Date.now() - new Date(order.createdAt).getTime() >= delayedAfterMs
          const group = orderGroup(order)
          return <Card key={order.id} className={cn(delayed && 'border-warning/60')}><CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-2"><div><CardTitle className="text-base">{order.number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{order.branchName} · طاولة {order.tableNumber}</p></div><Badge tone={(ORDER_STATUS_META[order.status as OrderStatusKey]?.tone ?? 'muted') as BadgeTone}>{ORDER_STATUS_META[order.status as OrderStatusKey]?.label ?? order.status}</Badge></CardHeader><CardContent className="space-y-2 text-sm"><p>الويتر: <b>{order.responsibleWaiterName ?? 'غير معين'}</b></p><p>الأصناف المقدمة: {order.servedItemsCount}/{order.itemsCount}</p><p className={cn('text-muted-foreground', delayed && 'font-medium text-warning')}>منذ {elapsed(order.createdAt)}{delayed ? ' · يحتاج متابعة' : ''}</p><p className="text-xs text-muted-foreground">{group === 'qr_waiting' ? 'طلب QR بانتظار الاعتماد' : group === 'qr_approved' ? 'طلب QR معتمد' : group === 'awaiting_service' ? 'بانتظار تقديم الويتر' : group === 'partial' ? 'تقديم جزئي' : group === 'served' ? 'تم تقديم الطلب' : 'قيد المتابعة'}</p></CardContent></Card>
        })}</div>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">طلبات الخدمة</h2><p className="text-sm text-muted-foreground">طلبات عامة واردة من الطاولات، للمتابعة فقط.</p></div><Segmented ariaLabel="تصفية طلبات الخدمة" value={requestFilter} onChange={setRequestFilter} options={[
          { value: 'all', label: `الكل (${monitor.serviceRequests.length})` }, { value: 'pending', label: 'معلقة' }, { value: 'claimed', label: 'مستلمة' }, { value: 'completed', label: 'مكتملة' },
        ]} /></div>
        {requests.length === 0 ? <EmptyState icon="waiter" title="لا توجد طلبات خدمة مطابقة" description="ستظهر الطلبات هنا فور إنشائها من الطاولات." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{requests.map((request) => {
          const delayed = ['pending', 'accepted', 'in_progress'].includes(request.status) && Date.now() - new Date(request.createdAt).getTime() >= delayedAfterMs
          const group = serviceRequestMonitorGroup(request.status)
          return <Card key={request.id} className={cn(delayed && 'border-destructive/60 bg-destructive/[0.03]')}><CardContent className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{requestLabels[request.type] ?? request.type}</h3><p className="text-sm text-muted-foreground">{request.branchName} · طاولة {request.tableNumber}</p></div><Badge tone={group === 'completed' ? 'success' : group === 'claimed' ? 'primary' : 'warning'}>{group === 'pending' ? 'معلق' : group === 'claimed' ? 'مستلم' : 'مكتمل'}</Badge></div><p className="text-sm">المسؤول: <b>{request.claimedByName ?? request.resolvedByName ?? 'غير معين'}</b></p><p className={cn('text-xs text-muted-foreground', delayed && 'font-medium text-destructive')}>أُنشئ منذ {elapsed(request.createdAt)}{delayed ? ' · متأخر' : ''}</p>{request.claimedAt ? <p className="text-xs text-muted-foreground">تم الاستلام: {new Date(request.claimedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p> : null}{request.resolvedAt ? <p className="text-xs text-muted-foreground">اكتمل: {new Date(request.resolvedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p> : null}</CardContent></Card>
        })}</div>}
      </section>

      <section className="space-y-3"><div><h2 className="text-lg font-bold">حالة الطاولات</h2><p className="text-sm text-muted-foreground">عدد الطلبات التشغيلية النشطة في كل طاولة.</p></div>{monitor.tables.length === 0 ? <EmptyState icon="tables" title="لا توجد طاولات نشطة" description="لا توجد طاولات مفعلة ضمن البيانات المتاحة." /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{monitor.tables.map((table) => <Card key={table.id}><CardContent className="flex items-center justify-between p-4"><div><p className="font-bold">طاولة {table.number}</p><p className="text-sm text-muted-foreground">{table.branchName}{table.name ? ` · ${table.name}` : ''}</p></div><Badge tone={table.activeOrders ? 'primary' : 'muted'}>{table.activeOrders ? `${table.activeOrders} طلب نشط` : 'متاحة'}</Badge></CardContent></Card>)}</div>}</section>
    </div>
  </main>
}
