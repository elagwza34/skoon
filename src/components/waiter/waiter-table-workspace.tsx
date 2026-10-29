'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'
import type { WaiterWorkspace } from '@/lib/staff-waiter'
import { cn } from '@/lib/utils'

type Product = WaiterWorkspace['products'][number]
type Order = WaiterWorkspace['openOrders'][number]
type Table = WaiterWorkspace['tables'][number]
type PendingLine = {
  key: string
  productId: string
  variantId?: string
  modifierSelections: Record<string, string[]>
  qty: number
  note: string
}

function statusLabel(status: string) {
  return ({ new: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', served: 'تم التقديم', cancelled: 'ملغي' } as Record<string, string>)[status] ?? status
}

function itemStatus(item: Order['items'][number]) {
  if (item.servedQty >= item.qty) return 'تم التقديم'
  if (item.preparedQty >= item.qty) return 'جاهز'
  if (item.preparationStartedAt) return 'قيد التحضير'
  return 'جديد'
}

function responseError(data: unknown, fallback: string) {
  return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : fallback
}

export function WaiterTableWorkspace({ workspace, table }: { workspace: WaiterWorkspace; table: Table }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const orders = useMemo(() => workspace.openOrders.filter((order) => order.tableNumber === table.number && ['new', 'preparing', 'ready'].includes(order.status)), [table.number, workspace.openOrders])
  const editableOrder = orders.find((order) => order.status === 'new' && !order.sentToKitchen && order.responsibleWaiterId === workspace.currentUserId) ?? null
  const [draftQuantities, setDraftQuantities] = useState<Record<string, number>>({})
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([])
  const [pending, setPending] = useState<PendingLine[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [quantityTargets, setQuantityTargets] = useState<Record<string, number>>({})
  const [variantTargets, setVariantTargets] = useState<Record<string, string>>({})
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestKey = useRef(crypto.randomUUID())
  const draftKey = `skoon.waiter.table-draft:${workspace.currentUserId}:${workspace.branchId}:${table.id}`
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null

  const hasExistingDraft = !!removedItemIds.length || (editableOrder?.items.some((item) => (draftQuantities[item.id] ?? item.qty) !== item.qty || (draftNotes[item.id] ?? item.note ?? '') !== (item.note ?? '')) ?? false)
  const hasDraft = hasExistingDraft || pending.length > 0
  const allItems = orders.flatMap((order) => order.items)
  const totalQty = allItems.reduce((sum, item) => sum + item.qty, 0)
  const total = orders.reduce((sum, order) => sum + order.total, 0)
  const preparing = allItems.reduce((sum, item) => sum + Math.max(0, item.qty - item.preparedQty), 0)
  const ready = allItems.reduce((sum, item) => sum + Math.max(0, item.preparedQty - item.servedQty), 0)
  const served = allItems.reduce((sum, item) => sum + item.servedQty, 0)

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasDraft) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasDraft])

  useEffect(() => {
    const interval = window.setInterval(() => { if (!hasDraft && !modalOpen && !busy) startTransition(() => router.refresh()) }, 20_000)
    return () => window.clearInterval(interval)
  }, [busy, hasDraft, modalOpen, router])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey)
      if (!raw) return
      const value = JSON.parse(raw) as { pending?: PendingLine[] }
      if (Array.isArray(value.pending)) setPending(value.pending.filter((line) => workspace.products.some((product) => product.id === line.productId)))
    } catch { window.localStorage.removeItem(draftKey) }
  }, [draftKey, workspace.products])

  useEffect(() => {
    try {
      if (pending.length) window.localStorage.setItem(draftKey, JSON.stringify({ pending }))
      else window.localStorage.removeItem(draftKey)
    } catch { /* The in-memory draft remains usable when storage is unavailable. */ }
  }, [draftKey, pending])

  function changeExisting(item: Order['items'][number], delta: number) {
    setDraftQuantities((current) => ({ ...current, [item.id]: Math.max(1, Math.min(20, (current[item.id] ?? item.qty) + delta)) }))
  }

  async function save() {
    if (!hasDraft || busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (hasExistingDraft && editableOrder) {
        const response = await fetch(`/api/staff/orders/${editableOrder.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            items: editableOrder.items.filter((item) => !removedItemIds.includes(item.id)).map((item) => ({ itemId: item.id, productId: item.productId, qty: draftQuantities[item.id] ?? item.qty, note: (draftNotes[item.id] ?? item.note ?? '').trim() || undefined })),
            notes: editableOrder.orderNotes ?? undefined, expectedUpdatedAt: editableOrder.updatedAt,
          }),
        })
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok) throw new Error(responseError(data, 'تعذر حفظ تعديلات الطلب؛ قد تكون بياناته تغيرت.'))
      }

      if (pending.length) {
        const createResponse = await fetch('/api/staff/pos/orders', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': requestKey.current },
          body: JSON.stringify({
            orderType: 'dine_in', tableId: table.id,
            items: pending.map((line) => ({ productId: line.productId, variantId: line.variantId, modifierSelections: Object.entries(line.modifierSelections).map(([groupId, valueIds]) => ({ groupId, valueIds })), qty: line.qty, note: line.note.trim() || undefined })),
          }),
        })
        const created: unknown = await createResponse.json().catch(() => null)
        if (!createResponse.ok) throw new Error(responseError(created, 'تعذر إنشاء الإضافات الجديدة.'))
        const orderId = created && typeof created === 'object' && 'id' in created && typeof created.id === 'string' ? created.id : null
        if (!orderId) throw new Error('تم إنشاء الطلب لكن تعذر التحقق من رقمه؛ حدّث الصفحة قبل إعادة المحاولة.')
        const sendResponse = await fetch(`/api/staff/orders/${orderId}/send`, { method: 'POST' })
        const sent: unknown = await sendResponse.json().catch(() => null)
        if (!sendResponse.ok) throw new Error(`تم حفظ الإضافات في الطلب ${orderId} لكنها لم تُرسل للمطبخ: ${responseError(sent, 'أعد المحاولة من الطلب غير المرسل.')}`)
      }

      setDraftQuantities({})
      setDraftNotes({})
      setRemovedItemIds([])
      setPending([])
      requestKey.current = crypto.randomUUID()
      setNotice('تم حفظ التغييرات وإرسال الإضافات المؤهلة للمطبخ.')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ التغييرات.')
      startTransition(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  async function retryDispatch(order: Order) {
    setBusy(true); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/staff/orders/${order.id}/send`, { method: 'POST' })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseError(data, 'تعذر إعادة الإرسال للمطبخ.'))
      setNotice(`تم إرسال ${order.number} للمطبخ دون إنشاء طلب جديد.`)
      startTransition(() => router.refresh())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إعادة الإرسال للمطبخ.') }
    finally { setBusy(false) }
  }

  async function cancelSavedItem(order: Order, item: Order['items'][number]) {
    const reason = window.prompt(`سبب إلغاء ${item.name}`)?.trim()
    if (!reason) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/staff/orders/${order.id}/items/${item.id}/void`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ reason }),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseError(data, 'تعذر إلغاء الصنف وفق دورة المخزون.'))
      setNotice('تم إلغاء الصنف وتطبيق معالجة الحجز أو الهالك الموثقة.')
      setCartOpen(false)
      startTransition(() => router.refresh())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إلغاء الصنف.') }
    finally { setBusy(false) }
  }

  async function adjustSavedItem(order: Order, item: Order['items'][number], action: 'quantity' | 'variant') {
    const targetQuantity = quantityTargets[item.id] ?? item.qty
    const replaceQuantity = variantQuantities[item.id] ?? item.qty
    const variantId = variantTargets[item.id]
    if (action === 'quantity' && targetQuantity === item.qty) return
    if (action === 'variant' && !variantId) { setError('اختر المتغير البديل أولًا.'); return }
    const waste = action === 'quantity'
      ? Math.max(0, item.preparedQty - targetQuantity)
      : Math.max(0, replaceQuantity - Math.max(0, item.qty - item.preparedQty))
    const message = waste > 0
      ? `سيُسجل هالك لعدد ${waste} من الوحدات المحضرة، مع الحفاظ على سجل التحضير. هل تريد المتابعة؟`
      : 'سيتم تحديث الحجز وإرسال العمل المتغير للمطبخ. هل تريد المتابعة؟'
    if (!window.confirm(message)) return
    const reason = window.prompt('سبب التعديل (مطلوب للسجل والمطبخ)')?.trim()
    if (!reason) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/staff/orders/${order.id}/items/${item.id}/adjust`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(action === 'quantity'
          ? { action, targetQuantity, reason, expectedUpdatedAt: item.updatedAt }
          : { action, variantId, replaceQuantity, reason, expectedUpdatedAt: item.updatedAt }),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseError(data, response.status === 409 ? 'تعارض مع تحديث المطبخ؛ حدّث الصفحة وأعد المحاولة.' : 'تعذر تعديل الصنف.'))
      setNotice(action === 'quantity' ? 'تم تعديل الكمية والحجوزات وإبلاغ المطبخ.' : 'تم استبدال المتغير وتسجيل أثر التحضير وإبلاغ المطبخ.')
      setCartOpen(false)
      startTransition(() => router.refresh())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تعديل الصنف.') }
    finally { setBusy(false) }
  }

  return <main dir="rtl" className="min-h-dvh bg-background pb-28">
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { if (!hasDraft || window.confirm('لديك تغييرات غير محفوظة. هل تريد المغادرة؟')) router.push('/waiter') }}>
            <Icon name="chevronRight" size={16} /> الطاولات
          </Button>
          <div><h1 className="text-2xl font-bold">الطاولة {table.number}</h1><p className="text-sm text-muted-foreground">{table.name ?? `السعة ${table.capacity}`} · {orders.length ? `${orders.length} طلب نشط` : 'فارغة'}</p></div>
        </div>
        <div className="flex items-center gap-2"><Badge tone={orders.length ? 'warning' : 'success'}>{orders.length ? 'مشغولة' : 'متاحة'}</Badge><Button onClick={() => { setSelectedOrderId(null); setModalOpen(true) }}><Icon name="plus" size={16} /> إنشاء طلب</Button></div>
      </header>

      <Button type="button" variant="outline" className="w-full justify-between" onClick={() => setCartOpen(true)}>
        <span className="flex items-center gap-2"><Icon name="cart" size={17} /> سلة الطلب — طاولة {table.number}</span>
        <span>{pending.reduce((sum, line) => sum + line.qty, 0)} معلّق · {selectedOrder ? selectedOrder.number : 'طلب جديد'}</span>
      </Button>

      {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{notice}</p> : null}

      <section aria-label="ملخص الطاولة" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[['الكمية', totalQty], ['الإجمالي', formatCurrency(total)], ['قيد التحضير', preparing], ['جاهز', ready], ['تم التقديم', served]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold">{value}</p></CardContent></Card>)}
      </section>

      <section className="space-y-3">
        {orders.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد طلبات نشطة على هذه الطاولة. يمكنك إضافة صنف لبدء طلب Dine-In جديد.</CardContent></Card> : orders.map((order) => {
          const canEdit = editableOrder?.id === order.id
          return <Card key={order.id}>
            <CardHeader className="flex-row items-start justify-between gap-2"><div><CardTitle>{order.number}</CardTitle><p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString('ar-EG')} · {order.responsibleWaiterName ?? 'غير مُعيّن'}</p></div><Badge tone={order.status === 'ready' ? 'success' : order.status === 'preparing' ? 'warning' : 'info'}>{statusLabel(order.status)}</Badge></CardHeader>
            <CardContent className="space-y-2">
              {order.items.filter((item) => !removedItemIds.includes(item.id)).map((item) => <div key={item.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium">{item.name}</p>{item.variantLabel ? <p className="text-xs text-primary">{item.variantLabel}</p> : null}{item.details.length ? <p className="text-xs text-muted-foreground">{item.details.join(' · ')}</p> : null}</div><div className="text-left text-sm"><p>{formatCurrency(item.unitPrice)} × {draftQuantities[item.id] ?? item.qty}</p><p className="font-semibold">{formatCurrency(item.unitPrice * (draftQuantities[item.id] ?? item.qty))}</p></div></div>
                <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone="muted">{itemStatus(item)}</Badge>{canEdit ? <><Button size="icon" variant="outline" className="h-9 w-9" onClick={() => changeExisting(item, -1)} aria-label={`إنقاص ${item.name}`}><Icon name="minus" size={14} /></Button><span className="min-w-6 text-center">{draftQuantities[item.id] ?? item.qty}</span><Button size="icon" variant="outline" className="h-9 w-9" onClick={() => changeExisting(item, 1)} aria-label={`زيادة ${item.name}`}><Icon name="plus" size={14} /></Button><Input className="h-9 min-w-48 flex-1" maxLength={255} value={draftNotes[item.id] ?? item.note ?? ''} onChange={(event) => setDraftNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="ملاحظات المطبخ" />{editableOrder && editableOrder.items.length - removedItemIds.length > 1 ? <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setRemovedItemIds((current) => [...current, item.id])} aria-label={`إزالة ${item.name}`}><Icon name="trash" size={15} /></Button> : null}</> : <span className="text-xs text-muted-foreground">أُرسل للمطبخ؛ لا يمكن تغيير السطر دون إجراء الإلغاء المعتمد.</span>}</div>
              </div>)}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm font-semibold"><span>إجمالي الطلب: {formatCurrency(order.total)}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setSelectedOrderId(order.id); setCartOpen(true) }}>عرض وتعديل الطلب</Button>{!order.sentToKitchen ? <Button size="sm" disabled={busy} onClick={() => void retryDispatch(order)}>إعادة الإرسال للمطبخ</Button> : null}</div></div>
            </CardContent>
          </Card>
        })}
      </section>

      {pending.length ? <Card className="border-primary/40"><CardHeader><CardTitle>إضافات لم تُرسل</CardTitle></CardHeader><CardContent className="space-y-2">{pending.map((line) => { const product = workspace.products.find((candidate) => candidate.id === line.productId); const variant = product?.variants.find((candidate) => candidate.id === line.variantId); return <div key={line.key} className="flex items-center justify-between gap-3 rounded border p-3"><div><p className="font-medium">{product?.name}</p><p className="text-xs text-muted-foreground">{variant?.label ?? ''}{line.note ? ` · ${line.note}` : ''}</p></div><div className="flex items-center gap-2"><span>× {line.qty}</span><Button size="icon" variant="ghost" className="text-destructive" onClick={() => setPending((current) => current.filter((candidate) => candidate.key !== line.key))}><Icon name="trash" size={15} /></Button></div></div>})}</CardContent></Card> : null}
    </div>

    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur"><div className="mx-auto flex max-w-6xl gap-2"><Button variant="outline" className="flex-1" onClick={() => setModalOpen(true)}><Icon name="plus" size={16} /> إضافة صنف</Button><Button className="flex-[2]" disabled={!hasDraft || busy} onClick={() => void save()}>{busy ? 'جارٍ الحفظ…' : 'حفظ وإرسال التغييرات للمطبخ'}</Button></div></div>
    {modalOpen ? <AddProductModal tableNumber={table.number} products={workspace.products} categories={workspace.categories} pending={pending} setPending={setPending} onClose={() => setModalOpen(false)} /> : null}
    {cartOpen ? <div role="dialog" aria-modal="true" aria-label="سلة الطلب" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-2 sm:p-4" dir="rtl"><Card className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden"><CardHeader className="flex-row items-center justify-between border-b"><div><CardTitle>سلة الطلب — طاولة {table.number}</CardTitle><p className="text-xs text-muted-foreground">{selectedOrder ? selectedOrder.number : 'طلب جديد'}</p></div><Button variant="ghost" size="sm" onClick={() => setCartOpen(false)}>إغلاق</Button></CardHeader><CardContent className="min-h-0 space-y-3 overflow-y-auto p-4">{selectedOrder ? <section className="space-y-2"><h3 className="font-semibold">الأصناف المحفوظة</h3>{selectedOrder.items.map((item) => { const product = workspace.products.find((candidate) => candidate.id === item.productId); const target = quantityTargets[item.id] ?? item.qty; const replaceQty = variantQuantities[item.id] ?? item.qty; return <div key={item.id} className="space-y-3 rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.variantLabel ?? ''}{item.details.length ? ` · ${item.details.join(' · ')}` : ''} · {itemStatus(item)}</p><p className="text-xs">الأصلية: {item.qty} · المحضرة: {item.preparedQty} · المقدمة: {item.servedQty}</p></div><span>{formatCurrency(item.unitPrice)} × {item.qty}</span></div>{item.servedQty === 0 ? <div className="grid gap-2 border-t pt-3 sm:grid-cols-2"><div className="space-y-2 rounded bg-muted/30 p-2"><label className="text-xs font-medium">الكمية المطلوبة</label><Input type="number" min={1} max={99} value={target} onChange={(event) => setQuantityTargets((current) => ({ ...current, [item.id]: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))} /><p className="text-xs text-muted-foreground">{target < item.preparedQty ? `سيُسجل هالك ${item.preparedQty - target}` : target > item.qty ? `عمل جديد ${target - item.qty}` : `تحرير ${item.qty - target} من الحجز`}</p><Button size="sm" className="w-full" disabled={busy || target === item.qty} onClick={() => void adjustSavedItem(selectedOrder, item, 'quantity')}>حفظ الكمية</Button></div>{product && product.variants.length > 1 ? <div className="space-y-2 rounded bg-muted/30 p-2"><label className="text-xs font-medium">استبدال المتغير</label><select className="h-10 w-full rounded border bg-background px-2" value={variantTargets[item.id] ?? ''} onChange={(event) => setVariantTargets((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">اختر البديل</option>{product.variants.filter((variant) => variant.id !== item.variantId).map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select><Input type="number" min={1} max={item.qty} value={replaceQty} onChange={(event) => setVariantQuantities((current) => ({ ...current, [item.id]: Math.max(1, Math.min(item.qty, Number(event.target.value) || 1)) }))} aria-label="كمية الاستبدال" /><p className="text-xs text-muted-foreground">{Math.max(0, replaceQty - (item.qty - item.preparedQty)) ? `قد ينتج هالك ${Math.max(0, replaceQty - (item.qty - item.preparedQty))}` : 'سيُستبدل من غير المحضر أولًا'}</p><Button size="sm" className="w-full" disabled={busy || !variantTargets[item.id]} onClick={() => void adjustSavedItem(selectedOrder, item, 'variant')}>تأكيد الاستبدال</Button></div> : null}</div> : <p className="text-xs text-destructive">تم تقديم جزء من السطر؛ يلزم مسار تصحيح مالي وتشغيلي مصرح.</p>}{item.servedQty === 0 && selectedOrder.items.length > 1 ? <Button size="sm" variant="destructive" disabled={busy} onClick={() => void cancelSavedItem(selectedOrder, item)}>إلغاء الصنف بالكامل</Button> : null}</div>})}</section> : null}<section className="space-y-2"><h3 className="font-semibold">التغييرات غير المحفوظة</h3>{pending.length ? pending.map((line) => { const product = workspace.products.find((candidate) => candidate.id === line.productId); return <div key={line.key} className="flex items-center justify-between gap-2 rounded border p-3"><span>{product?.name} × {line.qty}</span><Button size="icon" variant="ghost" className="text-destructive" onClick={() => setPending((current) => current.filter((candidate) => candidate.key !== line.key))}><Icon name="trash" size={15} /></Button></div> }) : <p className="text-sm text-muted-foreground">لا توجد تغييرات معلّقة.</p>}</section><div className="flex flex-wrap justify-end gap-2 border-t pt-3"><Button variant="outline" onClick={() => { setCartOpen(false); setModalOpen(true) }}>متابعة التعديل</Button><Button disabled={!hasDraft || busy} onClick={() => void save()}>حفظ وإرسال للمطبخ</Button></div></CardContent></Card></div> : null}
  </main>
}

