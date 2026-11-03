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

function ProductButton({ candidate, selected, alreadyQty, onChoose }: { candidate: Product; selected: boolean; alreadyQty: number; onChoose: () => void }) {
  const base = 'rounded-lg p-3 text-right transition-all'
  const cls = selected ? `${base} border-2 border-primary bg-primary/5 ring-1 ring-primary` : `${base} border border-muted hover:border-primary hover:bg-primary/5`
  return (
    <button type="button" onClick={onChoose} className={cls}>
      <div className="flex items-center justify-between mb-1">
        <span className="block font-medium">{candidate.name}</span>
        {selected && <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">×{alreadyQty}</span>}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-sm text-primary">{candidate.variants.length ? 'اختر المتغير' : formatCurrency(Number(candidate.price))}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onChoose() }} disabled={!candidate.isAvailable}><Icon name="plus" size={12} /></Button>
        </div>
      </div>
    </button>
  )
}

export function WaiterTableWorkspace({ workspace, table, initialOrderId }: { workspace: WaiterWorkspace; table: Table; initialOrderId?: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const orders = useMemo(() => workspace.openOrders.filter((order) => order.tableNumber === table.number && order.orderType === 'dine_in'), [table.number, workspace.openOrders])
  const activeOrders = orders.filter((order) => order.status !== 'cancelled' && order.paymentStatus !== 'paid')
  const editableOrder = activeOrders.find((order) => order.status === 'new' && !order.sentToKitchen && order.responsibleWaiterId === workspace.currentUserId) ?? null
  const [draftQuantities, setDraftQuantities] = useState<Record<string, number>>({})
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([])
  const [pending, setPending] = useState<PendingLine[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(Boolean(initialOrderId))
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId ?? null)
  const [quantityTargets, setQuantityTargets] = useState<Record<string, number>>({})
  const [variantTargets, setVariantTargets] = useState<Record<string, string>>({})
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [activeTab, setActiveTab] = useState<'pos' | 'orders' | 'reports'>('pos')
  const pendingQtyByProduct = useMemo(() => pending.reduce((acc, line) => { acc[line.productId] = (acc[line.productId] ?? 0) + line.qty; return acc }, {} as Record<string, number>), [pending])
  const filtered = workspace.products.filter((candidate) => candidate.isAvailable && (category === 'all' || candidate.categoryId === category) && candidate.name.toLowerCase().includes(search.trim().toLowerCase()))
  const requestKey = useRef(crypto.randomUUID())
  const draftKey = `skoon.waiter.table-draft:${workspace.currentUserId}:${workspace.branchId}:${table.id}`
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null

  const hasExistingDraft = !!removedItemIds.length || (editableOrder?.items.some((item) => (draftQuantities[item.id] ?? item.qty) !== item.qty || (draftNotes[item.id] ?? item.note ?? '') !== (item.note ?? '')) ?? false)
  const hasDraft = hasExistingDraft || pending.length > 0

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

  function choose(candidate: Product) {
    const existingQty = pendingQtyByProduct[candidate.id] ?? 0
    if (existingQty > 0) {
      setPending((current) => current.map((line) => line.productId === candidate.id ? { ...line, qty: line.qty + 1 } : line))
      return
    }
    // Simple product: add directly to pending with qty=1
    if (!candidate.variants.length && !candidate.modifierGroups.length) {
      setPending((current) => [...current, { key: crypto.randomUUID(), productId: candidate.id, variantId: undefined, modifierSelections: {}, qty: 1, note: '' }])
      return
    }
    // Complex product: open modal for variant/modifier selection
    setModalOpen(true)
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
        if (!response.ok) throw new Error(responseError(data, 'تعذر حفظ تعديلات الطلب؛ قد تكون بيانات الطلب تغيرت.'))
      }

      if (pending.length) {
        const targetOrder = editableOrder ?? orders[0]
        if (targetOrder) {
          const appendResponse = await fetch(`/api/staff/orders/${targetOrder.id}/items/append`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'idempotency-key': requestKey.current },
            body: JSON.stringify({
              items: pending.map((line) => ({
                productId: line.productId,
                variantId: line.variantId,
                modifierSelections: Object.entries(line.modifierSelections).map(([groupId, valueIds]) => ({ groupId, valueIds })),
                qty: line.qty,
                note: line.note.trim() || undefined,
              })),
              idempotencyKey: requestKey.current,
            }),
          })
          const appended: unknown = await appendResponse.json().catch(() => null)
          if (!appendResponse.ok) throw new Error(responseError(appended, 'تعذر إضافة الأصناف إلى الطلب الموجود.'))
        } else {
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

  return <main dir="rtl" className="min-h-dvh bg-background pb-32">
    <div className="mx-auto max-w-6xl space-y-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { if (!hasDraft || window.confirm('لديك تغييرات غير محفوظة. هل تريد المغادرة؟')) router.push('/waiter') }}>
            <Icon name="chevronRight" size={16} /> الطاولات
          </Button>
          <div><h1 className="text-2xl font-bold">الطاولة {table.number}</h1><p className="text-sm text-muted-foreground">{table.name ?? `السعة ${table.capacity}`} · {activeOrders.length ? `${activeOrders.length} طلب نشط` : 'فارغة'}</p></div>
        </div>
        <div className="flex items-center gap-2"><Badge tone={activeOrders.length ? 'warning' : 'success'}>{activeOrders.length ? 'مشغولة' : 'متاحة'}</Badge></div>
      </header>

      {/* Tab Navigation — at top */}
      <div className="flex gap-1 border-b border-border mb-4">
        <button
          onClick={() => setActiveTab('pos')}
          className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'pos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-muted-foreground hover:bg-muted/50'}`}
        >
          POS — إضافة أصناف
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'orders' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-muted-foreground hover:bg-muted/50'}`}
        >
          الطلبات المفتوحة
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'reports' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-muted-foreground hover:bg-muted/50'}`}
        >
          تقرير الطلبات
        </button>
      </div>

      {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{notice}</p> : null}

      {/* POS Tab */}
      {activeTab === 'pos' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <Input icon="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف…" aria-label="بحث المنتجات" />
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded border bg-background px-3">
              <option value="all">كل الأقسام</option>
              {workspace.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.length === 0 ? (
              <p className="col-span-full text-center text-muted-foreground py-8">لا توجد منتجات مطابقة للبحث أو التصنيف المحدد.</p>
            ) : (
              filtered.map((candidate) => {
                const alreadyQty = pendingQtyByProduct[candidate.id] ?? 0
                const selected = alreadyQty > 0
                return <ProductButton key={candidate.id} candidate={candidate} selected={selected} alreadyQty={alreadyQty} onChoose={() => choose(candidate)} />
              })
            )}
          </div>

          {pending.length ? <Card className="mt-4 border-primary/40"><CardHeader><CardTitle>إضافات لم تُرسل</CardTitle></CardHeader><CardContent className="space-y-2">{pending.map((line) => { const product = workspace.products.find((candidate) => candidate.id === line.productId); const variant = product?.variants.find((candidate) => candidate.id === line.variantId); return <div key={line.key} className="flex items-center justify-between gap-3 rounded border p-3"><div><p className="font-medium">{product?.name}</p><p className="text-xs text-muted-foreground">{variant?.label ?? ''}{line.note ? ` · ${line.note}` : ''}</p></div><div className="flex items-center gap-2"><span>× {line.qty}</span><Button size="icon" variant="ghost" className="text-destructive" onClick={() => setPending((current) => current.filter((candidate) => candidate.key !== line.key))}><Icon name="trash" size={15} /></Button></div></div>})}</CardContent></Card> : null}
        </>
      )}

      {/* Open Orders Tab */}
      {activeTab === 'orders' && (
        <section className="space-y-3">
          {activeOrders.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد طلبات نشطة على هذه الطاولة. يمكنك إضافة أصناف من تبويب POS لبدء طلب جديد.</CardContent></Card>
          ) : (
            activeOrders.map((order) => {
              const canEdit = editableOrder?.id === order.id
              return <Card key={order.id}>
                <details className="group">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <CardHeader className="flex-row items-center justify-between gap-3"><div className="min-w-0"><CardTitle>{order.number}</CardTitle><p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString('ar-EG')} · {order.responsibleWaiterName ?? 'غير مُعيّن'}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><Badge tone={order.status === 'ready' ? 'success' : order.status === 'preparing' ? 'warning' : 'info'}>{statusLabel(order.status)}</Badge><span className="text-xs font-semibold text-primary">{formatCurrency(order.total)}</span><span className="text-[11px] text-muted-foreground group-open:hidden">عرض التفاصيل</span><span className="hidden text-[11px] text-muted-foreground group-open:inline">إخفاء التفاصيل</span></div></CardHeader>
                </summary>
                <CardContent className="space-y-2 border-t pt-3">
                  {order.items.filter((item) => !removedItemIds.includes(item.id)).map((item) => <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium">{item.name}</p>{item.variantLabel ? <p className="text-xs text-primary">{item.variantLabel}</p> : null}{item.details.length ? <p className="text-xs text-muted-foreground">{item.details.join(' · ')}</p> : null}</div><div className="text-left text-sm"><p>{formatCurrency(item.unitPrice)} × {draftQuantities[item.id] ?? item.qty}</p><p className="font-semibold">{formatCurrency(item.unitPrice * (draftQuantities[item.id] ?? item.qty))}</p></div></div>
                    <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone="muted">{itemStatus(item)}</Badge>{canEdit ? <><Button size="icon" variant="outline" className="h-10 w-10" onClick={() => changeExisting(item, -1)} aria-label={`إنقاص ${item.name}`}><Icon name="minus" size={14} /></Button><span className="min-w-6 text-center">{draftQuantities[item.id] ?? item.qty}</span><Button size="icon" variant="outline" className="h-10 w-10" onClick={() => changeExisting(item, 1)} aria-label={`زيادة ${item.name}`}><Icon name="plus" size={14} /></Button><Input className="h-10 min-w-48 flex-1" maxLength={255} value={draftNotes[item.id] ?? item.note ?? ''} onChange={(event) => setDraftNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="ملاحظات المطبخ" />{editableOrder && editableOrder.items.length - removedItemIds.length > 1 ? <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setRemovedItemIds((current) => [...current, item.id])} aria-label={`إزالة ${item.name}`}><Icon name="trash" size={15} /></Button> : null}</> : <span className="text-xs text-muted-foreground">أُرسل للمطبخ؛ لا يمكن تغيير السطر دون إجراء الإلغاء المعتمد.</span>}</div>
                  </div>)}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm font-semibold"><span>إجمالي الطلب: {formatCurrency(order.total)}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setSelectedOrderId(order.id); setCartOpen(true) }}>عرض وتعديل الطلب</Button>{!order.sentToKitchen ? <Button size="sm" disabled={busy} onClick={() => void retryDispatch(order)}>إعادة الإرسال للمطبخ</Button> : null}</div></div>
                </CardContent>
                </details>
              </Card>
            })
          )}
        </section>
      )}

      {/* Order Reports Tab */}
      {activeTab === 'reports' && (
        <section className="space-y-3">
          <div className="rounded-lg border p-4">
            <CardHeader><CardTitle>تقرير الطلبات على الطاولة {table.number}</CardTitle><p className="text-xs text-muted-foreground mt-1">سجل جميع الطلبات على هذه الطاولة (المنفذة، الملغاة، والمدفوعة).</p></CardHeader>
            <CardContent className="mt-4">
              {orders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد طلبات مسجلة على هذه الطاولة حتى الآن.</p>
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 rounded border p-3 bg-muted/30">
                    <div className="min-w-0"><p className="font-medium">{order.number}</p><p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString('ar-EG')} · {statusLabel(order.status)}</p></div>
                    <div className="flex items-center gap-2 text-right"><span className="text-xs font-semibold text-primary">{formatCurrency(order.total)}</span><Badge tone={order.paymentStatus === 'paid' ? 'success' : order.status === 'cancelled' ? 'destructive' : 'muted'}>{order.paymentStatus === 'paid' ? 'مدفوع' : order.status === 'cancelled' ? 'ملغي' : 'غير مدفوع'}</Badge></div>
                  </div>)}
                </div>
              )}
            </CardContent>
          </div>
        </section>
      )}
    </div>

    {/* Global cart button — always visible */}
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur"><div className="mx-auto flex max-w-6xl gap-2"><Button variant="outline" className="flex-1" onClick={() => setCartOpen(true)}><Icon name="cart" size={16} /> سلة الطلب — طاولة {table.number}</Button><Button className="flex-[2]" disabled={!hasDraft || busy} onClick={() => void save()} title={!hasDraft ? 'لا توجد تغييرات غير محفوظة للحفظ' : busy ? 'جارٍ الحفظ…' : 'حفظ المسودات وإرسال التغييرات للمطبخ'}>{busy ? 'جارٍ الحفظ…' : 'حفظ وإرسال التغييرات للمطبخ'}</Button></div></div>
    {modalOpen ? <AddProductModal tableNumber={table.number} products={workspace.products} categories={workspace.categories} pending={pending} setPending={setPending} onClose={() => setModalOpen(false)} /> : null}
    {cartOpen ? <div role="dialog" aria-modal="true" aria-label="سلة الطلب" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-2 sm:p-4" dir="rtl"><Card className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden"><CardHeader className="flex-row items-center justify-between border-b"><div><CardTitle>سلة الطلب — طاولة {table.number}</CardTitle><p className="text-xs text-muted-foreground">{selectedOrder ? selectedOrder.number : 'طلب جديد'}</p></div><Button variant="ghost" size="sm" onClick={() => setCartOpen(false)}>إغلاق</Button></CardHeader><CardContent className="min-h-0 space-y-3 overflow-y-auto p-4">{selectedOrder ? <section className="space-y-2"><h3 className="font-semibold">الأصناف المحفوظة</h3>{selectedOrder.items.map((item) => { const product = workspace.products.find((candidate) => candidate.id === item.productId); const target = quantityTargets[item.id] ?? item.qty; const replaceQty = variantQuantities[item.id] ?? item.qty; return <div key={item.id} className="space-y-3 rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.variantLabel ?? ''}{item.details.length ? ` · ${item.details.join(' · ')}` : ''} · {itemStatus(item)}</p><p className="text-xs">الأصلية: {item.qty} · المحضرة: {item.preparedQty} · المقدمة: {item.servedQty}</p></div><span>{formatCurrency(item.unitPrice)} × {item.qty}</span></div>{item.servedQty === 0 ? <div className="grid gap-2 border-t pt-3 sm:grid-cols-2"><div className="space-y-2 rounded bg-muted/30 p-2"><label className="text-xs font-medium">الكمية المطلوبة</label><Input type="number" min={1} max={99} value={target} onChange={(event) => setQuantityTargets((current) => ({ ...current, [item.id]: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))} /><p className="text-xs text-muted-foreground">{target < item.preparedQty ? `سيُسجل هالك ${item.preparedQty - target} وحدات` : ''}</p></div></div> : null}</div>})}</section> : null}</CardContent></Card></div> : null}
    {modalOpen ? <AddProductModal tableNumber={table.number} products={workspace.products} categories={workspace.categories} pending={pending} setPending={setPending} onClose={() => setModalOpen(false)} /> : null}
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

  const pendingQtyByProduct = useMemo(() => pending.reduce((acc, line) => { acc[line.productId] = (acc[line.productId] ?? 0) + line.qty; return acc }, {} as Record<string, number>), [pending])

  const filtered = products.filter((candidate) => candidate.isAvailable && (category === 'all' || candidate.categoryId === category) && candidate.name.toLowerCase().includes(search.trim().toLowerCase()))
  const variant = product?.variants.find((candidate) => candidate.id === variantId)
  const modifierPrice = product?.modifierGroups.flatMap((group) => group.options.filter((option) => (selections[group.id] ?? []).includes(option.id))).reduce((sum, option) => sum + Number(option.priceAdjustment), 0) ?? 0
  const ready = !!product && (!product.variants.length || !!variantId) && product.modifierGroups.every((group) => { const count = (selections[group.id] ?? []).length; return count >= (group.isRequired ? Math.max(1, group.minSelections) : group.minSelections) && count <= group.maxSelections })

  useEffect(() => { closeButton.current?.focus() }, [])
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape) }, [onClose])

  function choose(candidate: Product) {
    const existingQty = pendingQtyByProduct[candidate.id] ?? 0
    if (existingQty > 0) {
      setPending((current) => current.map((line) => line.productId === candidate.id ? { ...line, qty: line.qty + 1 } : line))
      return
    }
    setProduct(candidate)
    setVariantId('')
    setSelections({})
    setQty(1)
    setNote('')
  }
  function toggle(groupId: string, optionId: string, max: number) { setSelections((current) => { const values = current[groupId] ?? []; const next = values.includes(optionId) ? values.filter((id) => id !== optionId) : max === 1 ? [optionId] : values.length < max ? [...values, optionId] : values; return { ...current, [groupId]: next } }) }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="add-product-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-0 sm:p-4" dir="rtl">
      <Card className="flex h-dvh w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:rounded-lg">
        <CardHeader className="flex-row items-center justify-between border-b"><CardTitle id="add-product-title">إنشاء طلب — طاولة {tableNumber}</CardTitle><Button ref={closeButton} size="sm" variant="ghost" onClick={onClose}>إغلاق</Button></CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-4">
          {!product ? (
            <>
              <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
                <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف…" aria-label="بحث المنتجات" />
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded border bg-background px-3">
                  <option value="all">كل الأقسام</option>
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((candidate) => {
                  const alreadyQty = pendingQtyByProduct[candidate.id] ?? 0
                  const selected = alreadyQty > 0
                  return (
                    <ProductButton key={candidate.id} candidate={candidate} selected={selected} alreadyQty={alreadyQty} onChoose={() => choose(candidate)} />
                  )
                })}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setProduct(null)}>رجوع للمنتجات</Button>
              <div>
                <h3 className="text-lg font-bold">{product.name}</h3>
                <p className="text-sm text-muted-foreground">السعر المعروض تقديري، والخادم يعيد احتسابه عند الحفظ.</p>
              </div>
              {product.variants.length ? (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">المتغير *</span>
                  <select value={variantId} onChange={(event) => setVariantId(event.target.value)} className="h-10 w-full rounded border bg-background px-3">
                    <option value="">اختر المتغير</option>
                    {product.variants.map((item) => <option key={item.id} value={item.id}>{item.label} — {formatCurrency(Number(item.price))}</option>)}
                  </select>
                </label>
              ) : null}
              {product.modifierGroups.map((group) => (
                <fieldset key={group.id} className="rounded-lg border p-3">
                  <legend className="px-1 text-sm font-semibold">{group.name} {group.isRequired ? '*' : ''} ({group.minSelections}–{group.maxSelections})</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.options.map((option) => (
                      <label key={option.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={(selections[group.id] ?? []).includes(option.id)} onChange={() => toggle(group.id, option.id, group.maxSelections)} className="rounded border-primary" />
                        <span className="text-sm">{option.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{Number(option.priceAdjustment) > 0 ? '+' + formatCurrency(Number(option.priceAdjustment)) : ''}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="mt-3 flex items-center justify-between gap-2">
                <label className="text-sm font-medium">ملاحظات المطبخ</label>
                <Input className="flex-1" maxLength={255} value={note} onChange={(event) => setNote(event.target.value)} placeholder="ملاحظات للمطبخ" />
              </div>
              <div className="mt-2 text-right">
                <label className="text-xs font-medium">الكمية</label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setQty((q) => Math.max(1, q - 1))}>-</Button>
                  <span className="w-8 text-center font-semibold">{qty}</span>
                  <Button variant="outline" size="sm" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <div className="shrink-0 border-t bg-background p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>مسودة الطلب: {pending.reduce((sum, line) => sum + line.qty, 0)} أصناف</span>
            <Button variant="outline" size="sm" onClick={onClose}>مراجعة السلة</Button>
          </div>
          {product ? (
            <Button className="w-full" disabled={!ready} onClick={() => { setPending((current) => [...current, { key: crypto.randomUUID(), productId: product.id, variantId: variantId || undefined, modifierSelections: selections, qty, note }]); setProduct(null) }}>إضافة للطلب ومتابعة الاختيار</Button>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
