'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { Icon } from '@/components/ui/icon'
import { PosCheckout } from '@/components/pos/pos-checkout'
import { OrderStatusTracker } from '@/components/order/order-status-tracker'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WaiterWorkspace } from '@/lib/staff-waiter'

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


function OrderCards({
  orders,
  pendingId,
  onAct,
  onEdit,
  currentUserId,
  onRemoveItem,
  onCancelOrder,
}: {
  orders: WaiterWorkspace['openOrders']
  pendingId: string | null
  onAct: (id: string, action: 'send_to_kitchen' | 'status' | 'serve_items', to?: 'ready' | 'served', items?: { orderItemId: string; quantity: number }[], interventionReason?: string) => Promise<void>
  onEdit: (order: WaiterWorkspace['openOrders'][number]) => void
  currentUserId: string
  onRemoveItem: (order: WaiterWorkspace['openOrders'][number], item: WaiterWorkspace['openOrders'][number]['items'][number]) => Promise<void>
  onCancelOrder: (order: WaiterWorkspace['openOrders'][number], presetReason?: string) => Promise<void>
}) {
  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد أي طلبات.</p>
      ) : (
        orders.map((order) => {
          const isMine = order.responsibleWaiterId === currentUserId
          const isPending = pendingId === order.id
          return (
            <Card key={order.id} className={cn('border rounded-lg p-4', isMine ? 'border-primary/40 bg-primary/5' : 'border-border')}>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">{order.number}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    الطاولة {order.tableNumber} · {order.source === 'qr' ? 'QR' : 'الحضور المباشر'}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatWaiterDateTime(order.createdAt)} · {formatCurrency(order.total)}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1"><Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge><Badge tone={order.sentToKitchen ? 'success' : 'muted'}>{order.sentToKitchen ? 'أُرسل للمطبخ' : 'لم يُرسل'}</Badge></div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-2 text-sm">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0"><span className="block truncate">{item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name}</span>{item.details.length ? <small className="block whitespace-normal text-primary">{item.details.join(' · ')}</small> : null}{item.note ? <small className="block whitespace-normal text-muted-foreground">ملاحظة: {item.note}</small> : null}</span>
                      <span className="text-muted-foreground">{item.servedQty} / {item.qty}</span>
                      <div className="flex gap-1">
                        {!isPending && item.preparedQty > item.servedQty && (
                          <Button size="sm" variant="outline" onClick={() => void onAct(order.id, 'serve_items', undefined, [{ orderItemId: item.id, quantity: item.preparedQty - item.servedQty }] )}>
                            <Icon name="check" size={13} /> تم التقديم
                          </Button>
                        )}
                        {isMine && (
                          <Button size="sm" variant="ghost" onClick={() => void onRemoveItem(order, item)}>
                            <Icon name="trash" size={13} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  {!isPending && order.status === 'new' && isMine && (
                    <Button size="sm" onClick={() => void onAct(order.id, 'send_to_kitchen')}>
                      إرسال للمطبخ
                    </Button>
                  )}
                  {!isPending && order.status === 'preparing' && isMine && (
                    <Button size="sm" onClick={() => void onAct(order.id, 'status', 'ready')}>
                      جاهز
                    </Button>
                  )}
                  {!isPending && order.status === 'ready' && isMine && (
                    <Button size="sm" onClick={() => void onAct(order.id, 'status', 'served')}>
                      تم التقديم
                    </Button>
                  )}
                  {!isPending && isMine && (
                    <Button size="sm" variant="outline" onClick={() => onEdit(order)}>
                      عرض وتعديل الطلب
                    </Button>
                  )}
                  {!isPending && isMine && (
                    <Button size="sm" variant="destructive" onClick={() => void onCancelOrder(order)}>
                      إلغاء
                    </Button>
                  )}
                </div>
              </CardContent>
              <OrderStatusTracker
                id={order.id}
                orderNumber={order.number}
                initialStatus={order.status}
                branchName="—"
                tableNumber={order.tableNumber}
              />
            </Card>
          )
        })
      )}
    </div>
  )
}