function AddProductModal({ tableNumber, products, categories, pending, setPending, onClose }: { tableNumber: string; products: Product[]; categories: WaiterWorkspace['categories']; pending: PendingLine[]; setPending: React.Dispatch<React.SetStateAction<PendingLine[]>>; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [product, setProduct] = useState<Product | null>(null)
  const [variantId, setVariantId] = useState('')
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const filtered = products.filter((candidate) => candidate.isAvailable && (category === 'all' || candidate.categoryId === category) && candidate.name.toLowerCase().includes(search.trim().toLowerCase()))
  const variant = product?.variants.find((candidate) => candidate.id === variantId)
  const modifierPrice = product?.modifierGroups.flatMap((group) => group.options.filter((option) => (selections[group.id] ?? []).includes(option.id))).reduce((sum, option) => sum + Number(option.priceAdjustment), 0) ?? 0
  const ready = !!product && (!product.variants.length || !!variantId) && product.modifierGroups.every((group) => { const count = (selections[group.id] ?? []).length; return count >= (group.isRequired ? Math.max(1, group.minSelections) : group.minSelections) && count <= group.maxSelections })

  useEffect(() => { closeButton.current?.focus() }, [])
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape) }, [onClose])

  function choose(candidate: Product) { setProduct(candidate); setVariantId(''); setSelections({}); setQty(1); setNote('') }
  function toggle(groupId: string, optionId: string, max: number) { setSelections((current) => { const values = current[groupId] ?? []; const next = values.includes(optionId) ? values.filter((id) => id !== optionId) : max === 1 ? [optionId] : values.length < max ? [...values, optionId] : values; return { ...current, [groupId]: next } }) }

  return <div role="dialog" aria-modal="true" aria-labelledby="add-product-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-0 sm:p-4" dir="rtl">
    <Card className="flex h-dvh w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:rounded-lg">
      <CardHeader className="flex-row items-center justify-between border-b"><CardTitle id="add-product-title">إنشاء طلب — طاولة {tableNumber}</CardTitle><Button ref={closeButton} size="sm" variant="ghost" onClick={onClose}>إغلاق</Button></CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-4">
        {!product ? <><div className="grid gap-2 sm:grid-cols-[1fr_220px]"><Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف…" aria-label="بحث المنتجات" /><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded border bg-background px-3"><option value="all">كل الأقسام</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{filtered.map((candidate) => <button type="button" key={candidate.id} onClick={() => choose(candidate)} className="rounded-lg border p-3 text-right hover:border-primary hover:bg-primary/5"><span className="block font-medium">{candidate.name}</span><span className="text-sm text-primary">{candidate.variants.length ? 'اختر المتغير' : formatCurrency(Number(candidate.price))}</span></button>)}</div></> : <div className="space-y-4"><Button variant="ghost" size="sm" onClick={() => setProduct(null)}>رجوع للمنتجات</Button><div><h3 className="text-lg font-bold">{product.name}</h3><p className="text-sm text-muted-foreground">السعر المعروض تقديري، والخادم يعيد احتسابه عند الحفظ.</p></div>{product.variants.length ? <label className="block text-sm"><span className="mb-1 block font-medium">المتغير *</span><select value={variantId} onChange={(event) => setVariantId(event.target.value)} className="h-10 w-full rounded border bg-background px-3"><option value="">اختر المتغير</option>{product.variants.map((item) => <option key={item.id} value={item.id}>{item.label} — {formatCurrency(Number(item.price))}</option>)}</select></label> : null}{product.modifierGroups.map((group) => <fieldset key={group.id} className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">{group.name} {group.isRequired ? '*' : ''} ({group.minSelections}–{group.maxSelections})</legend><div className="grid gap-2 sm:grid-cols-2">{group.options.map((option) => <label key={option.id} className={cn('flex items-center justify-between gap-2 rounded border p-2', !option.isActive && 'opacity-50')}><span><input type={group.maxSelections === 1 ? 'radio' : 'checkbox'} name={`group-${group.id}`} checked={(selections[group.id] ?? []).includes(option.id)} disabled={!option.isActive} onChange={() => toggle(group.id, option.id, group.maxSelections)} /> <span>{option.label}</span></span><span className="text-xs">{Number(option.priceAdjustment) ? `+${formatCurrency(Number(option.priceAdjustment))}` : ''}</span></label>)}</div></fieldset>)}<div className="flex items-center gap-2"><Button size="icon" variant="outline" onClick={() => setQty((value) => Math.max(1, value - 1))}><Icon name="minus" size={14} /></Button><span className="w-8 text-center">{qty}</span><Button size="icon" variant="outline" onClick={() => setQty((value) => Math.min(20, value + 1))}><Icon name="plus" size={14} /></Button></div><Input value={note} maxLength={255} onChange={(event) => setNote(event.target.value)} placeholder="ملاحظات المطبخ (اختياري)" /><p className="font-bold">الإجمالي التقديري: {formatCurrency(((variant ? Number(variant.price) : Number(product.price)) + modifierPrice) * qty)}</p></div>}
      </CardContent>
      <div className="shrink-0 border-t bg-background p-3"><div className="mb-2 flex items-center justify-between text-sm"><span>مسودة الطلب: {pending.reduce((sum, line) => sum + line.qty, 0)} أصناف</span><Button variant="outline" size="sm" onClick={onClose}>مراجعة السلة</Button></div>{product ? <Button className="w-full" disabled={!ready} onClick={() => { setPending((current) => [...current, { key: crypto.randomUUID(), productId: product.id, variantId: variantId || undefined, modifierSelections: selections, qty, note }]); setProduct(null) }}>إضافة للطلب ومتابعة الاختيار</Button> : null}</div>
    </Card>
  </div>
}
