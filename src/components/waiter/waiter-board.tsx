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
    draftScope: { userId: workspace.currentUserId, branchId: workspace.branchId },
    categories: workspace.categories,
    products: workspace.products.map((product) => ({ ...product, categoryName: workspace.categories.find((category) => category.id === product.categoryId)?.name ?? '—', variants: [] })),
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
      if (!res.ok) throw new Error(data?.error ?? 'تعذر تحديث الطلب')
      setSuccess(action === 'send_to_kitchen' ? 'تم إرسال الطلب إلى المطبخ.' : 'تم تسجيل تقديم الطلب وإبلاغ الكاشير.')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث الطلب')
    } finally { setPendingId(null) }
  }

  async function removeOrderItem(order: WaiterWorkspace['openOrders'][number], item: WaiterWorkspace['openOrders'][number]['items'][number]) {
    if (pendingId) return
    const reason = window.prompt(`سبب إزالة ${item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name}`, 'أضيف بالخطأ')?.trim()
    if (!reason || reason.length < 3) return setError('سبب إزالة الصنف مطلوب (3 أحرف على الأقل).')
    if (!window.confirm(`تأكيد إزالة الصنف من الطلب ${order.number}؟`)) return
    if (order.items.length === 1) return cancelMistakenOrder(order, reason)
    setPendingId(order.id); setError(null); setSuccess(null)
    try {
      const response = await fetch(`/api/staff/orders/${order.id}/items/${item.id}/void`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': globalThis.crypto.randomUUID() }, body: JSON.stringify({ reason }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error ?? 'تعذر إزالة الصنف')
      setSuccess('تمت إزالة الصنف وإعادة احتساب إجمالي الطلب.')
      startTransition(() => router.refresh())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إزالة الصنف') } finally { setPendingId(null) }
  }

  async function cancelMistakenOrder(order: WaiterWorkspace['openOrders'][number], presetReason?: string) {
    if (pendingId) return
    const reason = presetReason?.trim() || window.prompt(`سبب إلغاء الطلب ${order.number}`, 'تم إنشاء الطلب بالخطأ')?.trim()
    if (!reason || reason.length < 3) return setError('سبب إلغاء الطلب مطلوب (3 أحرف على الأقل).')
    if (!presetReason && !window.confirm(`تأكيد إلغاء الطلب ${order.number} بالكامل؟`)) return
    setPendingId(order.id); setError(null); setSuccess(null)
    try {
      const response = await fetch(`/api/staff/orders/${order.id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'cancelled', reason }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error ?? 'تعذر إلغاء الطلب')
      setSuccess('تم إلغاء الطلب وتسجيل السبب.')
      startTransition(() => router.refresh())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إلغاء الطلب') } finally { setPendingId(null) }
  }

  async function qrAction(id: string, action: 'claim_qr' | 'approve_qr' | 'reject_qr', reason?: string): Promise<boolean> {
    if (pendingId) return false
    setPendingId(id); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/staff/orders/${id}/waiter`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...(reason ? { reason } : {}) }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'تعذر تحديث طلب QR')
      setSuccess(action === 'claim_qr' ? 'تم استلام مسؤولية طلب QR.' : action === 'approve_qr' ? 'تم اعتماد الطلب وإرساله للمطبخ.' : 'تم رفض طلب QR وتسجيل السبب.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث طلب QR'); return false } finally { setPendingId(null) }
  }

  async function handoverAction(id: string, action: 'accept' | 'reject', reason?: string): Promise<boolean> {
    if (pendingId) return false
    setPendingId(id); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/staff/waiter/handovers/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action === 'reject' ? { action, reason } : { action }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'تعذر تحديث طلب التسليم')
      setSuccess(action === 'accept' ? `تم قبول التسليم ونقل ${data.transferredOrders ?? 0} طلب.` : 'تم رفض طلب التسليم وتوثيق السبب.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث طلب التسليم'); return false } finally { setPendingId(null) }
  }

  async function transferAction(orderId: string, tableId: string, reason: string): Promise<boolean> {
    if (pendingId) return false
    setPendingId(orderId); setError(null); setSuccess(null)
    try {
      const response = await fetch(`/api/staff/orders/${orderId}/waiter`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'transfer_table', tableId, reason }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error ?? 'تعذر نقل الطاولة')
      setSelectedTableId(tableId); setSuccess('تم نقل الطلب للطاولة الجديدة دون تغيير الفاتورة أو الدفع.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر نقل الطاولة'); return false } finally { setPendingId(null) }
  }

  return <div className="min-h-screen w-full bg-background" dir="rtl">
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur lg:px-6"><div><h1 className="text-xl font-bold">محطة الويتر</h1><p className="text-sm text-muted-foreground">{workspace.branchName} · {workspace.employeeName}</p>{workspace.shift ? <p className="text-xs text-muted-foreground">وردية مفتوحة · مفتوحة منذ {formatTime(new Date(workspace.shift.openedAt))}</p> : <p className="text-xs text-muted-foreground text-destructive">لا توجد وردية مفتوحة</p>}</div><div className="text-xs text-muted-foreground">{workspace.openOrders.length} طلب نشط · {ready.length} جاهز للتقديم</div><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => window.history.back()}>رجوع</Button><form action="/login?next=/waiter"><Button type="submit" variant="ghost">تسجيل الخروج</Button></form></div></header>
    <nav className="sticky top-[73px] z-20 w-full border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:px-6" aria-label="أقسام محطة الويتر"><Segmented options={[{ value: 'home', label: 'الرئيسية' }, { value: 'tables', label: 'الطاولات' }, { value: 'qr', label: 'طلبات QR' }, { value: 'orders', label: 'الطلبات' }, { value: 'ready', label: 'الجاهز للتقديم' }, { value: 'service', label: 'الخدمة' }, { value: 'shift', label: 'الوردية' }]} value={tab} onChange={(value) => setTab(value as WorkspaceTab)} ariaLabel="أقسام محطة الويتر" className="w-full justify-start overflow-x-auto" /></nav>
    <main className="w-full p-4 lg:p-6"><div className="flex w-full flex-col gap-5">
    {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
    {success ? <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{success}</p> : null}
    {tab === 'home' ? <WaiterHome tables={workspace.tables.length} activeOrders={workspace.openOrders.length} readyItems={ready.reduce((total, order) => total + order.items.reduce((sum, item) => sum + Math.max(0, Math.min(item.qty, item.preparedQty) - item.servedQty), 0), 0)} qrOrders={qrOrders.length} delayed={delayed.length} onOpen={(next) => setTab(next)} delayedOrders={delayed.slice(0, 3)} pendingId={pendingId} onAct={act} onEdit={setEditing} /> : null}
    {tab === 'tables' ? <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">حالة الطاولات محسوبة من الطلبات التشغيلية المفتوحة. مخطط الأرضية غير متاح لأن نموذج المواقع غير موجود حاليًا.</p><Button size="sm" onClick={() => setTab('create')}><Icon name="plus" size={15} />طلب جديد</Button></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{workspace.tables.map((table) => <button key={table.id} type="button" onClick={() => setSelectedTableId(table.id)} className={cn('rounded-lg border bg-card p-4 text-right transition-colors hover:bg-accent', table.openOrders > 0 ? 'border-warning/40' : 'border-success/40', selectedTableId === table.id && 'ring-2 ring-primary')}><span className="block text-xl font-bold">طاولة {table.number}</span><span className="text-xs text-muted-foreground">{table.name ?? `${table.capacity} مقاعد`}</span><span className={cn('mt-2 block text-xs font-medium', table.openOrders ? 'text-warning' : 'text-success')}>{table.openOrders ? `${table.openOrders} طلب نشط` : 'متاحة'}</span></button>)}</div>
      {selectedTable ? <Card><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>طاولة {selectedTable.number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selectedTable.name ?? 'الطلبات النشطة للطاولة'}</p></div><Button size="sm" onClick={() => setTab('create')}><Icon name="plus" size={15} />طلب جديد</Button></CardHeader><CardContent><OrderCards orders={selectedOrders} pendingId={pendingId} onAct={act} onEdit={setEditing} /></CardContent></Card> : <EmptyState icon="tables" title="اختر طاولة" description="استعرض الطلبات النشطة للطاولة أو أنشئ طلبًا جديدًا." />}</> : null}
    {tab === 'tables' && selectedTable ? <TableTransferPanel orders={selectedOrders} tables={workspace.tables} currentUserId={workspace.currentUserId} pendingId={pendingId} onTransfer={transferAction} /> : null}
    {tab === 'qr' ? <QrOrdersPanel orders={qrOrders} currentUserId={workspace.currentUserId} pendingId={pendingId} onAction={qrAction} /> : null}
    {tab === 'orders' ? <><div className="mb-3 flex flex-col gap-2"><Segmented options={[{ value: 'all', label: 'كل طلبات الفرع' }, { value: 'mine', label: 'طلباتي فقط' }]} value={orderScope} onChange={(value) => setOrderScope(value as 'mine' | 'all')} ariaLabel="نطاق الطلبات" /><Segmented options={[{ value: 'new', label: 'بانتظار الإرسال' }, { value: 'preparing', label: 'قيد التحضير' }, { value: 'ready', label: 'جاهز' }, { value: 'cancelled', label: 'ملغى' }]} value={filter} onChange={setFilter} ariaLabel="تصفية الطلبات" /></div><OrderCards orders={visible} pendingId={pendingId} onAct={act} onEdit={setEditing} currentUserId={workspace.currentUserId} onRemoveItem={removeOrderItem} onCancelOrder={cancelMistakenOrder} /></> : null}
    {tab === 'ready' ? <><ReadyItemServeList orders={ready} pendingId={pendingId} onServe={(orderId, itemId, quantity) => act(orderId, 'serve_items', undefined, [{ orderItemId: itemId, quantity }])} /><OrderCards orders={ready} pendingId={pendingId} onAct={act} onEdit={setEditing} emptyTitle="لا توجد طلبات جاهزة" emptyDescription="ستظهر الطلبات هنا فور أن يحدد المطبخ أنها جاهزة." /></> : null}
    {tab === 'ready' ? <EmergencyServingPanel orders={ready} currentUserId={workspace.currentUserId} pendingId={pendingId} onServe={(orderId, itemId, quantity, reason) => act(orderId, 'serve_items', undefined, [{ orderItemId: itemId, quantity }], reason)} /> : null}
    {tab === 'service' ? <ServiceRequestBoard /> : null}
    {tab === 'shift' ? <HandoverShiftPanel shift={workspace.shift} handovers={workspace.incomingHandovers} pendingId={pendingId} onAction={handoverAction} /> : null}
    {tab === 'create' ? <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">إنشاء طلب حقيقي بأسعار يحسبها الخادم؛ لا يمنح هذا الإجراء أي صلاحية تحصيل.</p><PosCheckout catalog={catalog} initialTableId={selectedTable?.id} /></div> : null}
    {editing ? <WaiterOrderEditor order={editing} products={catalog.products} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setSuccess('تم تعديل الطلب قبل إرساله للمطبخ.'); startTransition(() => router.refresh()) }} /> : null}
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
    if (!orderId || !destinationId || reason.trim().length < 3 || !window.confirm('تأكيد نقل الطلب إلى الطاولة الجديدة؟')) return
    if (await onTransfer(orderId, destinationId, reason.trim())) { setOrderId(''); setDestinationId(''); setReason('') }
  }
  return <Card className="mt-4"><CardHeader><CardTitle>نقل طاولة</CardTitle><p className="text-sm text-muted-foreground">النقل لا يغير الإجمالي أو سجل التحصيل، ويظل الويتر المسؤول كما هو.</p></CardHeader><CardContent className="grid gap-2 md:grid-cols-4"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">اختر الطلب</option>{eligible.map((order) => <option key={order.id} value={order.id}>{order.number}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={destinationId} onChange={(event) => setDestinationId(event.target.value)}><option value="">الطاولة المتاحة</option>{available.map((table) => <option key={table.id} value={table.id}>طاولة {table.number}</option>)}</select><Input value={reason} maxLength={255} onChange={(event) => setReason(event.target.value)} placeholder="سبب النقل (مطلوب)" /><Button disabled={!orderId || !destinationId || reason.trim().length < 3 || pendingId === orderId} onClick={() => void submit()}>{pendingId === orderId ? 'جارٍ النقل…' : 'تأكيد النقل'}</Button></CardContent></Card>
}

