'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { PosCheckout } from '@/components/pos/pos-checkout'
import { ORDER_STATUS_META, type OrderStatusKey } from '@/lib/order-status'
import { formatCurrency, formatRelative, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WaiterWorkspace } from '@/lib/staff-waiter'

type WorkspaceTab = 'tables' | 'orders' | 'ready' | 'create'

/** Real, branch-scoped waiter workstation. All mutations refresh the server snapshot. */
export function WaiterBoard({ workspace }: { workspace: WaiterWorkspace }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tab, setTab] = useState<WorkspaceTab>('tables')
  const [filter, setFilter] = useState('new')
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editing, setEditing] = useState<WaiterWorkspace['openOrders'][number] | null>(null)

  const catalog = useMemo(() => ({
    categories: workspace.categories,
    products: workspace.products.map((product) => ({ ...product, categoryName: workspace.categories.find((category) => category.id === product.categoryId)?.name ?? '—' })),
    tables: workspace.tables.map(({ id, number, name }) => ({ id, number, name })),
  }), [workspace])
  const selectedTable = workspace.tables.find((table) => table.id === selectedTableId) ?? null
  const selectedOrders = selectedTable ? workspace.openOrders.filter((order) => order.tableNumber === selectedTable.number) : []
  const visible = useMemo(() => workspace.openOrders.filter((order) => order.status === filter), [workspace.openOrders, filter])
  const ready = useMemo(() => workspace.openOrders.filter((order) => order.status === 'ready'), [workspace.openOrders])

  async function act(id: string, action: 'send_to_kitchen' | 'status', to?: 'served') {
    if (pendingId) return
    setPendingId(id); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/staff/orders/${id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action === 'send_to_kitchen' ? { action } : { to }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'تعذر تحديث الطلب')
      setSuccess(action === 'send_to_kitchen' ? 'تم إرسال الطلب إلى المطبخ.' : 'تم تسجيل تقديم الطلب وإبلاغ الكاشير.')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث الطلب')
    } finally { setPendingId(null) }
  }

  return <div className="min-h-screen w-full bg-background" dir="rtl">
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur lg:px-6"><div><h1 className="text-xl font-bold">محطة الويتر</h1><p className="text-sm text-muted-foreground">{workspace.branchName} · {workspace.employeeName}</p>{workspace.shift ? <p className="text-xs text-muted-foreground">وردية مفتوحة · مفتوحة منذ {formatTime(new Date(workspace.shift.openedAt))}</p> : <p className="text-xs text-muted-foreground text-destructive">لا توجد وردية مفتوحة</p>}</div><div className="text-xs text-muted-foreground">{workspace.openOrders.length} طلب نشط · {ready.length} جاهز للتقديم</div><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => window.history.back()}>رجوع</Button><form action="/login?next=/waiter"><Button type="submit" variant="ghost">تسجيل الخروج</Button></form></div></header>
    <nav className="sticky top-[73px] z-20 w-full border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:px-6" aria-label="أقسام محطة الويتر"><Segmented options={[{ value: 'tables', label: 'الطاولات' }, { value: 'orders', label: 'الطلبات النشطة' }, { value: 'ready', label: 'جاهز للتقديم' }, { value: 'create', label: 'طلب جديد' }]} value={tab} onChange={(value) => setTab(value as WorkspaceTab)} ariaLabel="أقسام محطة الويتر" className="w-full justify-start overflow-x-auto" /></nav>
    <main className="w-full p-4 lg:p-6"><div className="flex w-full flex-col gap-5">
    {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
    {success ? <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{success}</p> : null}
    {tab === 'tables' ? <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{workspace.tables.map((table) => <button key={table.id} type="button" onClick={() => setSelectedTableId(table.id)} className={cn('rounded-lg border bg-card p-4 text-right transition-colors hover:bg-accent', table.openOrders > 0 ? 'border-warning/40' : 'border-success/40', selectedTableId === table.id && 'ring-2 ring-primary')}><span className="block text-xl font-bold">طاولة {table.number}</span><span className="text-xs text-muted-foreground">{table.name ?? `${table.capacity} مقاعد`}</span><span className={cn('mt-2 block text-xs font-medium', table.openOrders ? 'text-warning' : 'text-success')}>{table.openOrders ? `${table.openOrders} طلب نشط` : 'متاحة'}</span></button>)}</div>
      {selectedTable ? <Card><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>طاولة {selectedTable.number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selectedTable.name ?? 'الطلبات النشطة للطاولة'}</p></div><Button size="sm" onClick={() => setTab('create')}><Icon name="plus" size={15} />طلب جديد</Button></CardHeader><CardContent><OrderCards orders={selectedOrders} pendingId={pendingId} onAct={act} onEdit={setEditing} /></CardContent></Card> : <EmptyState icon="tables" title="اختر طاولة" description="استعرض الطلبات النشطة للطاولة أو أنشئ طلبًا جديدًا." />}</> : null}
    {tab === 'orders' ? <><Segmented options={[{ value: 'new', label: 'بانتظار الإرسال' }, { value: 'preparing', label: 'قيد التحضير' }, { value: 'ready', label: 'جاهز' }, { value: 'cancelled', label: 'ملغى' }]} value={filter} onChange={setFilter} ariaLabel="تصفية الطلبات" /><OrderCards orders={visible} pendingId={pendingId} onAct={act} onEdit={setEditing} /></> : null}
    {tab === 'ready' ? <OrderCards orders={ready} pendingId={pendingId} onAct={act} onEdit={setEditing} emptyTitle="لا توجد طلبات جاهزة" emptyDescription="ستظهر الطلبات هنا فور أن يحدد المطبخ أنها جاهزة." /> : null}
    {tab === 'create' ? <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">إنشاء طلب حقيقي بأسعار يحسبها الخادم؛ لا يمنح هذا الإجراء أي صلاحية تحصيل.</p><PosCheckout catalog={catalog} initialTableId={selectedTable?.id} /></div> : null}
    {editing ? <WaiterOrderEditor order={editing} products={catalog.products} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setSuccess('تم تعديل الطلب قبل إرساله للمطبخ.'); startTransition(() => router.refresh()) }} /> : null}
    </div></main>
  </div>
}

