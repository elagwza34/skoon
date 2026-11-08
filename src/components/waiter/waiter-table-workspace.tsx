'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'
import type { WaiterWorkspace } from '@/lib/staff-waiter'
import { isActiveTableOrder, canManageTableOrder, mayAppendToOrder } from '@/lib/table-order-policy'
import type { InvoiceRow } from '@/lib/staff-invoices'
import { parseOrderItemQuantity } from '@/lib/order-item-quantity'
import gsap from 'gsap'

type Product = WaiterWorkspace['products'][number]
type Order = WaiterWorkspace['openOrders'][number]
type Table = WaiterWorkspace['tables'][number]

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

function ProductButton({ candidate, selected, alreadyQty, onChoose, onClick }: { candidate: Product; selected: boolean; alreadyQty: number; onChoose: (clientX: number, clientY: number) => void; onClick?: (e: React.MouseEvent) => void }) {
  const base = 'rounded-lg p-3 text-right transition-all'
  const cls = selected ? `${base} border-2 border-primary bg-primary/5 ring-1 ring-primary` : `${base} border border-muted hover:border-primary hover:bg-primary/5`
  return (
    <button type="button" onClick={e => { onClick?.(e); onChoose(e.clientX, e.clientY) }} disabled={!candidate.isAvailable} className={cls}>
      <div className="flex items-center justify-between mb-1">
        <span className="block font-medium">{candidate.name}</span>
        {selected && <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">×{alreadyQty}</span>}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-sm text-primary">{candidate.variants.length ? 'اختر المتغير' : formatCurrency(Number(candidate.price))}</span>
        <div className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border"><Icon name="plus" size={12} /></span>
        </div>
      </div>
    </button>
  )
}

export function WaiterTableWorkspace({ workspace, table, invoices = [] }: { workspace: WaiterWorkspace; table: Table; initialOrderId?: string; invoices?: InvoiceRow[] }) {
  const router = useRouter()
  const role = workspace.currentRole ?? 'waiter'
  const order = workspace.openOrders.find((candidate) => candidate.tableId === table.id && isActiveTableOrder(candidate)) ?? null
  const canManage = order ? canManageTableOrder(role, workspace.currentUserId, order.responsibleWaiterId) : table.openOrders === 0
  const canAppend = order ? mayAppendToOrder(order.status, order.paymentStatus) : true
  const isReadOnly = role === 'cashier'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'order' | 'pos'>('order')
  const [readyAlertPlayed, setReadyAlertPlayed] = useState<Set<string>>(new Set())
  const [reassignWaiterId, setReassignWaiterId] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [reassignBusy, setReassignBusy] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [posModalOpen, setPosModalOpen] = useState(false)
  const inFlight = useRef(false)
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const createdOrder = useRef<string | null>(null)
  const mode = order ? 'ADD_ITEMS' : 'CREATE_ORDER'
  const home = role === 'cashier' ? '/cashier' : '/waiter'
  const identity = order?.id ?? 'new'
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/audio/ready-alert.mp3')
      audioRef.current.volume = 0.8
    }
  }, [])

  useEffect(() => {
    if (!order) return
    order.items.forEach((item) => {
      const isReady = item.preparedQty >= item.qty && item.preparedQty > 0
      const alreadyPlayed = readyAlertPlayed.has(item.id)
      if (isReady && !alreadyPlayed && role === 'waiter') {
        audioRef.current?.play().catch(() => {})
        setReadyAlertPlayed((prev) => new Set([...prev, item.id]))
      }
    })
  }, [order, role, readyAlertPlayed])

  async function request(url: string, payload?: unknown, key?: string, method: 'POST' | 'DELETE' = 'POST') {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, ...(payload === undefined || method === 'DELETE' ? {} : { body: JSON.stringify(payload) }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ العملية؛ حدّث حالة الطاولة')
    return data
  }
  async function act(work: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try { await work(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تنفيذ العملية'); router.refresh() }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function edit(item: Order['items'][number], cancel: boolean) {
    if (inFlight.current || !order || !canManage || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly) return
    const reason = window.prompt('سبب التعديل أو الإلغاء (3 أحرف على الأقل)')?.trim()
    if (!reason || reason.length < 3) return
    const key = crypto.randomUUID()
    if (cancel) {
      if (!window.confirm('إلغاء الصنف مع تسجيل أثر الحجز والهالك حسب التحضير؟')) return
      await act(async () => { await request(`/api/staff/orders/${order.id}/items/${item.id}/void`, { reason, expectedUpdatedAt: item.updatedAt, idempotencyKey: key }, key) })
    } else {
      const raw = window.prompt('الكمية الجديدة؛ الزيادة تُنشئ سطرًا جديدًا مستقلًا', String(item.qty))
      if (raw === null) return
      const parsed = parseOrderItemQuantity(raw)
      if (parsed.error) { setError(parsed.error); return }
      await act(async () => { await request(`/api/staff/orders/${order.id}/items/${item.id}/adjust`, { action: 'quantity', targetQuantity: parsed.quantity, reason, expectedUpdatedAt: item.updatedAt, idempotencyKey: key }, key) })
    }
  }
  async function quickQty(item: Order['items'][number], delta: number) {
    if (inFlight.current || !order || !canManage || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly) return
    const raw = window.prompt('الكمية الجديدة للصنف', String(Math.max(1, item.qty + delta)))
    if (raw === null) return
    const parsed = parseOrderItemQuantity(raw)
    if (parsed.error) { setError(parsed.error); return }
    await act(async () => { await request(`/api/staff/orders/${order.id}/items/${item.id}/adjust`, { action: 'quantity', targetQuantity: parsed.quantity, reason: 'تعديل كمي سريع', expectedUpdatedAt: item.updatedAt, idempotencyKey: crypto.randomUUID() }, crypto.randomUUID()) })
  }
  async function adjustQty(item: Order['items'][number], delta: number) {
    if (inFlight.current || !order || !canManage || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly) return
    const target = Math.max(1, item.qty + delta)
    const key = crypto.randomUUID()
    await act(async () => { await request(`/api/staff/orders/${order.id}/items/${item.id}/adjust`, { action: 'quantity', targetQuantity: target, reason: 'تعديل كمي', expectedUpdatedAt: item.updatedAt, idempotencyKey: key }, key) })
  }
  async function sendToKitchen() {
    if (!order || !canManage || inFlight.current || isReadOnly) return
    await act(async () => { await request(`/api/staff/orders/${order.id}/send`); setNotice('تم إرسال الطلب للمطبخ') })
  }

  async function reassignResponsibility() {
    if (inFlight.current || !order || !canManage || isReadOnly) return
    if (!reassignWaiterId.trim() || !reassignReason.trim()) {
      setError('معرف النادل الجديد والسبب مطلوبان')
      return
    }
    await act(async () => {
      await request(`/api/staff/orders/${order.id}/waiter`, {
        action: 'reassign',
        waiterId: reassignWaiterId.trim(),
        reason: reassignReason.trim()
      })
      setReassignWaiterId('')
      setReassignReason('')
      setNotice('تم إعادة توزيع المسؤولية بنجاح')
    })
  }

  async function deleteOrder() {
    if (inFlight.current || !order || !canManage || isReadOnly) return
    if (!window.confirm('تأكيد حذف الطلب نهائياً؟ سيتم إرجاع حجوزات المخزون ولا يمكن استعادة الطلب بعد الحذف.')) return
    await act(async () => {
      await request(`/api/staff/orders/${order.id}/delete`, undefined, undefined, 'DELETE')
      setNotice('تم حذف الطلب وإرجاع حجوزات المخزون')
      setTab('order')
      router.refresh()
    })
  }

  const categories = workspace.categories
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [product, setProduct] = useState<Product | null>(null)
  const [variantId, setVariantId] = useState('')
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  const [cartItems, setCartItems] = useState<Record<string, { productId: string; productName: string; variantId?: string; variantLabel?: string; modifierSelections: Record<string, string[]>; qty: number; note?: string }>>({})
  const [cartModalOpen, setCartModalOpen] = useState(false)
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null)
  const cartRef = useRef<HTMLButtonElement>(null)
  const flyRef = useRef<HTMLDivElement>(null)

  const cartCount = useMemo(() => Object.values(cartItems).reduce((sum, line) => sum + line.qty, 0), [cartItems])
  const cartTotal = useMemo(() => Object.values(cartItems).reduce((sum, line) => {
    const p = workspace.products.find((candidate) => candidate.id === line.productId)
    const base = Number(p?.price ?? 0) * line.qty
    return sum + base
  }, 0), [cartItems, workspace.products])

  function cartKey(line: { productId: string; productName: string; variantId?: string; variantLabel?: string; modifierSelections: Record<string, string[]>; qty: number; note?: string }) {
    return `${line.productId}:${line.variantId ?? ''}:${JSON.stringify(Object.entries(line.modifierSelections).sort())}`
  }

  function addToCart(line: { productId: string; productName: string; variantId?: string; variantLabel?: string; modifierSelections: Record<string, string[]>; qty: number; note?: string }, fromX: number, fromY: number) {
    const key = `${line.productId}:${line.variantId ?? ''}:${JSON.stringify(Object.entries(line.modifierSelections).sort())}`
    setCartItems(prev => {
      const existing = prev[key]
      if (existing) {
        return { ...prev, [key]: { ...existing, qty: existing.qty + line.qty } }
      }
      return { ...prev, [key]: line }
    })
    const cartRect = cartRef.current?.getBoundingClientRect()
    if (cartRect && fromX && fromY) {
      setFly({ x: fromX, y: fromY })
      requestAnimationFrame(() => {
        if (flyRef.current) {
          gsap.fromTo(flyRef.current, { x: 0, y: 0, scale: 1, opacity: 1 }, {
            x: cartRect.left - fromX + 12,
            y: cartRect.top - fromY + 8,
            scale: 0.2,
            opacity: 0.8,
            duration: 0.55,
            ease: 'power2.inOut',
            onComplete: () => setFly(null)
          })
        } else {
          setFly(null)
        }
      })
    }
  }

  const filtered = productsFilter(workspace.products, search, category)
  const variant = product?.variants.find((candidate) => candidate.id === variantId)
  const modifierPrice = product?.modifierGroups.flatMap((group) => group.options.filter((option) => (selections[group.id] ?? []).includes(option.id))).reduce((sum, option) => sum + Number(option.priceAdjustment), 0) ?? 0
  const ready = !!product && (!product.variants.length || !!variantId) && product.modifierGroups.every((group) => { const count = (selections[group.id] ?? []).length; return count >= (group.isRequired ? Math.max(1, group.minSelections) : group.minSelections) && count <= group.maxSelections })

  function choose(candidate: Product, clientX: number, clientY: number) {
    if (!candidate.variants.length) {
      addToCart({
        productId: candidate.id,
        productName: candidate.name,
        variantId: undefined,
        variantLabel: undefined,
        modifierSelections: {},
        qty: 1,
        note: ''
      }, clientX, clientY)
      return
    }
    setProduct(candidate)
    setVariantId('')
    setSelections({})
    setQty(1)
    setNote('')
  }
  function toggle(groupId: string, optionId: string, max: number) { setSelections((current) => { const values = current[groupId] ?? []; const next = values.includes(optionId) ? values.filter((id) => id !== optionId) : max === 1 ? [optionId] : values.length < max ? [...values, optionId] : values; return { ...current, [groupId]: next } }) }

  function addDirectlyToOrder() {
    if (!product || !canManage || !canAppend || isReadOnly) return
    const line = {
      productId: product.id,
      productName: product.name,
      variantId: variantId || undefined,
      variantLabel: variant?.label,
      modifierSelections: selections,
      qty,
      note: note.trim() || undefined
    }
    addToCart(line, 0, 0)
    setProduct(null)
    setSelections({})
    setQty(1)
    setNote('')
    setNotice('تم إضافة الصنف إلى سلة الطلب')
  }
  function productsFilter(products: Product[], s: string, cat: string) {
    return products.filter((candidate) => candidate.isAvailable && (cat === 'all' || candidate.categoryId === cat) && candidate.name.toLowerCase().includes(s.trim().toLowerCase()))
  }

  return (
    <main dir="rtl" className="min-h-dvh bg-background p-3 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-xl border p-4 space-y-3">
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => router.push(home)}>الطاولات</Button>
              </div>
              <h1 className="text-2xl font-bold">طاولة {table.number} {table.name}</h1>
            </div>
            <Badge tone={table.openOrders ? 'warning' : 'success'}>{table.openOrders ? 'مشغولة' : 'متاحة'}</Badge>
          </div>
          {order ? (
            <>
              <p className="text-sm text-muted-foreground">طلب {order.number} · {statusLabel(order.status)} · أنشأه {order.creatorName ?? 'غير محدد'} · {new Date(order.createdAt).toLocaleString('ar-EG')}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {!order.sentToKitchen && canManage && !isReadOnly && <Button size="sm" disabled={busy} onClick={sendToKitchen}>إرسال للمطبخ</Button>}
                {role === 'cashier' && !isReadOnly && <Button variant="outline" size="sm" onClick={() => setTab('order')}>الانتقال للدفع</Button>}
                <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => setTab('order')}>سجل الطلب</Button>
                <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => setTab('order')}>تقدم المطبخ</Button>
                <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => setInvoiceModalOpen(true)}>عرض الفاتورة</Button>
              </div>
            </>
          ) : (
            <p>{table.openOrders ? 'الطاولة مشغولة بطلب لا تملك صلاحية إدارته؛ لا يمكن إنشاء طلب آخر.' : 'لا يوجد طلب على الطاولة. استخدم نقطة البيع لبدء طلب جديد.'}</p>
          )}
        </header>

        {error && <p role="alert" className="rounded border border-destructive p-3">{error}</p>}
        {notice && <p role="status" className="rounded border border-success bg-success/10 p-3">{notice}</p>}

        <nav aria-label="إجراءات الطاولة" className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy || !!createdOrder.current || !canManage || (isReadOnly && tab === 'pos')}
            onClick={() => setTab('pos')}
            className={tab === 'pos' ? 'bg-primary text-primary-foreground' : ''}
          >
            pos
          </Button>
          <Button variant="outline" disabled={isReadOnly} onClick={() => setTab('order')} className={tab === 'order' ? 'bg-primary/10 border-primary' : ''}>الطلب الجاري</Button>
          <Button ref={cartRef} className="mr-auto bg-amber-600 text-white hover:bg-amber-700" size="sm" onClick={() => setCartModalOpen(true)} disabled={isReadOnly}>
            تفاصيل السلة
            {cartCount > 0 && <span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-amber-700">{cartCount}</span>}
          </Button>
        </nav>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0 order-1">
          {tab === 'order' && order && <section className="space-y-3">
          <h2 className="font-bold">الأصناف في الطلب {order.number}</h2>
          {order.items.length === 0 && <p className="text-muted-foreground">لا توجد أصناف بعد.</p>}
          {order.items.map((item) => (
            <Card key={item.id} className="hover:border-primary/50 transition-border">
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap justify-between gap-2 items-start">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-base">{item.name}</h2>
                    {item.variantLabel && <p className="text-sm text-muted-foreground">{item.variantLabel}</p>}
                    {item.details.length && <p className="text-sm text-muted-foreground">{item.details.join(' · ')}</p>}
                    {item.note && <p className="text-sm text-muted-foreground">ملاحظة: {item.note}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{item.qty} × {formatCurrency(item.unitPrice)}</p>
                    <p className="text-sm text-muted-foreground">{formatCurrency(item.lineTotal ?? item.unitPrice * item.qty)}</p>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${item.servedQty >= item.qty ? 'bg-green/10 text-green' : item.preparedQty >= item.qty ? 'bg-blue/10 text-blue' : item.preparationStartedAt ? 'bg-amber/10 text-amber' : 'bg-primary/10 text-primary'}`}>{itemStatus(item)}</span>
                    <p className="text-xs text-muted-foreground mt-1">جاهز {item.preparedQty}/{item.qty} · مقدم {item.servedQty}/{item.qty}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={busy || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly} onClick={() => void adjustQty(item, 1)}>+</Button>
                  <Button variant="outline" size="sm" disabled={busy || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly || item.qty <= 1} onClick={() => void adjustQty(item, -1)}>−</Button>
                  <Button variant="outline" size="sm" disabled={busy || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly} onClick={() => void edit(item, true)}>حذف الصنف</Button>
                  <Button variant="outline" size="sm" disabled={busy || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly} onClick={() => void quickQty(item, 0)}>تعديل الكمية</Button>
                  {item.servedQty > 0 && <p className="text-sm text-muted-foreground">صنف مقدم؛ التصحيح المالي عبر المسار المصرح فقط.</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>}

        {tab === 'order' && !order && <div className="rounded-xl border p-8 text-center">
          <p className="text-muted-foreground">لا يوجد طلب نشط على هذه الطاولة.</p>
          <Button disabled={isReadOnly || !canManage || !canAppend} onClick={() => setTab('pos')}>بدء طلب جديد عبر نقطة البيع</Button>
        </div>}

        {tab === 'order' && <section className="rounded border p-4 space-y-2">
          <h2 className="font-bold">سجل حالات الطلب الحالي</h2>
          {order?.history?.map((entry, index) => <p key={index} className="text-sm">{new Date(entry.at).toLocaleString('ar-EG')} · {statusLabel(entry.status)} · {entry.note}</p>)}
          {!order && <p className="text-muted-foreground">لا يوجد سجل للطلب.</p>}
        </section>}

        {tab === 'order' && order && <section className="rounded border p-4 space-y-2">
          <h2 className="font-bold">تقدم المطبخ</h2>
          {order.items.map((item) => (
            <p key={item.id} className="text-sm">{item.name} — {itemStatus(item)} ({item.preparedQty}/{item.qty} جاهز، {item.servedQty}/{item.qty} مقدم)</p>
          ))}
          {!order.items.length && <p className="text-muted-foreground">لا توجد أصناف للمتابعة.</p>}
        </section>}

        {tab === 'order' && order && role === 'manager' && <section className="rounded border p-4 space-y-2">
          <h2 className="font-bold">إعادة توزيع المسؤولية</h2>
          <p className="text-sm text-muted-foreground">النادل المسؤول الحالي: {order.responsibleWaiterId ?? 'غير محدد'}</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Input value={reassignWaiterId} onChange={(e) => setReassignWaiterId(e.target.value)} placeholder="معرف النادل الجديد" className="w-48 sm:w-64" />
            <Input value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} placeholder="سبب إعادة التوزيع" className="w-48 sm:w-64" />
            <Button size="sm" disabled={reassignBusy || !reassignWaiterId.trim() || !reassignReason.trim()} onClick={reassignResponsibility}>إعادة التوزيع</Button>
          </div>
          {reassignBusy && <p className="text-xs text-muted-foreground mt-1">جارٍ إعادة التوزيع…</p>}
          <p className="text-xs text-muted-foreground mt-2">يplat تتطلب نادلاً في نفس الفرع مع وردية نشطة</p>
        </section>}

        {tab === 'order' && order && order.paymentStatus !== 'paid' && order.items.every((item) => item.servedQty === 0 && !item.preparationStartedAt) && !isReadOnly && <section className="rounded border border-destructive/20 bg-destructive/5 p-4 space-y-3">
          <h2 className="font-bold text-destructive">حذف الطلب نهائياً</h2>
          <p className="text-sm text-destructive/70">سيتم إرجاع حجوزات المخزون للمخزون ولا يمكن استعادة الطلب بعد الحذف.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="سبب الحذف (اختياري)" className="w-48 sm:w-64" />
            <Button size="sm" variant="destructive" disabled={deleteBusy} onClick={deleteOrder}>احذف الطلب نهائياً</Button>
          </div>
          {deleteBusy && <p className="text-xs text-destructive mt-1">جارٍ الحذف…</p>}
          <p className="text-xs text-destructive/60 mt-2">لا يمكن حذف طلب مدفوع أو طلب يحتوي أصنافاً جاهزة أو تحت التحضير.</p>
        </section>}

        {tab === 'pos' && <section className="space-y-4">
          <h2 className="font-bold">نقطة البيع — طاولة {table.number}</h2>
          {isReadOnly && <div className="rounded border border-muted p-3 bg-muted/50">
            <p className="text-sm text-muted-foreground">عرض فقط — الكاشير لا يمكنه إضافة أو تعديل الأصناف من مساحة الطاولة.</p>
          </div>}
          {!isReadOnly && (
            <>
              <div className="flex flex-wrap gap-2 items-start mb-4">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن صنف…" aria-label="بحث المنتجات" className="min-w-[220px]" />
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded border bg-background px-3 min-w-[180px]">
                  <option value="all">كل الأقسام</option>
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((candidate) => (
                  <ProductButton key={candidate.id} candidate={candidate} selected={false} alreadyQty={0} onChoose={(clientX, clientY) => { choose(candidate, clientX, clientY); if (candidate.variants.length) setPosModalOpen(true) }} />
                ))}
              </div>
            </>
          )}
        </section>}
        </div>
      </div>

      {/* موديل تفاصيل الفاتورة */}
      {invoiceModalOpen && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setInvoiceModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-border">
            <div className="flex items-center justify-between p-4 border-b bg-cafe-espresso text-cafe-cream">
              <h2 className="text-lg font-bold">تفاصيل الفاتورة #{order.number}</h2>
              <Button size="icon" variant="ghost" onClick={() => setInvoiceModalOpen(false)}>
                <Icon name="close" size={18} className="text-cafe-cream" />
              </Button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">رقم الطاولة</p>
                  <p className="font-semibold">طاولة {table.number} {table.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">حالة الطلب</p>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${order.sentToKitchen ? 'bg-blue/10 text-blue' : 'bg-primary/10 text-primary'}`}>
                    {statusLabel(order.status)}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">النادل المسؤول</p>
                  <p className="font-semibold">{order.creatorName ?? 'غير محدد'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">تاريخ الإنشاء</p>
                  <p className="font-semibold">{new Date(order.createdAt).toLocaleString('ar-EG')}</p>
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold mb-2">الأصناف ({order.items.reduce((sum, i) => sum + i.qty, 0)} صنف)</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 p-2 rounded border">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {item.variantLabel && <p className="text-xs text-muted-foreground">{item.variantLabel}</p>}
                        {item.note && <p className="text-xs text-muted-foreground">ملاحظة: {item.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">{item.qty} × {formatCurrency(item.unitPrice)}</p>
                        <p className="text-xs">{formatCurrency(item.lineTotal ?? item.unitPrice * item.qty)}</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${item.servedQty >= item.qty ? 'bg-green/10 text-green' : item.preparedQty >= item.qty ? 'bg-blue/10 text-blue' : item.preparationStartedAt ? 'bg-amber/10 text-amber' : 'bg-primary/10 text-primary'}`}>
                          {itemStatus(item)}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">جاهز {item.preparedQty}/{item.qty} · مقدم {item.servedQty}/{item.qty}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-lg">الإجمالي</p>
                  <p className="font-bold text-lg text-cafe-espresso">{formatCurrency(order.total)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">المدفوع</p>
                  <p className="font-semibold">{formatCurrency(order.paidAmount ?? 0)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">المتبقي</p>
                  <p className="font-semibold text-cafe-espresso">{formatCurrency(order.remainingAmount ?? order.total)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* موديل تفاصيل منتج نقطة البيع */}
      {posModalOpen && product && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setPosModalOpen(false); setProduct(null); setSelections({}); setQty(1); setNote('') }} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-border">
            <div className="flex items-center justify-between p-4 border-b bg-cafe-espresso text-cafe-cream">
              <h2 className="text-lg font-bold">تفاصيل الصنف — {product.name}</h2>
              <Button size="icon" variant="ghost" onClick={() => { setPosModalOpen(false); setProduct(null); setSelections({}); setQty(1); setNote('') }}>
                <Icon name="close" size={18} className="text-cafe-cream" />
              </Button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-sm text-muted-foreground">السعر المعروض تقديري، والخادم يعيد احتسابه عند الحفظ.</p>
              {product.variants.length > 0 && (
                <fieldset className="rounded-lg border border-amber-300 bg-amber-50/40 p-3">
                  <legend className="px-1 text-sm font-semibold text-amber-900">المتغير (مطلوب) *</legend>
                  <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="mt-1 h-10 w-full rounded border border-amber-300 bg-white px-3 text-foreground">
                    <option value="">اختر المتغير / اللون</option>
                    {product.variants.map((item) => <option key={item.id} value={item.id}>{item.label} — {formatCurrency(Number(item.price))}</option>)}
                  </select>
                </fieldset>
              )}
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
                <Input className="flex-1" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات للمطبخ" />
              </div>
              <div className="mt-3 text-right">
                <label className="text-xs font-medium block mb-1">الكمية</label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setQty((q) => Math.max(1, q - 1))}>-</Button>
                  <span className="w-8 text-center font-semibold">{qty}</span>
                  <Button variant="outline" size="sm" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</Button>
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setPosModalOpen(false); setProduct(null); setSelections({}); setQty(1); setNote('') }}>إلغاء</Button>
              <Button className="w-auto bg-amber-600 text-white hover:bg-amber-700" disabled={!ready || busy || isReadOnly || !canManage || !canAppend} onClick={() => {
                if (!product) return
                addToCart({
                  productId: product.id,
                  productName: product.name,
                  variantId: variantId || undefined,
                  variantLabel: variant?.label,
                  modifierSelections: selections,
                  qty,
                  note: note.trim() || undefined
                }, 0, 0)
                setPosModalOpen(false)
                setProduct(null)
                setSelections({})
                setQty(1)
                setNote('')
                setNotice('تم إضافة الصنف إلى سلة الطلب')
              }}>
                إضافة للسلة
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* موديل تفاصيل السلة */}
      {cartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-border">
            <div className="flex items-center justify-between p-4 border-b bg-amber-600 text-white">
              <h2 className="text-lg font-bold">تفاصيل السلة ({cartCount} صنف)</h2>
              <Button size="icon" variant="ghost" className="text-white hover:bg-amber-700" onClick={() => setCartModalOpen(false)}>
                <Icon name="close" size={18} />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {Object.keys(cartItems).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">السلة فارغة.</p>
              ) : Object.entries(cartItems).map(([key, line]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{line.productName}</p>
                    {line.variantLabel && <p className="text-xs text-muted-foreground">{line.variantLabel}</p>}
                    {line.note && <p className="text-xs text-muted-foreground">ملاحظة: {line.note}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCartItems(prev => {
                      const current = prev[key]; if (!current) return prev
                      if (current.qty <= 1) { const { [key]: _, ...rest } = prev; return rest }
                      return { ...prev, [key]: { ...current, qty: current.qty - 1 } }
                    })}>−</Button>
                    <span className="w-6 text-center font-semibold">{line.qty}</span>
                    <Button variant="outline" size="sm" onClick={() => setCartItems(prev => {
                      const current = prev[key]; if (!current) return prev
                      return { ...prev, [key]: { ...current, qty: current.qty + 1 } }
                    })}>+</Button>
                    <Button variant="outline" size="sm" onClick={() => setCartItems(prev => { const { [key]: _, ...rest } = prev; return rest })}>حذف</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" disabled={Object.keys(cartItems).length === 0 || busy} onClick={() => setCartItems({})}>تفريغ السلة</Button>
              <Button disabled={Object.keys(cartItems).length === 0 || busy || !canManage || !canAppend || isReadOnly} onClick={async () => {
                const items = Object.values(cartItems).map(line => ({ productId: line.productId, variantId: line.variantId, modifierSelections: Object.entries(line.modifierSelections).map(([groupId, valueIds]) => ({ groupId, valueIds })), qty: line.qty, note: line.note }))
                const target = order?.id
                const fingerprint = JSON.stringify({ tableId: table.id, orderId: target ?? null, items })
                if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
                const requestKey = attempt.current.key
                await act(async () => {
                  if (target) {
                    await request(`/api/staff/orders/${target}/items/append`, { items, idempotencyKey: requestKey }, requestKey)
                    setNotice('تم إضافة أصناف السلة للطلب')
                  } else {
                    const result = await request('/api/staff/pos/orders', { orderType: 'dine_in', tableId: table.id, items }, requestKey)
                    if (typeof result.id !== 'string') throw new Error('تعذر إنشاء الطلب؛ حدّث الصفحة')
                    createdOrder.current = result.id
                    await request(`/api/staff/orders/${result.id}/send`)
                    setNotice('تم إنشاء الطلب وتوزيعه على المطبخ تلقائياً')
                    if (result.id) router.replace(`${home}/tables/${table.id}?orderId=${result.id}`)
                    setTab('order')
                  }
                  setCartItems({})
                  setCartModalOpen(false)
                })
              }}>
                {busy ? 'جارٍ الإرسال…' : order ? 'إضافة السلة للطلب' : 'تأكيد الطلب وإرساله للمطبخ'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* عنصر الطيران إلى السلة */}
      {fly && (
        <div ref={flyRef} className="fixed pointer-events-none z-[60] bg-amber-600 text-white rounded-full flex items-center justify-center w-10 h-10 shadow-lg" style={{ left: fly.x, top: fly.y }}>
          <Icon name="plus" size={14} />
        </div>
      )}
    </main>
  )
}