function EmergencyServingPanel({ orders, currentUserId, pendingId, onServe }: { orders: WaiterWorkspace['openOrders']; currentUserId: string; pendingId: string | null; onServe: (orderId: string, itemId: string, quantity: number, reason: string) => void }) {
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const emergencyLines = orders.flatMap((order) => order.responsibleWaiterId && order.responsibleWaiterId !== currentUserId ? order.items.map((item) => ({ order, item, remaining: Math.max(0, Math.min(item.qty, item.preparedQty) - item.servedQty) })).filter((line) => line.remaining > 0) : [])
  if (!emergencyLines.length) return null
  return <Card className="border-warning/50"><CardHeader><CardTitle>تقديم طارئ لعناصر جاهزة</CardTitle><p className="text-sm text-muted-foreground">لا يظهر إلا العنصر الذي حدده المطبخ جاهزًا. السبب إلزامي ويُسجّل باسم مقدم الخدمة الفعلي.</p></CardHeader><CardContent className="space-y-3">{emergencyLines.map(({ order, item, remaining }) => { const reason = reasons[item.id] ?? ''; return <div key={item.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_auto]"><div><p className="font-medium">{order.number} · {item.name}</p><p className="text-xs text-muted-foreground">المسؤول: {order.responsibleWaiterName ?? 'غير محدد'} · الجاهز للتقديم: {remaining}</p></div><Input value={reason} maxLength={255} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="سبب التدخل الطارئ (مطلوب)" /><Button variant="outline" disabled={pendingId === order.id || reason.trim().length < 3} onClick={() => { if (window.confirm('تأكيد تقديم العنصر الجاهز طارئًا؟')) onServe(order.id, item.id, remaining, reason.trim()) }}>{pendingId === order.id ? 'جارٍ الحفظ…' : 'تقديم طارئ'}</Button></div> })}</CardContent></Card>
}

function HandoverShiftPanel({ shift, handovers, pendingId, onAction }: { shift: WaiterWorkspace['shift']; handovers: WaiterWorkspace['incomingHandovers']; pendingId: string | null; onAction: (id: string, action: 'accept' | 'reject', reason?: string) => Promise<boolean> }) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  return <section className="space-y-4"><Card><CardHeader><CardTitle>وردية الويتر</CardTitle><p className="mt-1 text-sm text-muted-foreground">{shift ? `الوردية مفتوحة منذ ${formatTime(new Date(shift.openedAt))}.` : 'لا توجد وردية مفتوحة.'}</p></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Link href="/shifts" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">فتح صفحة الوردية</Link><p className="text-xs text-muted-foreground">لا تُغلق وردية الويتر ما دامت لديها طلبات تشغيلية؛ القبول ينقلها ذريًا إلى ورديتك المفتوحة.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>طلبات تسليم المسؤوليات الواردة</CardTitle><p className="mt-1 text-sm text-muted-foreground">راجع الطلبات والطاولات قبل القبول. لا يمكن قبول الطلب بدون وردية مفتوحة.</p></CardHeader><CardContent className="space-y-3">{handovers.length === 0 ? <EmptyState icon="clock" title="لا توجد طلبات تسليم" description="ستظهر هنا طلبات الويترين الآخرين التي تحتاج إلى موافقتك." /> : handovers.map((handover) => <div key={handover.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">من: {handover.senderName}</p><p className="text-xs text-muted-foreground">{formatRelative(new Date(handover.requestedAt))} · {handover.outstandingOrders.length} طلب تشغيلي</p></div><Badge tone="warning">بانتظار قبولك</Badge></div>{handover.notes ? <p className="mt-2 text-sm text-muted-foreground">ملاحظة: {handover.notes}</p> : null}<ul className="mt-2 space-y-1 text-sm">{handover.outstandingOrders.map((order) => <li key={order.id}>#{order.number} · طاولة {order.tableNumber} · {order.status}</li>)}</ul><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={pendingId === handover.id} onClick={() => void onAction(handover.id, 'accept')}>{pendingId === handover.id ? 'جارٍ القبول…' : 'قبول التسليم'}</Button><Button size="sm" variant="outline" disabled={pendingId === handover.id} onClick={() => { setRejecting(handover.id); setReason('') }}>رفض</Button></div>{rejecting === handover.id ? <div className="mt-3 space-y-2 rounded border border-warning/40 p-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} placeholder="سبب الرفض (مطلوب)" /><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={pendingId === handover.id || reason.trim().length < 3} onClick={() => void (async () => { if (await onAction(handover.id, 'reject', reason.trim())) setRejecting(null) })()}>تأكيد الرفض</Button><Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>إلغاء</Button></div></div> : null}</div>)}</CardContent></Card></section>
}

function WaiterHome({ tables, activeOrders, readyItems, qrOrders, delayed, delayedOrders, pendingId, onAct, onEdit, onOpen }: { tables: number; activeOrders: number; readyItems: number; qrOrders: number; delayed: number; delayedOrders: WaiterWorkspace['openOrders']; pendingId: string | null; onAct: WaiterAction; onEdit: (order: WaiterWorkspace['openOrders'][number]) => void; onOpen: (tab: WorkspaceTab) => void }) {
  const cards: { label: string; value: number; tab: WorkspaceTab; tone: string }[] = [
    { label: 'الطاولات', value: tables, tab: 'tables', tone: 'border-primary/40' },
    { label: 'طلبات نشطة', value: activeOrders, tab: 'orders', tone: 'border-info/40' },
    { label: 'عناصر جاهزة للتقديم', value: readyItems, tab: 'ready', tone: 'border-success/40' },
    { label: 'طلبات QR', value: qrOrders, tab: 'qr', tone: 'border-warning/40' },
  ]
  return <section className="space-y-5" aria-label="ملخص وردية الويتر">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <button key={card.label} type="button" onClick={() => onOpen(card.tab)} className={cn('rounded-xl border bg-card p-4 text-right transition hover:bg-accent', card.tone)}><span className="block text-2xl font-bold">{card.value}</span><span className="mt-1 block text-sm text-muted-foreground">{card.label}</span></button>)}</div>
    <Card className={delayed ? 'border-warning/50' : undefined}><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>تنبيهات التشغيل</CardTitle><p className="mt-1 text-sm text-muted-foreground">الطلبات التي تجاوزت 20 دقيقة تظهر هنا لتتابعها مع المطبخ.</p></div><Badge tone={delayed ? 'warning' : 'success'}>{delayed ? `${delayed} متأخر` : 'لا يوجد تأخير'}</Badge></CardHeader><CardContent>{delayedOrders.length ? <OrderCards orders={delayedOrders} pendingId={pendingId} onAct={onAct} onEdit={onEdit} /> : <EmptyState icon="clock" title="العمل يسير ضمن الوقت" description="لا توجد طلبات تشغيلية متأخرة ضمن اللقطة الحالية." />}</CardContent></Card>
    <Card><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>مهام الوردية</CardTitle><p className="mt-1 text-sm text-muted-foreground">ابدأ أو راجع ورديتك من الصفحة المخصصة؛ لا توجد عمليات نقدية في محطة الويتر.</p></div><Button variant="outline" onClick={() => onOpen('shift')}>عرض الوردية</Button></CardHeader></Card>
  </section>
}

function QrOrdersPanel({ orders, currentUserId, pendingId, onAction }: { orders: WaiterWorkspace['openOrders']; currentUserId: string; pendingId: string | null; onAction: (id: string, action: 'claim_qr' | 'approve_qr' | 'reject_qr', reason?: string) => Promise<boolean> }) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  return <section className="space-y-3"><Card><CardHeader><CardTitle>طلبات QR الواردة</CardTitle><p className="text-sm text-muted-foreground">لا يدخل طلب QR إلى المطبخ قبل أن يستلمه نادل ويعتمده. التحصيل يبقى للكاشير.</p></CardHeader></Card>{orders.length === 0 ? <EmptyState icon="orders" title="لا توجد طلبات QR نشطة" description="ستظهر الطلبات التي يرسلها العميل من رمز الطاولة هنا." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{orders.map((order) => {
    const mine = order.responsibleWaiterId === currentUserId
    const claimed = order.responsibleWaiterId !== null
    const busy = pendingId === order.id
    return <Card key={order.id}><CardHeader className="flex-row items-start justify-between gap-2"><div><CardTitle className="text-base">{order.number}</CardTitle><p className="mt-1 text-xs text-muted-foreground">طاولة {order.tableNumber} · {formatRelative(new Date(order.createdAt))}</p></div><Badge tone={order.sentToKitchen ? 'success' : claimed ? 'primary' : 'warning'}>{order.sentToKitchen ? 'أُرسل للمطبخ' : mine ? 'مسؤوليتك' : claimed ? 'مستلم' : 'بانتظار الاستلام'}</Badge></CardHeader><CardContent className="space-y-3"><ul className="border-y border-border py-2 text-sm">{order.items.map((item) => <li key={item.id} className="py-1">{item.qty}× {item.name}</li>)}</ul>{!claimed && !order.sentToKitchen ? <Button className="w-full" disabled={busy} onClick={() => void onAction(order.id, 'claim_qr')}>{busy ? 'جارٍ الاستلام…' : 'استلام الطلب'}</Button> : null}{mine && !order.sentToKitchen ? <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void onAction(order.id, 'approve_qr')}>{busy ? 'جارٍ الاعتماد…' : 'اعتماد وإرسال للمطبخ'}</Button><Button variant="outline" disabled={busy} onClick={() => { setRejecting(order.id); setReason('') }}>رفض</Button></div> : null}{rejecting === order.id ? <div className="space-y-2 rounded-md border border-warning/40 p-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} placeholder="سبب الرفض (مطلوب)" /><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void (async () => { if (await onAction(order.id, 'reject_qr', reason.trim())) setRejecting(null) })()}>تأكيد الرفض</Button><Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>إلغاء</Button></div></div> : null}</CardContent></Card>
  })}</div>}</section>
}

function ShiftPanel({ shift }: { shift: WaiterWorkspace['shift'] }) {
  return <Card><CardHeader><CardTitle>وردية الويتر</CardTitle><p className="mt-1 text-sm text-muted-foreground">{shift ? `الوردية مفتوحة منذ ${formatTime(new Date(shift.openedAt))}.` : 'لا توجد وردية مفتوحة.'}</p></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Link href="/shifts" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">فتح صفحة الوردية</Link><p className="text-xs text-muted-foreground">تسليم الوردية وتأكيد المستلم ليسا سير عمل خاصًا بالويتر في النموذج الحالي.</p></CardContent></Card>
}

function OrderCards({ orders, pendingId, onAct, onEdit, currentUserId, onRemoveItem, onCancelOrder, emptyTitle = 'لا توجد طلبات', emptyDescription = 'لا توجد طلبات مطابقة حاليًا.' }: { orders: WaiterWorkspace['openOrders']; pendingId: string | null; onAct: WaiterAction; onEdit: (order: WaiterWorkspace['openOrders'][number]) => void; currentUserId?: string; onRemoveItem?: (order: WaiterWorkspace['openOrders'][number], item: WaiterWorkspace['openOrders'][number]['items'][number]) => void; onCancelOrder?: (order: WaiterWorkspace['openOrders'][number]) => void; emptyTitle?: string; emptyDescription?: string }) {
  if (!orders.length) return <EmptyState icon="orders" title={emptyTitle} description={emptyDescription} />
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{orders.map((order) => {
    const meta = ORDER_STATUS_META[order.status as OrderStatusKey]
    const manageable = currentUserId === order.responsibleWaiterId && ['new', 'preparing', 'ready'].includes(order.status) && order.paymentStatus !== 'paid'
    return <Card key={order.id} className={cn(order.status === 'ready' && 'border-primary/50', order.status === 'cancelled' && 'border-destructive/40')}><CardHeader className="flex-row items-start justify-between gap-2"><div><CardTitle className="text-base">{order.number}</CardTitle><p className="text-xs text-muted-foreground">طاولة {order.tableNumber} · {formatRelative(new Date(order.createdAt))}</p></div><Badge tone={(meta?.tone ?? 'muted') as BadgeTone}>{meta?.label ?? order.status}</Badge></CardHeader><CardContent className="flex flex-col gap-3"><ul className="border-y border-border py-2 text-sm">{order.items.map((item) => <li key={item.id} className="flex items-start justify-between gap-2 py-1"><div><span>{item.qty}× {item.name}{item.variantLabel ? ` — ${item.variantLabel}` : ''} · {formatCurrency(item.unitPrice)}</span>{item.note ? <small className="block text-warning">ملاحظة: {item.note}</small> : null}</div>{manageable && onRemoveItem && item.servedQty === 0 ? <Button size="sm" variant="destructive" disabled={pendingId === order.id} onClick={() => onRemoveItem(order, item)}>إزالة</Button> : null}</li>)}</ul>{order.orderNotes ? <p className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">ملاحظة الطلب: {order.orderNotes}</p> : null}<div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{formatCurrency(order.total)}</span><div className="flex flex-wrap gap-2">{order.status === 'new' ? (order.sentToKitchen ? <span className="text-sm text-success">أُرسل للمطبخ</span> : <><Button size="sm" variant="outline" disabled={pendingId === order.id} onClick={() => onEdit(order)}>تعديل</Button><Button size="sm" disabled={pendingId === order.id} onClick={() => onAct(order.id, 'send_to_kitchen')}><Icon name="flame" size={14} />{pendingId === order.id ? 'جارٍ الإرسال…' : 'إرسال للمطبخ'}</Button></>) : order.status === 'ready' ? <Button size="sm" disabled={pendingId === order.id} onClick={() => onAct(order.id, 'status', 'served')}><Icon name="utensils" size={14} />{pendingId === order.id ? 'جارٍ الحفظ…' : 'تم التقديم'}</Button> : <span className="text-xs text-muted-foreground">{order.status === 'cancelled' ? (order.cancelReason ?? 'طلب ملغى') : 'بانتظار تحديث المطبخ'}</span>}{manageable && onCancelOrder && ['new', 'preparing'].includes(order.status) ? <Button size="sm" variant="destructive" disabled={pendingId === order.id} onClick={() => onCancelOrder(order)}>إلغاء الطلب</Button> : null}</div></div></CardContent></Card>
  })}</div>
}

/** Individual service controls retain the existing order-card "serve all"
 * action while exposing the authoritative per-item endpoint for partial runs. */
function ReadyItemServeList({ orders, pendingId, onServe }: { orders: WaiterWorkspace['openOrders']; pendingId: string | null; onServe: (orderId: string, itemId: string, quantity: number) => void }) {
  if (!orders.length) return <EmptyState icon="orders" title="لا توجد طلبات جاهزة" description="ستظهر الطلبات هنا فور أن يحدد المطبخ أنها جاهزة." />
  return <div className="grid gap-3 lg:grid-cols-2">{orders.map((order) => <Card key={`items-${order.id}`}><CardHeader><CardTitle className="text-base">{order.number} · طاولة {order.tableNumber}</CardTitle></CardHeader><CardContent className="space-y-2">{order.items.map((item) => {
    const remaining = Math.max(0, Math.min(item.qty, item.preparedQty) - item.servedQty)
    return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><span>{item.name} · قُدم {item.servedQty} من {item.qty}</span>{remaining > 0 ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pendingId === order.id} onClick={() => onServe(order.id, item.id, 1)}>تقديم واحد</Button><Button size="sm" disabled={pendingId === order.id} onClick={() => onServe(order.id, item.id, remaining)}>تقديم المتبقي ({remaining})</Button></div> : <Badge tone="success">تم التقديم</Badge>}</div>
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
      if (!response.ok) throw new Error(result?.error ?? 'تعذر تعديل الطلب')
      onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تعديل الطلب') } finally { setBusy(false) }
  }
  return <div role="dialog" aria-modal="true" aria-label="تعديل الطلب" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"><Card className="mx-auto my-6 w-full max-w-3xl"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>تعديل {order.number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">التعديل متاح فقط قبل الإرسال إلى المطبخ.</p></div><Button variant="ghost" size="sm" onClick={onClose}>إغلاق</Button></CardHeader><CardContent className="flex flex-col gap-4">{error ? <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}<div className="grid gap-2 sm:grid-cols-2">{products.map((product) => <Button key={product.id} type="button" variant="outline" disabled={!product.isAvailable} className="justify-between" onClick={() => add(product.id)}><span>{product.name}</span><span>{formatCurrency(Number(product.price))}</span></Button>)}</div><div className="flex flex-col gap-2 border-t pt-3">{lines.map((line) => { const product = productById.get(line.productId); return <div key={line.productId} className="flex flex-wrap items-center gap-2 rounded border p-2"><span className="min-w-32 flex-1 text-sm font-medium">{product?.name ?? 'صنف غير متاح'}</span><Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(line.productId, -1)}><Icon name="minus" size={14} /></Button><span className="w-6 text-center">{line.qty}</span><Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(line.productId, 1)}><Icon name="plus" size={14} /></Button><Input value={line.note} maxLength={255} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, note: event.target.value } : item))} placeholder="ملاحظة للصنف" className="h-8 sm:w-56" /></div> })}</div><label className="flex flex-col gap-1 text-sm"><span className="text-muted-foreground">ملاحظة على الطلب (اختيارية)</span><Input value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="أي تعليمات عامة للمطبخ" /></label><div className="flex items-center justify-between border-t pt-3"><span className="font-bold">إجمالي معاينة: {formatCurrency(previewTotal)}</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button disabled={!lines.length || busy} onClick={save}>{busy ? 'جارٍ الحفظ…' : 'حفظ التعديل'}</Button></div></div></CardContent></Card></div>
}