function OrderCards({ orders, pendingId, onAct, onEdit, emptyTitle = 'لا توجد طلبات', emptyDescription = 'لا توجد طلبات مطابقة حاليًا.' }: { orders: WaiterWorkspace['openOrders']; pendingId: string | null; onAct: (id: string, action: 'send_to_kitchen' | 'status', to?: 'served') => void; onEdit: (order: WaiterWorkspace['openOrders'][number]) => void; emptyTitle?: string; emptyDescription?: string }) {
  if (!orders.length) return <EmptyState icon="orders" title={emptyTitle} description={emptyDescription} />
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{orders.map((order) => {
    const meta = ORDER_STATUS_META[order.status as OrderStatusKey]
    return <Card key={order.id} className={cn(order.status === 'ready' && 'border-primary/50', order.status === 'cancelled' && 'border-destructive/40')}><CardHeader className="flex-row items-start justify-between gap-2"><div><CardTitle className="text-base">{order.number}</CardTitle><p className="text-xs text-muted-foreground">طاولة {order.tableNumber} · {formatRelative(new Date(order.createdAt))}</p></div><Badge tone={(meta?.tone ?? 'muted') as BadgeTone}>{meta?.label ?? order.status}</Badge></CardHeader><CardContent className="flex flex-col gap-3"><ul className="border-y border-border py-2 text-sm">{order.items.map((item, index) => <li key={`${item.name}-${index}`} className="py-1"><span>{item.qty}× {item.name} · {formatCurrency(item.unitPrice)}</span>{item.note ? <small className="block text-warning">ملاحظة: {item.note}</small> : null}</li>)}</ul>{order.orderNotes ? <p className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">ملاحظة الطلب: {order.orderNotes}</p> : null}<div className="flex items-center justify-between gap-2"><span className="font-semibold">{formatCurrency(order.total)}</span>{order.status === 'new' ? (order.sentToKitchen ? <span className="text-sm text-success">أُرسل للمطبخ</span> : <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pendingId === order.id} onClick={() => onEdit(order)}>تعديل</Button><Button size="sm" disabled={pendingId === order.id} onClick={() => onAct(order.id, 'send_to_kitchen')}><Icon name="flame" size={14} />{pendingId === order.id ? 'جارٍ الإرسال…' : 'إرسال للمطبخ'}</Button></div>) : order.status === 'ready' ? <Button size="sm" disabled={pendingId === order.id} onClick={() => onAct(order.id, 'status', 'served')}><Icon name="utensils" size={14} />{pendingId === order.id ? 'جارٍ الحفظ…' : 'تم التقديم'}</Button> : <span className="text-xs text-muted-foreground">{order.status === 'cancelled' ? (order.cancelReason ?? 'طلب ملغى') : 'بانتظار تحديث المطبخ'}</span>}</div></CardContent></Card>
  })}</div>
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