function WaiterOrderEditor({
  order,
  products,
  onClose,
  onSaved,
}: {
  order: WaiterWorkspace['openOrders'][number]
  products: { id: string; name: string; price: string; categoryId: string; isAvailable: boolean }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [lines, setLines] = useState<{ itemId?: string; productId: string; qty: number; note: string }[]>(
    order.items.map((item) => ({ itemId: item.id, productId: item.productId, qty: item.qty, note: item.note ?? '' }))
  )
  const [notes, setNotes] = useState(order.orderNotes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const previewTotal = lines.reduce((total, line) => total + (Number(productById.get(line.productId)?.price ?? 0) * line.qty), 0)
  const lineIdentity = (line: { itemId?: string; productId: string }) => line.itemId ?? `new:${line.productId}`

  function add(productId: string) {
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId)
      return existing
        ? current.map((line) => lineIdentity(line) === lineIdentity(existing) ? { ...line, qty: Math.min(20, line.qty + 1) } : line)
        : [...current, { productId, qty: 1, note: '' }]
    })
  }

  function changeQty(identity: string, delta: number) {
    setLines((current) =>
      current
        .map((line) => (lineIdentity(line) === identity ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0)
    )
  }

  async function save() {
    if (!lines.length || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/staff/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: lines, notes: notes.trim() || undefined, expectedUpdatedAt: order.updatedAt }),
      })
      if (!response.ok) throw new Error('حدث في تغيير الطلب')
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
    } finally {
      setBusy(false)
    }
  }


  return (
    <div role="dialog" aria-modal="true" aria-label="تغيير الطلب" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <Card className="mx-auto my-6 w-full max-w-3xl">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>تغيير {order.number}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">الطلب الحالي للتغيير</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>إغلاق</Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {products.map((product) => (
              <Button
                key={product.id}
                type="button"
                variant="outline"
                disabled={!product.isAvailable}
                className="justify-between"
                onClick={() => add(product.id)}
              >
                <span>{product.name}</span>
                <span>{formatCurrency(Number(product.price))}</span>
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t pt-3">
            {lines.map((line) => {
              const product = productById.get(line.productId)
              return (
                <div key={lineIdentity(line)} className="flex flex-wrap items-center gap-2 rounded border p-2">
                  <span className="min-w-32 flex-1 text-sm font-medium">{product?.name ?? 'منتخب غير معرفو'}</span>
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(lineIdentity(line), -1)}>
                    <Icon name="minus" size={14} />
                  </Button>
                  <span className="w-6 text-center">{line.qty}</span>
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(lineIdentity(line), 1)}>
                    <Icon name="plus" size={14} />
                  </Button>
                  <Input
                    value={line.note}
                    maxLength={255}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) => (lineIdentity(item) === lineIdentity(line) ? { ...item, note: event.target.value } : item))
                      )
                    }
                    placeholder="ملحووات الصنياة"
                    className="h-8 sm:w-56"
                  />
                </div>
              )
            })}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">ملحووات إنتغامية (اختياري)</span>
            <Input
              value={notes}
              maxLength={2000}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="إضافة ملحووات إنتغامية"
              className="h-8 sm:w-56"
            />
          </label>
          <div className="flex items-center justify-between border-t pt-3">
            <span className="font-bold">الإجمالي: {formatCurrency(previewTotal)}</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                إلغاء
              </Button>
              <Button disabled={!lines.length || busy} onClick={save}>
                {busy ? 'جاري الحفظ...' : 'حفظ التغيير'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


function QrOrdersPanel({
  orders,
  currentUserId,
  pendingId,
  onAction,
}: {
  orders: WaiterWorkspace['openOrders']
  currentUserId: string
  pendingId: string | null
  onAction: (id: string, action: 'claim_qr' | 'approve_qr' | 'reject_qr', reason?: string) => Promise<boolean>
}) {
  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجيد أي طلبات QR.</p>
      ) : (
        orders.map((order) => {
          const isMine = order.responsibleWaiterId === currentUserId
          const isPending = pendingId === order.id
          return (
            <Card key={order.id} className="border rounded-lg p-3">
              <CardHeader className="flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">{order.number}</CardTitle>
                  <p className="text-xs text-muted-foreground">الطاولة {order.tableNumber} · QR</p>
                </div>
                <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-sm text-muted-foreground">{order.orderNotes ?? 'لا توجد ملاحظات'}</p>
                <div className="mt-2 flex gap-2">
                  {!isPending && order.status === 'new' && !isMine && (
                    <Button size="sm" onClick={() => void onAction(order.id, 'claim_qr')}>
                      الاستلم
                    </Button>
                  )}
                  {!isPending && order.status === 'new' && isMine && (
                    <Button size="sm" onClick={() => void onAction(order.id, 'approve_qr')}>
                      الاعتماد
                    </Button>
                  )}
                  {!isPending && order.status === 'new' && isMine && (
                    <Button size="sm" variant="destructive" onClick={() => void onAction(order.id, 'reject_qr', 'سبب السبيل')}>
                      الرفض
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}


function ShiftPanel({
  workspace,
  transferDialog,
  transferRecipient,
  transferNotes,
  setTransferRecipient,
  setTransferNotes,
  pendingId,
  onRequestTableTransfer,
  onAcceptTableTransfer,
  onRejectTableTransfer,
  onCancelTableTransfer,
  onHandover,
}: {
  workspace: WaiterWorkspace
  transferDialog: { tableId: string; tableNumber: string } | null
  transferRecipient: string
  transferNotes: string
  setTransferRecipient: (value: string) => void
  setTransferNotes: (value: string) => void
  pendingId: string | null
  onRequestTableTransfer: (tableId: string, recipientWaiterId: string, notes: string) => Promise<boolean>
  onAcceptTableTransfer: (transferId: string) => Promise<boolean>
  onRejectTableTransfer: (transferId: string, reason: string) => Promise<boolean>
  onCancelTableTransfer: (transferId: string) => Promise<boolean>
  onHandover: (id: string, action: 'accept' | 'reject', reason?: string) => Promise<boolean>
}) {
  const [rejectingTransfer, setRejectingTransfer] = useState<string | null>(null)
  const [rejectingReason, setRejectingReason] = useState('')
  const [closing, setClosing] = useState(false)
  const [rejectingHandover, setRejectingHandover] = useState<string | null>(null)
  const [handoverReason, setHandoverReason] = useState('')

  const shiftOpen = workspace.shift !== null
  const myTableNumbers = new Set(
    workspace.openOrders
      .filter((o) => o.responsibleWaiterId === workspace.currentUserId && ['new', 'preparing', 'ready'].includes(o.status))
      .map((o) => o.tableNumber)
  )
  const myActiveOrders = workspace.openOrders.filter(
    (o) => o.responsibleWaiterId === workspace.currentUserId && ['new', 'preparing', 'ready'].includes(o.status)
  )
  const incomingTransfers = workspace.incomingTableTransfers
  const outgoingTransfers = workspace.outgoingTableTransfers


  async function closeShift() {
    if (closing) return
    setClosing(true)
    try {
      setClosing(false)
    } catch (cause) {
      setClosing(false)
    }
  }

  async function requestTransfer(tableId: string, recipientWaiterId: string, notes: string) {
    return onRequestTableTransfer(tableId, recipientWaiterId, notes)
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader><CardTitle>الوردية</CardTitle></CardHeader>
        <CardContent>
          {!shiftOpen ? (
            <Button size="sm" onClick={() => { /* Open shift handled by shift page */ }}>
              <Icon name="plus" size={15} /> فتح الوردية
            </Button>
          ) : (
            <>
              <p className="text-sm text-success">الوردية مفتوحة حالياً.</p>
              <Button variant="destructive" onClick={() => setRejectingHandover(null)} size="sm">
                إلغاء الوردية
              </Button>
              <Button
                onClick={() => void closeShift()}
                disabled={closing || myTableNumbers.size > 0}
                size="sm"
              >
                {closing ? 'جاري الإغلاق...' : 'إغلاق الوردية'}
              </Button>
              {myTableNumbers.size > 0 && (
                <p className="mt-1 text-xs text-warning">تنبيه: أنهِ أي طلبات مفتوحة قبل إغلاق الوردية.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>الطاولات المنسندة للنط</CardTitle></CardHeader>
        <CardContent>
          {myTableNumbers.size === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجيد أي طاولات منسونة للنط.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {workspace.tables.map((table) => (
                <div
                  key={table.id}
                  className={cn(
                    'rounded-lg border p-4 text-center',
                    myTableNumbers.has(table.number) ? 'border-primary/40 bg-primary/5' : 'border-success/40'
                  )}
                >
                  <p className="font-bold">الطاولة {table.number}</p>
                  <p className="text-xs text-muted-foreground">{table.openOrders} طلب</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>الطلبات النطسية</CardTitle></CardHeader>
        <CardContent>
          {myActiveOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجيد أي طلبات نطسية.</p>
          ) : (
            <div className="space-y-2">
              {myActiveOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between border rounded p-2">
                  <div>
                    <span className="font-medium"># {order.number}</span>
                    <span className="text-xs text-muted-foreground">الطاولة {order.tableNumber}</span>
                  </div>
                  <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {transferDialog && (
        <Card>
          <CardHeader><CardTitle>نقل المسئولية للطاولة</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">الطاولة {transferDialog.tableNumber}</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">النادل المتلقي للنقل</span>
              <Input value={transferRecipient} onChange={(e) => setTransferRecipient(e.target.value)} placeholder="اختيار النادل" className="h-9" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">ملحووات (اختياري)</span>
              <Input value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} maxLength={255} placeholder="إضافة الملحووات" className="h-9" />
            </label>
            <div className="flex gap-2">
              <Button onClick={() => { if (transferDialog.tableId && transferRecipient) { void requestTransfer(transferDialog.tableId, transferRecipient, transferNotes) } }} disabled={pendingId !== null}>
                إرسال
              </Button>
              <Button variant="ghost" onClick={() => { /* close handled by parent */ }} size="sm">إغلاق</Button>
                </div>
              </CardContent>
            </Card>
      )}

      <Card>
        <CardHeader><CardTitle>نقل المسئولية (الوارد المالي)</CardTitle></CardHeader>
        <CardContent>
          {incomingTransfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجيد إيغام نقل مسئولية.</p>
          ) : (
            <div className="space-y-3">
              {incomingTransfers.map((t) => (
                <Card key={t.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{t.senderName}</p>
                        <p className="text-xs text-muted-foreground">الطاولة {t.tableNumber}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void onAcceptTableTransfer(t.id)} disabled={pendingId !== null}>القبول</Button>
                        <Button size="sm" variant="outline" onClick={() => { setRejectingTransfer(t.id); setRejectingReason('') }}>الرفض</Button>
                      </div>
                    </div>
                    {rejectingTransfer === t.id ? (
                      <div className="flex gap-2 mt-2">
                        <Input value={rejectingReason} onChange={(e) => setRejectingReason(e.target.value)} maxLength={255} placeholder="سبب الرفض" className="h-9 flex-1" />
                        <Button size="sm" variant="destructive" onClick={() => { void onRejectTableTransfer(t.id, rejectingReason); setRejectingTransfer(null) }}>الرفض</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectingTransfer(null)}>إلغاء</Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>نقل المسئولية (المرسل)</CardTitle></CardHeader>
        <CardContent>
          {outgoingTransfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجيد إيغام مرسلة.</p>
          ) : (
            <div className="space-y-3">
              {outgoingTransfers.map((t) => (
                <Card key={t.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{t.recipientName}</p>
                        <p className="text-xs text-muted-foreground">الطاولة {t.tableNumber} · {statusLabel(t.status)}</p>
                      </div>
                      {t.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => void onCancelTableTransfer(t.id)} disabled={pendingId !== null}>إلغاء</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export function WaiterBoard({ workspace }: { workspace: WaiterWorkspace }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tab, setTab] = useState<WorkspaceTab>('pos')
  const [filter, setFilter] = useState('all')
  const [orderScope, setOrderScope] = useState<'mine' | 'all'>('all')
  const [orderSearch, setOrderSearch] = useState('')
  const [clock, setClock] = useState<number | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editing, setEditing] = useState<WaiterWorkspace['openOrders'][number] | null>(null)
  const [showingTableOrderModal, setShowingTableOrderModal] = useState<{ orderId: string; tableNumber: string } | null>(null)
  const [showingProductPicker, setShowingProductPicker] = useState<{ orderId: string; tableNumber: string } | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [transferDialog, setTransferDialog] = useState<{ tableId: string; tableNumber: string } | null>(null)
  const [transferRecipient, setTransferRecipient] = useState<string>('')
  const [transferNotes, setTransferNotes] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [posCartSummary, setPosCartSummary] = useState({ itemCount: 0, total: 0, tableId: '' })

  const catalog = useMemo(() => ({
    draftScope: { userId: workspace.currentUserId, branchId: workspace.branchId },
    categories: workspace.categories,
    products: workspace.products.map((product) => ({ ...product, categoryName: workspace.categories.find((category) => category.id === product.categoryId)?.name ?? '—' })),
    tables: workspace.tables.map(({ id, number, name }) => ({ id, number, name })),
  }), [workspace])
  const selectedTable = workspace.tables.find((table) => table.id === selectedTableId) ?? null
  const selectedOrders = selectedTable ? workspace.openOrders.filter((order) => order.tableNumber === selectedTable.number) : []
  const scopedOrders = useMemo(() => orderScope === 'mine'
    ? workspace.openOrders.filter((order) => order.responsibleWaiterId === workspace.currentUserId)
    : workspace.openOrders,
  [orderScope, workspace.currentUserId, workspace.openOrders])
  const visible = useMemo(() => {
    const query = orderSearch.trim().toLocaleLowerCase('ar')
    return scopedOrders.filter((order) => {
      if (filter !== 'all' && order.status !== filter) return false
      if (!query) return true
      return order.number.toLocaleLowerCase('ar').includes(query)
        || order.tableNumber.toLocaleLowerCase('ar').includes(query)
        || (order.customerName?.toLocaleLowerCase('ar').includes(query) ?? false)
        || order.items.some((item) => item.name.toLocaleLowerCase('ar').includes(query) || (item.variantLabel?.toLocaleLowerCase('ar').includes(query) ?? false))
    })
  }, [filter, orderSearch, scopedOrders])
  const qrOrders = useMemo(() => workspace.openOrders.filter((order) => order.source === 'qr'), [workspace.openOrders])
  const incomingTableTransfers = workspace.incomingTableTransfers
  const outgoingTableTransfers = workspace.outgoingTableTransfers
  const myActiveTableNumbers = useMemo(() => new Set(
    workspace.openOrders
      .filter((o) => o.responsibleWaiterId === workspace.currentUserId && ['new', 'preparing', 'ready'].includes(o.status))
      .map((o) => o.tableNumber)
  ), [workspace.openOrders, workspace.currentUserId])

  useEffect(() => {
    const tick = () => setClock(Date.now())
    tick()
    const interval = window.setInterval(tick, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const posCartTable = workspace.tables.find((table) => table.id === posCartSummary.tableId)

  function openOrderWorkspace(order: WaiterWorkspace['openOrders'][number]) {
    const table = workspace.tables.find((candidate) => candidate.number === order.tableNumber)
    if (!table) {
      setError('تعذر تحديد طاولة الطلب.')
      return
    }
    router.push(`/waiter/tables/${table.id}?orderId=${order.id}`)
  }

  async function act(id: string, action: 'send_to_kitchen' | 'status' | 'serve_items', to?: 'ready' | 'served', items?: { orderItemId: string; quantity: number }[], interventionReason?: string) {
    if (pendingId === id) return
    setPendingId(id)
    setError(null)
    try {
      const order = workspace.openOrders.find((o) => o.id === id)
      if (!order) throw new Error('Order not found')

      if (action === 'send_to_kitchen') {
        const res = await fetch(`/api/staff/orders/${id}/send`, { method: 'POST' })
        if (!res.ok) throw new Error('Failed to send to kitchen')
      } else if (action === 'status') {
        const res = await fetch(`/api/staff/orders/${id}/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: to }),
        })
        if (!res.ok) throw new Error('Failed to update status')
      } else if (action === 'serve_items') {
        const res = await fetch(`/api/staff/orders/${id}/items/serve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items }),
        })
        if (!res.ok) throw new Error('Failed to serve items')
      }

      setSuccess('تم حفظ التغيير على الطلب.')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
    } finally {
      setPendingId(null)
    }
  }

  async function removeOrderItem(order: WaiterWorkspace['openOrders'][number], item: WaiterWorkspace['openOrders'][number]['items'][number]) {
    setPendingId(order.id)
    setError(null)
    try {
      const res = await fetch(`/api/staff/orders/${order.id}/items/${item.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove item')
      setSuccess('تم حذف الصنف من الطلب.')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
    } finally {
      setPendingId(null)
    }
  }

  async function qrAction(id: string, action: 'claim_qr' | 'approve_qr' | 'reject_qr', reason?: string): Promise<boolean> {
    setPendingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/staff/orders/${id}/qr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      if (!res.ok) throw new Error('QR action failed')
      setSuccess('تم تنفيذ إجراء الطلب QR.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function requestTableTransferAction(tableId: string, recipientWaiterId: string, notes: string): Promise<boolean> {
    setPendingId(tableId)
    setError(null)
    try {
      const res = await fetch('/api/staff/waiter/table-transfers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tableId, recipientWaiterId, notes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to request table transfer')
      }
      setSuccess('تم إرسال مسؤولية الطاولة إلى النادل.')
      setTransferDialog(null)
      setTransferRecipient('')
      setTransferNotes('')
      startTransition(() => router.refresh())
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function acceptTableTransferAction(transferId: string): Promise<boolean> {
    setPendingId(transferId)
    setError(null)
    try {
      const res = await fetch(`/api/staff/waiter/table-transfers/${transferId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to accept transfer')
      }
      setSuccess('تم قبول المسؤولية.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function rejectTableTransferAction(transferId: string, reason: string): Promise<boolean> {
    setPendingId(transferId)
    setError(null)
    try {
      const res = await fetch(`/api/staff/waiter/table-transfers/${transferId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to reject transfer')
      }
      setSuccess('تم رفض المسؤولية.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function cancelTableTransferAction(transferId: string): Promise<boolean> {
    setPendingId(transferId)
    setError(null)
    try {
      const res = await fetch(`/api/staff/waiter/table-transfers/${transferId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to cancel transfer')
      }
      setSuccess('تم إلغاء المسئولية.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function handoverAction(id: string, action: 'accept' | 'reject', reason?: string): Promise<boolean> {
    setPendingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/staff/waiter/handovers/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Handover action failed')
      }
      setSuccess('تم تنفيذ إجراء الوردية.')
      startTransition(() => router.refresh())
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function cancelMistakenOrder(order: WaiterWorkspace['openOrders'][number], presetReason?: string) {
    setPendingId(order.id)
    setError(null)
    try {
      const res = await fetch(`/api/staff/orders/${order.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: presetReason || 'سبب الإلغاء' }),
      })
      if (!res.ok) throw new Error('Failed to cancel order')
      setSuccess('تم إلغاء الطلب.')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في تغيير الطلب')
    } finally {
      setPendingId(null)
    }
  }

  async function addProductToOrder(orderId: string, items: { productId: string; qty: number; note?: string }[]) {
    setPendingId(orderId)
    setError(null)
    try {
      const res = await fetch(`/api/staff/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'فشل إضافة المنتج')
      }
      setSuccess('تم إضافة المنتج للطلب.')
      setShowingProductPicker(null)
      setShowingTableOrderModal(null)
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث في إضافة المنتج')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden bg-background">
      <header className="sticky top-0 z-30 flex flex-col border-b border-border bg-background/95 backdrop-blur px-4 py-3 lg:px-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">مساحة النادل</h1>
            <p className="text-xs text-muted-foreground">{workspace.branchName} · {workspace.employeeName}</p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {error ? <p role="alert" className="min-w-0 break-words rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
            {success ? <p className="min-w-0 break-words rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{success}</p> : null}
          </div>
        </div>
      </header>

      <nav className="sticky top-[73px] z-20 w-full border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:px-6" aria-label="القوائم">
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
          ariaLabel="الألقاة"
          className="w-full flex-nowrap justify-start overflow-x-auto"
        />
      </nav>

      <div className="border-b bg-background px-3 py-2 sm:px-4 lg:px-6">
        <Button type="button" variant="outline" className="w-full justify-between" onClick={() => setCartOpen(true)}>
          <span className="flex items-center gap-2"><Icon name="cart" size={17} /> سلة الطلب {posCartTable ? `— طاولة ${posCartTable.number}` : ''}</span>
          <span>{posCartSummary.itemCount} أصناف · {formatCurrency(posCartSummary.total)}</span>
        </Button>
      </div>

      <main className="min-w-0 w-full p-3 sm:p-4 lg:p-6">
        <div className="flex min-w-0 w-full flex-col gap-5">
          <PosCheckout
            catalog={catalog}
            initialTableId={selectedTable?.id}
            mode="waiter"
            catalogVisible={tab === 'pos'}
            cartOpen={cartOpen}
            onCartOpenChange={setCartOpen}
            onCartSummaryChange={setPosCartSummary}
            onOrderCreated={() => setTab('orders')}
          />

          {tab === 'tables' ? (
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
                {workspace.tables.map((table) => {
                  const isMyActive = myActiveTableNumbers.has(table.number)
                  const tableOrders = workspace.openOrders.filter((o) => o.tableNumber === table.number)
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => router.push(`/waiter/tables/${table.id}`)}
                      className={cn(
                        'rounded-lg border bg-card p-4 text-right transition-colors hover:bg-accent',
                        isMyActive ? 'border-primary/40 ring-2 ring-primary' : 'border-success/40',
                        table.openOrders > 0 ? 'border-warning/40' : 'border-success/40'
                      )}
                    >
                      <span className="block text-xl font-bold">الطاولة {table.number}</span>
                      <span className="text-xs text-muted-foreground">{table.name ?? `${table.capacity} شخصية`}</span>
                      <span className={cn('mt-2 block text-xs font-medium', table.openOrders ? 'text-warning' : 'text-success')}>
                        {table.openOrders ? `${table.openOrders} طلب` : 'فارغ'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}

          {tab === 'orders' ? (

            <>
              <div className="mb-3 flex flex-col gap-2">
                <Input icon="search" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="ابحث برقم الطلب أو الطاولة أو الصنف…" aria-label="بحث الطلبات" />
                <Segmented
                  options={[
                    { value: 'all', label: 'جميع الطلبات' },
                    { value: 'mine', label: 'الخاص بي' },
                  ]}
                  value={orderScope}
                  onChange={(value) => setOrderScope(value as 'mine' | 'all')}
                  ariaLabel="نطاق الطلبات"
                />
                <Segmented
                  options={[
                    { value: 'all', label: 'الكل' },
                    { value: 'new', label: 'جديد' },
                    { value: 'preparing', label: 'قيد التحضير' },
                    { value: 'ready', label: 'جاهز' },
                    { value: 'cancelled', label: 'تم الإلغاء' },
                  ]}
                  value={filter}
                  onChange={setFilter}
                  ariaLabel="حالة الطلب"
                />
              </div>
              <OrderCards
                orders={visible}
                pendingId={pendingId}
                onAct={act}
                onEdit={openOrderWorkspace}
                currentUserId={workspace.currentUserId}
                onRemoveItem={removeOrderItem}
                onCancelOrder={cancelMistakenOrder}
              />
            </>
          ) : null}

          {tab === 'qr' ? (
            <QrOrdersPanel
              orders={qrOrders}
              currentUserId={workspace.currentUserId}
              pendingId={pendingId}
              onAction={qrAction}
            />
          ) : null}

          {tab === 'shift' ? (
            <ShiftPanel
              workspace={workspace}
              transferDialog={transferDialog}
              transferRecipient={transferRecipient}
              transferNotes={transferNotes}
              setTransferRecipient={setTransferRecipient}
              setTransferNotes={setTransferNotes}
              pendingId={pendingId}
              onRequestTableTransfer={requestTableTransferAction}
              onAcceptTableTransfer={acceptTableTransferAction}
              onRejectTableTransfer={rejectTableTransferAction}
              onCancelTableTransfer={cancelTableTransferAction}
              onHandover={handoverAction}
            />
          ) : null}

          {selectedTable && tab === 'tables' ? (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle>الطاولة {selectedTable.number}</CardTitle>
                    <p className="text-sm text-muted-foreground">{selectedTable.name ?? 'لا يوجد اسم'}</p>
                  </div>
                  <Button size="sm" onClick={() => setTab('orders')}>
                    <Icon name="plus" size={15} /> إضافة طلب
                  </Button>
                </CardHeader>
                <CardContent>
                  <OrderCards
                    orders={selectedOrders}
                    pendingId={pendingId}
                    onAct={act}
                    onEdit={openOrderWorkspace}
                    currentUserId={workspace.currentUserId}
                    onRemoveItem={removeOrderItem}
                    onCancelOrder={cancelMistakenOrder}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}

          {editing ? (
            <WaiterOrderEditor
              order={editing}
              products={catalog.products}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                setSuccess('تم حفظ التغيير على الطلب.')
                startTransition(() => router.refresh())
              }}
            />
          ) : null}

        </div>
      </main>

      {showingTableOrderModal && (
        <>
        <TableOrderModal
          orderId={showingTableOrderModal.orderId}
          tableNumber={showingTableOrderModal.tableNumber}
          onClose={() => setShowingTableOrderModal(null)}
          onAddProduct={() => {
            const order = workspace.openOrders.find((o) => o.id === showingTableOrderModal.orderId)
            setShowingTableOrderModal(null)
            setShowingProductPicker({ orderId: showingTableOrderModal.orderId, tableNumber: showingTableOrderModal.tableNumber })
          }}
          setEditing={setEditing}
          workspace={workspace}
        />
      </>
      )}

      {showingProductPicker && (
        <ProductPickerModal
          orderId={showingProductPicker.orderId}
          tableNumber={showingProductPicker.tableNumber}
          products={catalog.products}
          categories={catalog.categories}
          onClose={() => setShowingProductPicker(null)}
          onAdd={(items) => addProductToOrder(showingProductPicker.orderId, items)}
        />
      )}

    </div>
  )
}

function TableOrderModal({
  orderId,
  tableNumber,
  onClose,
  onAddProduct,
  setEditing,
  workspace,
}: {
  orderId: string
  tableNumber: string
  onClose: () => void
  onAddProduct: () => void
  setEditing: (order: WaiterWorkspace['openOrders'][number] | null) => void
  workspace: WaiterWorkspace
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label="تفاصيل الطلب" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 sm:p-6">
      <Card className="mx-auto my-6 w-full max-w-2xl">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>طلب الطاولة {tableNumber}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">رقم الطلب: {orderId}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>إغلاق</Button>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">اختر إجراء للطلب:</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { onClose(); setEditing(workspace.openOrders.find((o) => o.id === orderId) ?? null) }}>
              تعديل الطلب
            </Button>
            <Button size="sm" onClick={onAddProduct}>
              <Icon name="plus" size={14} /> إضافة منتج
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProductPickerModal({
  orderId,
  tableNumber,
  products,
  categories,
  onClose,
  onAdd,
}: {
  orderId: string
  tableNumber: string
  products: NonNullable<WaiterWorkspace['products']>
  categories: WaiterWorkspace['categories']
  onClose: () => void
  onAdd: (items: { productId: string; qty: number; note?: string }[]) => void
}) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [cart, setCart] = useState<{ productId: string; qty: number; note: string }[]>([])
  const [busy, setBusy] = useState(false)

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) =>
      (selectedCategory === 'all' || p.categoryId === selectedCategory) &&
      (!q || p.name.toLowerCase().includes(q))
    )
  }, [products, search, selectedCategory])

  const previewTotal = cart.reduce((total, line) => total + Number(products.find((p) => p.id === line.productId)?.price ?? 0) * line.qty, 0)

  function addProduct(productId: string) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId)
      if (existing) return prev.map((l) => (l.productId === productId ? { ...l, qty: Math.min(20, l.qty + 1) } : l))
      return [...prev, { productId, qty: 1, note: '' }]
    })
  }

  function removeProduct(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId))
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: Math.max(1, Math.min(20, l.qty + delta)) } : l))
        .filter((l) => l.qty > 0)
    )
  }

  async function confirm() {
    setBusy(true)
    try {
      await onAdd(cart.map((l) => ({ productId: l.productId, qty: l.qty, note: l.note.trim() || undefined })))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="اختيار منتج" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 sm:p-6">
      <Card className="mx-auto my-6 w-full max-w-3xl">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>إضافة منتج - الطاولة {tableNumber}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">الطلب: {orderId}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>إغلاق</Button>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex-1">
              <Input
                placeholder="ابحث عن منتج..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex-1">
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="h-10 rounded border bg-background px-3">
                <option value="all">جميع الأقسام</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 text-right text-sm text-muted-foreground">
              المجموع المؤقت: {formatCurrency(previewTotal)}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredProducts.length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground text-center py-4">لا توجد منتجات مطابقة.</p>
            ) : (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product.id)}
                  disabled={!product.isAvailable}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors',
                    product.isAvailable ? 'hover:bg-accent/40 border-border' : 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="text-sm font-medium truncate">{product.name}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(Number(product.price))}</span>
                  {!product.isAvailable ? <span className="mt-1 text-xs text-destructive">غير متوفر</span> : null}
                </button>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className="mt-6 rounded-lg border bg-card p-3">
              <div className="flex justify-between mb-3"><span className="font-medium">المنتجات المختارة:</span><span className="font-bold">{formatCurrency(previewTotal)}</span></div>
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {cart.map((line) => {
                  const product = products.find((p) => p.id === line.productId)
                  return (
                    <li key={line.productId} className="flex items-center justify-between gap-2 rounded border p-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate">{product?.name ?? 'منتج'}</span>
                        <span className="text-xs text-muted-foreground">{formatCurrency(Number(product?.price ?? 0) * line.qty)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(line.productId, -1)}>
                          <Icon name="minus" size={12} />
                        </Button>
                        <span className="w-6 text-center">{line.qty}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(line.productId, 1)}>
                          <Icon name="plus" size={12} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeProduct(line.productId)}>
                          <Icon name="trash" size={12} />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="flex justify-end mt-3">
                <Button variant="outline" onClick={onClose}>إلغاء</Button>
                <Button disabled={busy} onClick={confirm}>{busy ? 'جاري الإضافة...' : 'إضافة للطلب'}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
