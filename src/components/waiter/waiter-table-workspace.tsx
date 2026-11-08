'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'
import type { WaiterWorkspace } from '@/lib/staff-waiter'
import { TableQrRequests } from '@/components/waiter/table-qr-requests'
import { isActiveTableOrder, canManageTableOrder, mayAppendToOrder } from '@/lib/table-order-policy'
import type { InvoiceRow } from '@/lib/staff-invoices'
import { parseOrderItemQuantity } from '@/lib/order-item-quantity'

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
    <button type="button" onClick={onChoose} disabled={!candidate.isAvailable} className={cls}>
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
  const [pending, setPending] = useState<PendingLine[]>([])
  const [showAddPanel, setShowAddPanel] = useState(false)
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
  useEffect(() => {
    const timer = window.setInterval(() => { if (!pending.length && !showAddPanel && !inFlight.current && !document.hidden && navigator.onLine) router.refresh() }, 15000)
    return () => window.clearInterval(timer)
  }, [router, pending.length, showAddPanel])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pending.length) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending.length])
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
  async function save() {
    if (!pending.length || !canManage || !canAppend || isReadOnly) return
    await act(async () => {
      const items = pending.map((line) => ({ productId: line.productId, variantId: line.variantId, modifierSelections: Object.entries(line.modifierSelections).map(([groupId, valueIds]) => ({ groupId, valueIds })), qty: line.qty, note: line.note.trim() || undefined }))
      const target = createdOrder.current ?? order?.id
      const fingerprint = JSON.stringify({ tableId: table.id, orderId: target ?? null, items })
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
      if (createdOrder.current) {
        await request(`/api/staff/orders/${createdOrder.current}/send`)
      } else if (target) {
        await request(`/api/staff/orders/${target}/items/append`, { items, idempotencyKey: attempt.current.key }, attempt.current.key)
      } else {
        const result = await request('/api/staff/pos/orders', { orderType: 'dine_in', tableId: table.id, items }, attempt.current.key)
        if (typeof result.id !== 'string') throw new Error('تعذر التحقق من رقم الطلب؛ حدّث الصفحة قبل المحاولة')
        createdOrder.current = result.id
        await request(`/api/staff/orders/${result.id}/send`)
      }
      const saved = createdOrder.current ?? target
      setPending([]); attempt.current = null; createdOrder.current = null
      setNotice('تم حفظ الأصناف في نفس الطلب وتوزيعها على المطبخ تلقائياً')
      if (saved) router.replace(`${home}/tables/${table.id}?orderId=${saved}`)
      setTab('order')
    })
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
      await request(`/api/staff/orders/${order.id}/delete`, { method: 'DELETE' }, undefined)
      setNotice('تم حذف الطلب وإرجاع حجوزات المخزون')
      setTab('order')
      router.refresh()
    })
  }

  const pendingQtyByProduct = useMemo(() => pending.reduce((acc, line) => { acc[line.productId] = (acc[line.productId] ?? 0) + line.qty; return acc }, {} as Record<string, number>), [pending])
  const categories = workspace.categories
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [product, setProduct] = useState<Product | null>(null)
  const [variantId, setVariantId] = useState('')
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  const filtered = productsFilter(workspace.products, search, category)
  const variant = product?.variants.find((candidate) => candidate.id === variantId)
  const modifierPrice = product?.modifierGroups.flatMap((group) => group.options.filter((option) => (selections[group.id] ?? []).includes(option.id))).reduce((sum, option) => sum + Number(option.priceAdjustment), 0) ?? 0
  const ready = !!product && (!product.variants.length || !!variantId) && product.modifierGroups.every((group) => { const count = (selections[group.id] ?? []).length; return count >= (group.isRequired ? Math.max(1, group.minSelections) : group.minSelections) && count <= group.maxSelections })

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
  function addSelectedToPending() {
    if (!product || isReadOnly) return
    setPending((current) => [...current, { key: crypto.randomUUID(), productId: product.id, variantId: variantId || undefined, modifierSelections: selections, qty, note }])
    setProduct(null)
  }
  function productsFilter(products: Product[], s: string, cat: string) {
    return products.filter((candidate) => candidate.isAvailable && (cat === 'all' || candidate.categoryId === cat) && candidate.name.toLowerCase().includes(s.trim().toLowerCase()))
  }

  return (
    <main dir="rtl" className="min-h-dvh bg-background p-3 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-xl border p-4 space-y-3">
          <Button variant="outline" onClick={() => { if (!pending.length || window.confirm('مغادرة المسودة غير المحفوظة؟')) router.push(home) }}>الطاولات</Button>
          <div className="flex flex-wrap justify-between gap-2">
            <h1 className="text-2xl font-bold">طاولة {table.number} {table.name}</h1>
            <Badge tone={table.openOrders ? 'warning' : 'success'}>{table.openOrders ? 'مشغولة' : 'متاحة'}</Badge>
          </div>
          {order ? (
            <>
              <p className="text-sm text-muted-foreground">طلب {order.number} · {statusLabel(order.status)} · أنشأه {order.creatorName ?? 'غير محدد'} · {new Date(order.createdAt).toLocaleString('ar-EG')}</p>
              <div className="flex flex-wrap gap-5 text-sm">
                <span>الإجمالي: {formatCurrency(order.total)}</span>
                <span>المدفوع: {formatCurrency(order.paidAmount ?? 0)}</span>
                <span>المتبقي: {formatCurrency(order.remainingAmount ?? order.total)}</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {!order.sentToKitchen && canManage && !isReadOnly && <Button size="sm" disabled={busy} onClick={sendToKitchen}>إرسال للمطبخ</Button>}
                {role === 'cashier' && !isReadOnly && <Button variant="outline" size="sm" onClick={() => setTab('order')}>الانتقال للدفع</Button>}
                <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => setTab('order')}>سجل الطلب</Button>
                <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => setTab('order')}>تقدم المطبخ</Button>
                <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => setTab('order')}>عرض الفاتورة</Button>
              </div>
            </>
          ) : (
            <p>{table.openOrders ? 'الطاولة مشغولة بطلب لا تملك صلاحية إدارته؛ لا يمكن إنشاء طلب آخر.' : 'لا يوجد طلب على الطاولة. أضف أصناف أدناه لبدء طلب جديد.'}</p>
          )}
        </header>

        {error && <p role="alert" className="rounded border border-destructive p-3">{error}</p>}
        {notice && <p role="status" className="rounded border border-success bg-success/10 p-3">{notice}</p>}

        {role === 'waiter' && <TableQrRequests tableId={table.id} />}

        <nav aria-label="إجراءات الطاولة" className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !!createdOrder.current || !canManage || (isReadOnly && tab === 'pos')}
            onClick={() => setTab(tab === 'order' ? 'pos' : 'order')}
            className={tab === 'pos' ? 'bg-primary text-primary-foreground' : ''}
          >
            {tab === 'pos' ? 'العودة للطلب الجاري' : 'نقطة البيع'}
          </Button>
          <Button variant="outline" disabled={isReadOnly} onClick={() => setTab('order')}>الطلب الجاري</Button>
          <Button variant="outline" disabled={isReadOnly || busy || !canManage || !canAppend} onClick={() => setShowAddPanel(!showAddPanel)}>
            {showAddPanel ? 'إغلاق إضافة الأصناف' : order ? 'إضافة أصناف للطاولة' : 'بدء طلب جديد'}
          </Button>
        </nav>

        {showAddPanel && <AddItemsPanel
          products={workspace.products}
          categories={categories}
          pending={pending}
          setPending={setPending}
          search={search}
          setSearch={setSearch}
          category={category}
          setCategory={setCategory}
          product={product}
          setProduct={setProduct}
          variantId={variantId}
          setVariantId={setVariantId}
          selections={selections}
          setSelections={setSelections}
          qty={qty}
          setQty={setQty}
          note={note}
          setNote={setNote}
          choose={choose}
          toggle={toggle}
          addSelectedToPending={addSelectedToPending}
          filtered={filtered}
          variant={variant}
          modifierPrice={modifierPrice}
          ready={ready}
          pendingQtyByProduct={pendingQtyByProduct}
          mode={mode}
          order={order}
          table={table}
          busy={busy}
          canManage={canManage}
          canAppend={canAppend}
          save={save}
          createdOrder={!!createdOrder.current}
          isReadOnly={isReadOnly}
        />}

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
                  <Button variant="outline" size="sm" disabled={busy || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly} onClick={() => void quickQty(item, 0)}>تعديل الكمية</Button>
                  <Button variant="outline" size="sm" disabled={busy || order.items.length <= 1 || item.servedQty > 0 || order.paymentStatus === 'paid' || isReadOnly} onClick={() => void edit(item, true)}>إلغاء بسبب موثق</Button>
                  {item.servedQty > 0 && <p className="text-sm text-muted-foreground">صنف مقدم؛ التصحيح المالي عبر المسار المصرح فقط.</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>}

        {tab === 'order' && !order && <div className="rounded-xl border p-8 text-center">
          <p className="text-muted-foreground">لا يوجد طلب نشط على هذه الطاولة.</p>
          <Button disabled={isReadOnly || !canManage || !canAppend} onClick={() => setShowAddPanel(true)}>بدء طلب جديد</Button>
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

        {tab === 'order' && order && <section className="rounded border p-4 space-y-2">
          <h2 className="font-bold">عرض الفاتورة</h2>
          {order.items.map((item) => <p key={item.id} className="text-sm">{item.name} × {item.qty} — {formatCurrency(item.lineTotal ?? item.unitPrice * item.qty)}</p>)}
          <p className="font-semibold">الإجمالي: {formatCurrency(order.total)} · المدفوع: {formatCurrency(order.paidAmount ?? 0)}</p>
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
              <div className="grid gap-2 sm:grid-cols-[1fr_220px] mb-4">
                <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن صنف…" aria-label="بحث المنتجات" />
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded border bg-background px-3">
                  <option value="all">كل الأقسام</option>
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((candidate) => {
                  const alreadyQty = pendingQtyByProduct[candidate.id] ?? 0
                  const selected = alreadyQty > 0
                  return (
                    <ProductButton key={candidate.id} candidate={candidate} selected={selected} alreadyQty={alreadyQty} onChoose={() => choose(candidate)} />
                  )
                })}
              </div>
              {product && (
                <div className="mt-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-lg">{product.name}</h3>
                    <Button variant="ghost" size="sm" onClick={() => setProduct(null)}>رجوع</Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">السعر المعروض تقديري، والخادم يعيد احتسابه عند الحفظ.</p>
                  {product.variants.length ? (
                    <label className="block text-sm mb-2">
                      <span className="mb-1 block font-medium">المتغير *</span>
                      <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="h-10 w-full rounded border bg-background px-3">
                        <option value="">اختر المتغير</option>
                        {product.variants.map((item) => <option key={item.id} value={item.id}>{item.label} — {formatCurrency(Number(item.price))}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {product.modifierGroups.map((group) => (
                    <fieldset key={group.id} className="rounded-lg border p-3 mb-3">
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
                  <div className="mt-2 text-right">
                    <label className="text-xs font-medium">الكمية</label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setQty((q) => Math.max(1, q - 1))}>-</Button>
                      <span className="w-8 text-center font-semibold">{qty}</span>
                      <Button variant="outline" size="sm" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</Button>
                    </div>
                  </div>
                  <Button className="w-full mt-3" disabled={!ready || busy || isReadOnly} onClick={addSelectedToPending}>إضافة للمسودة ومتابعة الاختيار</Button>
                </div>
              )}
              {pending.length > 0 && (
                <div className="mt-4 rounded border p-3 space-y-2">
                  <h3 className="text-sm font-bold">المنتجات المختارة للإضافة</h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {pending.map((line) => {
                      const p = workspace.products.find((p) => p.id === line.productId)
                      return (
                        <div key={line.key} className="flex flex-wrap items-center gap-2 rounded border p-1.5">
                          <span className="text-sm">{p?.name} × {line.qty}</span>
                          {line.note && <span className="text-xs text-muted-foreground">({line.note})</span>}
                          <Button size="sm" variant="outline" onClick={() => setPending((lines) => lines.filter((l) => l.key !== line.key))}>إزالة</Button>
                        </div>
                      )
                    })}
                  </div>
                  <Button disabled={busy || !canManage || !canAppend || isReadOnly} onClick={() => void save()} className="w-full">
                    {busy ? 'جارٍ الحفظ…' : createdOrder ? 'إعادة إرسال الطلب المحفوظ' : order ? 'تأكيد إضافة الأصناف لنفس الطلب' : 'تأكيد الطلب وتوزيعه على المطبخ تلقائياً'}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>}
      </div>
    </main>
  )
}

function AddItemsPanel({ products, categories, pending, setPending, search, setSearch, category, setCategory, product, setProduct, variantId, setVariantId, selections, setSelections, qty, setQty, note, setNote, choose, toggle, addSelectedToPending, filtered, variant, modifierPrice, ready, pendingQtyByProduct, mode, order, table, busy, canManage, canAppend, save, createdOrder, isReadOnly }: {
  products: Product[]
  categories: WaiterWorkspace['categories']
  pending: PendingLine[]
  setPending: React.Dispatch<React.SetStateAction<PendingLine[]>>
  search: string
  setSearch: React.Dispatch<React.SetStateAction<string>>
  category: string
  setCategory: React.Dispatch<React.SetStateAction<string>>
  product: Product | null
  setProduct: React.Dispatch<React.SetStateAction<Product | null>>
  variantId: string
  setVariantId: React.Dispatch<React.SetStateAction<string>>
  selections: Record<string, string[]>
  setSelections: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  qty: number
  setQty: React.Dispatch<React.SetStateAction<number>>
  note: string
  setNote: React.Dispatch<React.SetStateAction<string>>
  choose: (candidate: Product) => void
  toggle: (groupId: string, optionId: string, max: number) => void
  addSelectedToPending: () => void
  filtered: Product[]
  variant: Product['variants'][number] | undefined
  modifierPrice: number
  ready: boolean
  pendingQtyByProduct: Record<string, number>
  mode: 'ADD_ITEMS' | 'CREATE_ORDER'
  order: Order | null
  table: Table
  busy: boolean
  canManage: boolean
  canAppend: boolean
  save: () => void
  createdOrder: boolean
  isReadOnly: boolean
}) {
  return (
    <Card className="space-y-3">
      <CardHeader className="flex-row items-center justify-between border-b">
        <CardTitle>إضافة أصناف — طاولة {table.number}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!product ? (
          <>
            <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
              <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن صنف…" aria-label="بحث المنتجات" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded border bg-background px-3">
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
                <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="h-10 w-full rounded border bg-background px-3">
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
              <Input className="flex-1" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات للمطبخ" />
            </div>
            <div className="mt-2 text-right">
              <label className="text-xs font-medium">الكمية</label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setQty((q) => Math.max(1, q - 1))}>-</Button>
                <span className="w-8 text-center font-semibold">{qty}</span>
                <Button variant="outline" size="sm" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</Button>
              </div>
            </div>
            <Button className="w-full" disabled={!ready || busy || isReadOnly} onClick={addSelectedToPending}>إضافة للمسودة ومتابعة الاختيار</Button>
          </div>
        )}
      </CardContent>
      <div className="shrink-0 border-t bg-background p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>مسودة الإضافة: {pending.reduce((sum, line) => sum + line.qty, 0)} أصناف</span>
          <Button variant="outline" size="sm" onClick={() => setProduct(null)}>مراجعة السلة</Button>
        </div>
        {pending.length > 0 && (
          <div className="mt-3 rounded border p-3 space-y-2">
            <h3 className="text-sm font-bold">المنتجات المختارة للإضافة</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {pending.map((line) => {
                const p = products.find((p) => p.id === line.productId)
                return (
                  <div key={line.key} className="flex flex-wrap items-center gap-2 rounded border p-1.5">
                    <span className="text-sm">{p?.name} × {line.qty}</span>
                    {line.note && <span className="text-xs text-muted-foreground">({line.note})</span>}
                    <Button size="sm" variant="outline" onClick={() => setPending((lines) => lines.filter((l) => l.key !== line.key))}>إزالة</Button>
                  </div>
                )
              })}
            </div>
            <Button disabled={busy || !canManage || !canAppend || isReadOnly} onClick={() => void save()} className="w-full">
              {busy ? 'جارٍ الحفظ…' : createdOrder ? 'إعادة إرسال الطلب المحفوظ' : order ? 'تأكيد إضافة الأصناف لنفس الطلب' : 'تأكيد الطلب وتوزيعه على المطبخ تلقائياً'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
