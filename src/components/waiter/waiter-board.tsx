'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { Icon } from '@/components/ui/icon'
import { PosCheckout } from '@/components/pos/pos-checkout'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WaiterWorkspace } from '@/lib/staff-waiter'
import type { PosCatalog } from '@/lib/staff-pos'

type WorkspaceTab = 'pos' | 'tables' | 'orders' | 'qr' | 'shift'

const TAB_LABELS: Record<WorkspaceTab, string> = {
  pos: 'POS',
  tables: 'الطاولات',
  orders: 'الطلبات',
  qr: 'طلبات QR',
  shift: 'الوردية',
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: 'جديد',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    served: 'تم التقديم',
    cancelled: 'تم الإلغاء',
  }
  return labels[status] ?? status
}

function statusTone(status: string): 'muted' | 'info' | 'warning' | 'success' | 'destructive' {
  switch (status) {
    case 'ready': return 'success'
    case 'preparing': return 'warning'
    case 'served': return 'muted'
    case 'cancelled': return 'destructive'
    default: return 'info'
  }
}

function formatWaiterDateTime(value: string): string {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value))
}

// ============================================================
// Order Card Component — individual order in the orders tab
// ============================================================
function OrderCard({
  order,
  isMine,
  onSendToKitchen,
  onMarkReady,
  onMarkServed,
  onEdit,
  onCancel,
}: {
  order: WaiterWorkspace['openOrders'][number]
  isMine: boolean
  onSendToKitchen: () => void
  onMarkReady: () => void
  onMarkServed: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const waitMinutes = Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000))
  return (
    <Card className={cn('border rounded-lg p-3', isMine ? 'border-primary/40 bg-primary/5' : 'border-border')} data-order-id={order.id}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            {order.number}
            <span className={cn('text-xs', waitMinutes >= 15 ? 'text-destructive' : 'text-muted-foreground')}>منذ {waitMinutes} د</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            الطاولة {order.tableNumber} · {order.source === 'qr' ? 'QR' : 'الحضور المباشر'}
          </p>
          <p className="text-xs text-muted-foreground">{formatWaiterDateTime(order.createdAt)} · {formatCurrency(order.total)}</p>
        </div>
        <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
      </CardHeader>
      <div className="space-y-2 pt-2">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{item.name}{item.variantId ? ` — ${item.variantLabel ?? ''}` : ''}</span>
            <span className="text-muted-foreground">{item.qty} × {formatCurrency(item.unitPrice)}</span>
            <span className="font-semibold">{formatCurrency(Number(item.unitPrice) * item.qty)}</span>
          </div>
        ))}
      </div>
      <CardFooter className="flex flex-wrap gap-2">
        {order.status === 'new' && (
          <Button size="sm" variant="outline" onClick={onSendToKitchen} disabled={!isMine}>
            <Icon name="orders" size={14} /> إرسال للمطبخ
          </Button>
        )}
        {order.status === 'preparing' && (
          <Button size="sm" variant="outline" onClick={onMarkReady}>
            <Icon name="check" size={14} /> تهيئة كجاهز
          </Button>
        )}
        {order.status === 'ready' && (
          <Button size="sm" onClick={onMarkServed}>
            <Icon name="check" size={14} /> تم التقديم
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Icon name="menu" size={14} /> تعديل
        </Button>
        <Button size="sm" variant="destructive" onClick={onCancel} disabled={!isMine}>
          <Icon name="trash" size={14} /> إلغاء
        </Button>
      </CardFooter>
    </Card>
  )
}

