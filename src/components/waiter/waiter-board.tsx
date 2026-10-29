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
            <Card key={order.id} className={cn('border rounded-lg p-3', isMine ? 'border-primary/40 bg-primary/5' : 'border-border')}>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">{order.number}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    الطاولة {order.tableNumber} · {order.source === 'qr' ? 'QR' : 'الحضور المباشر'}
                  </p>
                </div>
                <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-2 text-sm">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.name}</span>
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
                      تغيير
                    </Button>
                  )}
                  {!isPending && isMine && (
                    <Button size="sm" variant="destructive" onClick={() => void onCancelOrder(order)}>
                      إلغاء
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


function ReadyItemServeList({
  orders,
  onServe,
}: {
  orders: { id: string; number: string; tableNumber: string; items: { id: string; productName: string; quantity: number; servedQuantity: number; preparedQuantity: number }[] }[]
  onServe: (orderId: string, items: { orderItemId: string; quantity: number }[]) => Promise<void>
}) {
  const readyLines = orders.flatMap((order) =>
    order.items.filter((i) => i.preparedQuantity > i.servedQuantity).map((i) => ({ ...i, orderId: order.id, orderNumber: order.number, tableNumber: order.tableNumber }))
  )

  if (readyLines.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد مواد جاهزة للتقديم.</p>
  }

  return (
    <div className="space-y-2">
      {readyLines.map((line) => (
        <Card key={line.id} className="border rounded-lg p-3">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">{line.orderNumber}</CardTitle>
              <p className="text-xs text-muted-foreground">الطاولة {line.tableNumber} · {line.productName}</p>
            </div>
            <Badge tone="warning">جاهز</Badge>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-sm">{line.servedQuantity} / {line.quantity} تم التقديم</p>
            <Button size="sm" onClick={() => void onServe(line.orderId, [{ orderItemId: line.id, quantity: line.preparedQuantity - line.servedQuantity }] )}>
              تقديم الأصناف
            </Button>
          </CardContent>
        </Card>
      ))}
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
  const [lines, setLines] = useState<{ productId: string; qty: number; note: string }[]>(
    order.items.map((item) => ({ productId: item.id, qty: item.qty, note: item.note ?? '' }))
  )
  const [notes, setNotes] = useState(order.orderNotes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const previewTotal = lines.reduce((total, line) => total + (Number(productById.get(line.productId)?.price ?? 0) * line.qty), 0)

  function add(productId: string) {
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId)
      return existing
        ? current.map((line) => line.productId === productId ? { ...line, qty: Math.min(20, line.qty + 1) } : line)
        : [...current, { productId, qty: 1, note: '' }]
    })
  }

  function changeQty(productId: string, delta: number) {
    setLines((current) =>
      current
        .map((line) => (line.productId === productId ? { ...line, qty: line.qty + delta } : line))
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
        body: JSON.stringify({ items: lines, notes: notes.trim() || undefined }),
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
                <div key={line.productId} className="flex flex-wrap items-center gap-2 rounded border p-2">
                  <span className="min-w-32 flex-1 text-sm font-medium">{product?.name ?? 'منتخب غير معرفو'}</span>
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(line.productId, -1)}>
                    <Icon name="minus" size={14} />
                  </Button>
                  <span className="w-6 text-center">{line.qty}</span>
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(line.productId, 1)}>
                    <Icon name="plus" size={14} />
                  </Button>
                  <Input
                    value={line.note}
                    maxLength={255}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) => (item.productId === line.productId ? { ...item, note: event.target.value } : item))
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
  const [filter, setFilter] = useState('new')
  const [orderScope, setOrderScope] = useState<'mine' | 'all'>('all')
  const [clock, setClock] = useState<number | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editing, setEditing] = useState<WaiterWorkspace['openOrders'][number] | null>(null)
  const [transferDialog, setTransferDialog] = useState<{ tableId: string; tableNumber: string } | null>(null)
  const [transferRecipient, setTransferRecipient] = useState<string>('')
  const [transferNotes, setTransferNotes] = useState('')

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
  const ready = useMemo(() => workspace.openOrders.filter((order) => ['preparing', 'ready'].includes(order.status) && order.items.some((item) => item.preparedQty > item.servedQty)), [workspace.openOrders])
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

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex flex-col border-b border-border bg-background/95 backdrop-blur px-4 py-3 lg:px-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">مساحة النادل</h1>
            <p className="text-xs text-muted-foreground">{workspace.branchName} · {workspace.employeeName}</p>
          </div>
          <div className="flex gap-2">
            {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
            {success ? <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{success}</p> : null}
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
          className="w-full justify-start overflow-x-auto"
        />
      </nav>

      <main className="w-full p-4 lg:p-6">
        <div className="flex w-full flex-col gap-5">
          {tab === 'pos' ? (
            <PosCheckout catalog={catalog} initialTableId={selectedTable?.id} mode="waiter" />
          ) : null}

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
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => setSelectedTableId(table.id)}
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
                onEdit={setEditing}
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
                    onEdit={setEditing}
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

          {ready.length > 0 && tab !== 'shift' ? (
            <Card className="mt-4">
              <CardHeader><CardTitle>المواد الجاهزة للتقديم</CardTitle></CardHeader>
              <CardContent>
                <ReadyItemServeList
                  orders={ready.map((o) => ({
                    id: o.id,
                    number: o.number,
                    tableNumber: o.tableNumber,
                    items: o.items.map((i) => ({
                      id: i.id,
                      productName: i.name,
                      quantity: i.qty,
                      servedQuantity: i.servedQty,
                      preparedQuantity: i.preparedQty,
                    })),
                  }))}
                  onServe={(orderId, items) => act(orderId, 'serve_items', undefined, items)}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>
    </div>
  )
}