// ============================================================
// WaiterBoard — main waiter dashboard component
// ============================================================
export function WaiterBoard({ workspace }: { workspace: WaiterWorkspace }) {
  const [, startTransition] = useTransition()
  const [tab, setTab] = useState<WorkspaceTab>('pos')
  const [filter, setFilter] = useState('all')
  const [orderScope, setOrderScope] = useState<'mine' | 'all'>('all')
  const [orderSearch, setOrderSearch] = useState('')
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editing, setEditing] = useState<WaiterWorkspace['openOrders'][number] | null>(null)
  const [showingTableOrderModal, setShowingTableOrderModal] = useState<{ orderId: string; tableNumber: string } | null>(null)
  const [showingProductPicker, setShowingProductPicker] = useState<{ orderId: string; tableNumber: string } | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [transferDialog, setTransferDialog] = useState<{ tableId: string; tableNumber: string } | null>(null)
  const [transferRecipient, setTransferRecipient] = useState('')
  const [transferNotes, setTransferNotes] = useState('')

  const catalog = {
    products: workspace.products.sort((a, b) => a.name.localeCompare(b.name, 'ar')).map((p) => ({
      ...p,
      categoryName: p.categoryId ? workspace.categories.find((c) => c.id === p.categoryId)?.name ?? ' غير مصنف' : 'غير مصنف',
    })),
    categories: workspace.categories,
    tables: workspace.tables.map(({ id, number, name, openOrders }) => ({
      id,
      number,
      name,
      status: openOrders > 0 ? 'occupied' : 'available',
      openOrders,
    })),
    draftScope: { userId: workspace.currentUserId, branchId: workspace.branchId },
  }

  const scopedOrders = useMemo(() => {
    let result = workspace.openOrders
    if (orderScope === 'mine') {
      result = result.filter((o) => o.responsibleWaiterId === workspace.currentUserId)
    }
    if (filter !== 'all') {
      result = result.filter((o) => o.status === filter)
    }
    if (orderSearch) {
      const q = orderSearch.toLowerCase()
      result = result.filter((o) =>
        o.number.toLowerCase().includes(q) ||
        o.tableNumber.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q)
      )
    }
    return result
  }, [workspace.openOrders, orderScope, filter, orderSearch, workspace.currentUserId])

  const visibleTables = useMemo(() => {
    return [...workspace.tables].sort((a, b) => {
      const na = parseInt(a.number) || 0
      const nb = parseInt(b.number) || 0
      if (na !== nb) return na - nb
      return String(a.number).localeCompare(String(b.number), 'ar')
    })
  }, [workspace.tables])
  const myActiveTableNumbers = useMemo(() => new Set(
    scopedOrders
      .filter((o) => o.responsibleWaiterId === workspace.currentUserId && o.status !== 'served')
      .map((o) => o.tableNumber)
  ), [scopedOrders, workspace.currentUserId])

  const statusFilterOptions = [
    { value: 'all', label: 'الكل' },
    { value: 'new', label: 'جديد' },
    { value: 'preparing', label: 'قيد التحضير' },
    { value: 'ready', label: 'جاهز' },
    { value: 'served', label: 'تم التقديم' },
  ]

  const handleSendToKitchen = async (orderId: string) => {
    setError(null)
    try {
      await fetch(`/api/staff/orders/${orderId}/send`, { method: 'POST' })
      startTransition(() => router.refresh())
      setSuccess('تم إرسال الطلب للمطبخ')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('فشل إرسال الطلب للمطبخ')
      console.error(err)
    }
  }

  const handleMarkStatus = async (orderId: string, to: 'ready' | 'served') => {
    setError(null)
    try {
      await fetch(`/api/staff/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      })
      startTransition(() => router.refresh())
      setSuccess(to === 'ready' ? 'تم تهيئة الطلب كجاهز' : 'تم تحديد الطلب كمقدم')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(`فشل تحديث حالة الطلب إلى ${to === 'ready' ? 'جاهز' : 'مقدم'}`)
      console.error(err)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) return
    setError(null)
    try {
      await fetch(`/api/staff/orders/${orderId}/cancel`, { method: 'POST' })
      startTransition(() => router.refresh())
      setSuccess('تم إلغاء الطلب')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('فشل إلغاء الطلب')
      console.error(err)
    }
  }

  const handleEditOrder = (order: WaiterWorkspace['openOrders'][number]) => {
    setEditing(order)
    setTab('pos')
  }

  const router = useRouter()

  // Auto-refresh table/order status every second so both cashier and
  // waiter screens stay in sync without manual reload.
  useEffect(() => {
    const timer = setInterval(() => startTransition(() => router.refresh()), 5_000)
    return () => clearInterval(timer)
  }, [router, startTransition])

  return (
    <div dir="rtl" className="min-h-dvh bg-background">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur">
        {/* Header */}
        <header className="border-b border-border bg-background/95 px-4 py-3 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">مساحة النادل</h1>
              <p className="text-sm text-muted-foreground">
                {workspace.branchName} · {workspace.employeeName}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap gap-2">
              {tab === 'pos' && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                  onClick={() => setCartOpen(true)}
                >
                  <Icon name="cart" size={17} /> سلة الطلب
                </Button>
              )}
              {error ? <p role="alert" className="min-w-0 break-words rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
              {success ? <p className="min-w-0 break-words rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{success}</p> : null}
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        <nav className="border-b border-border bg-background/95 px-4 py-2 sm:px-6 lg:px-6" aria-label="القوائم">
          <Segmented
            options={[
              { value: 'pos', label: TAB_LABELS.pos },
              { value: 'tables', label: TAB_LABELS.tables },
              { value: 'orders', label: TAB_LABELS.orders },
              { value: 'qr', label: TAB_LABELS.qr },
              { value: 'shift', label: TAB_LABELS.shift },
            ]}
            value={tab}
            onChange={(value) => setTab(value as WorkspaceTab)}
            ariaLabel="الأقسام"
            className="w-full flex-nowrap justify-start overflow-x-auto"
          />
        </nav>
      </div>

      <main className="min-w-0 w-full p-3 sm:p-4 lg:p-6">
        <div className="flex min-w-0 w-full flex-col gap-5">

          {/* TAB: POS */}
          {tab === 'pos' && (
            <PosCheckout
              catalog={catalog as any}
              initialTableId={selectedTableId ?? undefined}
              mode="waiter"
              catalogVisible={true}
              cartOpen={cartOpen}
              onCartOpenChange={setCartOpen}
              onOrderCreated={() => setTab('orders')}
            />
          )}

          {/* TAB: Tables */}
          {tab === 'tables' && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  اختر الطاولة لإدارة طلباتها.
                </p>
                {!workspace.shift ? (
                  <Button size="sm" variant="outline" onClick={() => setTab('shift')}>
                    <Icon name="plus" size={15} /> فتح الوردية
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setTransferDialog({ tableId: '', tableNumber: '' })}>
                    <Icon name="logout" size={15} /> نقل المسئولية للطاولة
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {visibleTables.map((table) => {
                    const isMyActive = myActiveTableNumbers.has(table.number)
                  const tableOrders = workspace.openOrders.filter((o) => o.tableNumber === table.number)
                  const isOccupied = tableOrders.some(
                    (o) =>
                      (o.status === 'new' || o.status === 'preparing' || o.status === 'ready') &&
                      o.paymentStatus !== 'paid',
                  )
                    return (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => router.push(`/waiter/tables/${table.id}`)}
                        className={cn(
                          'rounded-lg border bg-card p-4 text-right transition-colors hover:bg-accent',
                          isMyActive ? 'border-primary/40 ring-2 ring-primary' : isOccupied ? 'border-warning/40' : 'border-success/40'
                        )}
                      >
                      <span className="block text-xl font-bold">الطاولة {table.number}</span>
                      <span className="text-xs text-muted-foreground mt-1">
                        {isOccupied ? `${tableOrders.length} طلب` : 'متاحة'}{table.capacity ? ` · سعة ${table.capacity}` : ''}
                      </span>
                      {isMyActive && <span className="mt-2 text-xs text-primary">طلبياتي</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* TAB: Orders */}
          {tab === 'orders' && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">نطاق العرض:</p>
                  <Segmented
                    value={orderScope}
                    onChange={setOrderScope as any}
                    options={[
                      { value: 'all', label: 'الكل' },
                      { value: 'mine', label: 'طلبياتي' },
                    ]}
                    className="h-9"
                  />
                </div>
                <div className="relative flex-1 max-w-md">
                  <Icon name="search" size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="بحث برقم الطلب أو الطاولة أو العميل…"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="pl-8 pr-4 h-9 text-sm"
                  />
                </div>
                <Segmented
                  value={filter}
                  onChange={setFilter as any}
                  options={statusFilterOptions}
                  className="h-9"
                />
              </div>

              <div className="space-y-3">
                {scopedOrders.length === 0 ? (
                  <div className="rounded-lg border border-border bg-card p-6 text-center">
                    <p className="text-sm text-muted-foreground">لا توجد طلبات مطابقة.</p>
                  </div>
                ) : (
                  scopedOrders.map((order) => {
                    const isMine = order.responsibleWaiterId === workspace.currentUserId
                    return (
                      <OrderCard
                        key={order.id}
                        order={order}
                        isMine={isMine}
                        onSendToKitchen={() => handleSendToKitchen(order.id)}
                        onMarkReady={() => handleMarkStatus(order.id, 'ready')}
                        onMarkServed={() => handleMarkStatus(order.id, 'served')}
                        onEdit={() => handleEditOrder(order)}
                        onCancel={() => handleCancelOrder(order.id)}
                      />
                    )
                  })
                )}
              </div>
            </>
          )}

          {/* TAB: QR Orders */}
          {tab === 'qr' && (
            <>
              <div className="mb-3">
                <p className="text-sm text-muted-foreground">طلبات QR بانتظار الاعتماد أو المعالجة.</p>
              </div>
              <div className="space-y-3">
                {scopedOrders.filter((o) => o.source === 'qr').length === 0 ? (
                  <div className="rounded-lg border border-border bg-card p-6 text-center">
                    <p className="text-sm text-muted-foreground">لا توجد طلبات QR حاليًا.</p>
                  </div>
                ) : (
                  scopedOrders.filter((o) => o.source === 'qr').map((order) => {
                    const isMine = order.responsibleWaiterId === workspace.currentUserId
                    return (
                      <OrderCard
                        key={order.id}
                        order={order}
                        isMine={isMine}
                        onSendToKitchen={() => handleSendToKitchen(order.id)}
                        onMarkReady={() => handleMarkStatus(order.id, 'ready')}
                        onMarkServed={() => handleMarkStatus(order.id, 'served')}
                        onEdit={() => handleEditOrder(order)}
                        onCancel={() => handleCancelOrder(order.id)}
                      />
                    )
                  })
                )}
              </div>
            </>
          )}

          {/* TAB: Shift */}
          {tab === 'shift' && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-bold mb-4">الوردية</h2>
              {!workspace.shift ? (
                <Button size="lg" className="w-full" onClick={() => setTab('pos')}>
                  <Icon name="clock" size={18} /> فتح الوردية وبدء العمل
                </Button>
              ) : (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground">حالة الوردية:</p>
                    <Badge tone="success" className="text-sm px-3 py-2">مفتوحة — {workspace.employeeName}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button variant="outline" onClick={() => startTransition(() => router.refresh())}>
                      <Icon name="menu" size={16} /> تحديث البيانات
                    </Button>
                    <Button variant="destructive" onClick={() => {
                      if (window.confirm('هل أنت متأكد من إغلاق الوردية؟')) {
                        router.push('/shifts')
                      }
                    }}>
                      <Icon name="logout" size={16} /> إغلاق الوردية
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Edit Order Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">تعديل الطلب #{editing.number}</h2>
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                <Icon name="close" size={16} />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">الطاولة {editing.tableNumber} · {formatCurrency(editing.total)}</p>
            <PosCheckout
              catalog={catalog as any}
              initialTableId={(editing as any).cafeTable?.id ?? selectedTableId ?? undefined}
              mode="waiter"
              catalogVisible={true}
              cartOpen={false}
              onOrderCreated={() => { setEditing(null); setTab('orders') }}
            />
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setEditing(null)}>إغلاق</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
