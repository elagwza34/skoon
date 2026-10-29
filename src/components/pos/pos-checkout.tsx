'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { Dropdown } from '@/components/ui/dropdown'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { formatCurrency, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PosCatalog } from '@/lib/staff-pos'
import { posDraftKey, restorePosDraft } from '@/lib/pos-draft'
import { buildPaymentRequestPayload } from '@/lib/payment-request'
import { ThermalReceiptPreview } from '@/components/cashier/thermal-receipt-preview'
import type { InvoiceRow } from '@/lib/staff-invoices'
import type { StaffOrderRow } from '@/lib/staff-orders'
import { canRenderPosDiscountControls, submittedDiscountFields } from '@/lib/pos-discount-policy'
import { confirmWaiterPosOrder, type WaiterPosOrderReference } from '@/lib/waiter-pos-confirmation'

/**
 * POS checkout — real branch catalog + tables from the DB.
 * Pricing is re-computed server-side on submit; client totals are a preview.
 */
type PosCartSummary = { itemCount: number; total: number; tableId: string }

export function PosCheckout({
  catalog,
  initialTableId,
  takeawayOrders = [],
  mode = 'cashier',
  cartOpen = false,
  onCartOpenChange,
  onCartSummaryChange,
  onOrderCreated,
  catalogVisible = true,
}: {
  catalog: PosCatalog
  initialTableId?: string
  takeawayOrders?: StaffOrderRow[]
  mode?: 'cashier' | 'waiter'
  cartOpen?: boolean
  onCartOpenChange?: (open: boolean) => void
  onCartSummaryChange?: (summary: PosCartSummary) => void
  onOrderCreated?: (orderId: string) => void
  catalogVisible?: boolean
}) {
  const isWaiter = mode === 'waiter'
  const canUseDiscounts = canRenderPosDiscountControls(mode)
  const router = useRouter()
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<
    {
      id: string
      variantId?: string
      modifierSelections: Record<string, string[]>
      qty: number
      note?: string
      discountType?: 'percentage' | 'amount'
      discountValue?: number
    }[]
  >([])
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in')
  const [tableId, setTableId] = useState(initialTableId ?? catalog.tables[0]?.id ?? '')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile_wallet' | 'instapay'>('cash')
  const [received, setReceived] = useState('')
  const [electronicConfirmed, setElectronicConfirmed] = useState(false)
  const [receipt, setReceipt] = useState<InvoiceRow | null>(null)
  const [dispatchRetry, setDispatchRetry] = useState<{
    id: string
    number: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [placed, setPlaced] = useState<{
    orderNumber: string
    total: string
    dispatched?: boolean
  } | null>(null)
  const [variantModal, setVariantModal] = useState<{
    product: NonNullable<typeof catalog.products>[number]
    onConfirm: (variantId: string, qty: number) => void
  } | null>(null)
  const [variantQuantity, setVariantQuantity] = useState(1)
  const [modifierModal, setModifierModal] = useState<{
    product: NonNullable<typeof catalog.products>[number]
    variantId?: string
    onConfirm: (variantId: string | undefined, modifierSelections: Record<string, string[]>, qty: number) => void
  } | null>(null)
  const [modifierVariantId, setModifierVariantId] = useState('')
  const [modifierQuantity, setModifierQuantity] = useState(1)
  const submissionKey = useRef<string | null>(null)
  const paymentKey = useRef<string | null>(null)
  const skipDraftPersist = useRef(false)
  const [draftReady, setDraftReady] = useState(false)
  const draftKey = posDraftKey(catalog.draftScope.userId, catalog.draftScope.branchId)

  // Drafts are convenience state only. They are isolated per user and branch,
  // and are always re-priced and re-validated by the server at checkout.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey)
      const draft = restorePosDraft(raw, new Set(catalog.products.map((product) => product.id)), new Set(catalog.tables.map((table) => table.id)), new Set(catalog.products.flatMap((product) => product.variants.map((variant) => `${product.id}:${variant.id}`))))
      if (draft) {
        setCart(draft.cart)
        if (draft.tableId) setTableId(draft.tableId)
        setCustomerName(draft.customerName)
        setCustomerPhone(draft.customerPhone)
      }    } catch {
      window.localStorage.removeItem(draftKey)
    } finally {
      // State, rather than a ref, prevents the initial empty-cart persistence
      // effect from deleting storage before the restored cart is rendered.
      setDraftReady(true)
    }
  }, [catalog.products, catalog.tables, draftKey])

  useEffect(() => {
    if (!draftReady) return
    try {
      if (skipDraftPersist.current) {
        skipDraftPersist.current = false
        return
      }
      window.localStorage.setItem(draftKey, JSON.stringify({ cart, tableId, customerName, customerPhone }))} catch {
      // Storage may be unavailable or full; the in-memory draft still works.
    }
  }, [cart, customerName, customerPhone, draftKey, draftReady, tableId])

  const priceById = useMemo(() => new Map(catalog.products.map((p) => [p.id, Number(p.price)])), [catalog.products])
  const variantPriceById = useMemo(() => new Map(catalog.products.flatMap((p) => p.variants.map((v) => [`${p.id}:${v.id}`, Number(v.price)]))), [catalog.products])

  const visible = useMemo(() => {
    const q = query.trim()
    return catalog.products.filter((p) => (category === 'all' || p.categoryId === category) && (!q || p.name.includes(q)))
  }, [catalog.products, category, query])

  function modifierPrice(productId: string, selections: Record<string, string[]>): number {
    const product = catalog.products.find((candidate) => candidate.id === productId)
    if (!product) return 0
    return Object.entries(selections).reduce((sum, [groupId, optionIds]) => {
      const group = product.modifierGroups.find((candidate) => candidate.id === groupId)
      return sum + optionIds.reduce((optionSum, optionId) => optionSum + Number(group?.options.find((option) => option.id === optionId)?.priceAdjustment ?? 0), 0)
    }, 0)
  }
  const subtotal = cart.reduce((s, l) => s + ((variantPriceById.get(`${l.id}:${l.variantId}`) ?? priceById.get(l.id) ?? 0) + modifierPrice(l.id, l.modifierSelections)) * l.qty, 0)
  const itemCount = cart.reduce((s, l) => s + l.qty, 0)

  useEffect(() => {
    if (!draftReady) return
    onCartSummaryChange?.({ itemCount, total: subtotal, tableId })
  }, [draftReady, itemCount, onCartSummaryChange, subtotal, tableId])

  function add(id: string) {
    const product = catalog.products.find((p) => p.id === id)
    if (!product) return
    if (product.modifierGroups.length > 0) {
      // Initialize modifier state with empty selections
      const initialSelections: Record<string, string[]> = {}
      product.modifierGroups.forEach((g) => { initialSelections[g.id] = [] })
      setModifierSelectionsState(initialSelections)
      setModifierVariantId('')
      setModifierQuantity(1)
      setModifierModal({
        product,
        onConfirm: (variantId, modifierSelections, qty) => {
          setCart((prev) => {
            const ex = prev.find((l) => l.id === id && l.variantId === variantId && modifierSelectionsEqual(l.modifierSelections, modifierSelections))
            if (ex) return prev.map((l) => (l.id === id && l.variantId === variantId && modifierSelectionsEqual(l.modifierSelections, modifierSelections) ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
            return [...prev, { id, variantId, modifierSelections, qty }]
          })
          setModifierModal(null)
        },
      })
      return
    }
    if (product.variants.length > 0) {
      setVariantQuantity(1)
      setVariantModal({
        product,
        onConfirm: (variantId, qty) => {
          setCart((prev) => {
            const ex = prev.find((l) => l.id === id && l.variantId === variantId && modifierSelectionsEqual(l.modifierSelections, {}))
            if (ex) return prev.map((l) => (l.id === id && l.variantId === variantId ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
            return [...prev, { id, variantId, modifierSelections: {}, qty }]
          })
          setVariantModal(null)
        },
      })
      return
    }
    setPlaced(null)
    setCart((prev) => {
      const ex = prev.find((l) => l.id === id && !l.variantId && modifierSelectionsEqual(l.modifierSelections, {}))
      if (ex) return prev.map((l) => (l.id === id && !l.variantId ? { ...l, qty: Math.min(20, l.qty + 1) } : l))
      return [...prev, { id, modifierSelections: {}, qty: 1 }]
    })
  }

  function modifierSelectionsEqual(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
    const keysA = Object.keys(a).sort()
    const keysB = Object.keys(b).sort()
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => {
      const va = (a[k] ?? []).slice().sort()
      const vb = (b[k] ?? []).slice().sort()
      return va.length === vb.length && va.every((v, i) => v === vb[i])
    })
  }

  // Modifier selection modal state
  const [modifierSelectionsState, setModifierSelectionsState] = useState<Record<string, string[]>>({})

  function toggleModifierOption(groupId: string, optionId: string, maxSelections: number) {
    setModifierSelectionsState((prev) => {
      const current = (prev[groupId] ?? []).slice()
      const idx = current.indexOf(optionId)
      if (idx >= 0) {
        current.splice(idx, 1)
      } else if (current.length < maxSelections) {
        current.push(optionId)
      }
      return { ...prev, [groupId]: current }
    })
  }

  function getModifierModalReady(): boolean {
    if (!modifierModal) return false
    if (modifierModal.product.variants.length > 0 && !modifierVariantId) return false
    for (const group of modifierModal.product.modifierGroups) {
      const selected = modifierSelectionsState[group.id] ?? []
      if (group.isRequired && selected.length < group.minSelections) return false
      if (selected.length > group.maxSelections) return false
    }
    return true
  }

  function confirmModifier() {
    if (!modifierModal) return
    const selections = { ...modifierSelectionsState }
    // Clean up empty selections
    Object.keys(selections).forEach((k) => {
      if (!selections[k]?.length) delete selections[k]
    })
    modifierModal.onConfirm(modifierVariantId || modifierModal.variantId, selections, modifierQuantity)
    setModifierSelectionsState({})
    setModifierModal(null)
  }
  function inc(id: string, variantId?: string, modifierSelections?: Record<string, string[]>) {
    setCart((prev) => prev.map((l) => (l.id === id && l.variantId === variantId && modifierSelectionsEqual(l.modifierSelections, modifierSelections ?? {}) ? { ...l, qty: Math.min(20, l.qty + 1) } : l)))
  }
  function dec(id: string, variantId?: string, modifierSelections?: Record<string, string[]>) {
    setCart((prev) => prev.map((l) => (l.id === id && l.variantId === variantId && modifierSelectionsEqual(l.modifierSelections, modifierSelections ?? {}) ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0))
  }
  function setNote(id: string, variantId: string | undefined, modifierSelections: Record<string, string[]>, note: string) {
    setCart((prev) => prev.map((line) => (line.id === id && line.variantId === variantId && modifierSelectionsEqual(line.modifierSelections, modifierSelections) ? { ...line, note } : line)))
  }
  function setLineDiscount(id: string, variantId: string | undefined, modifierSelections: Record<string, string[]>, kind: 'none' | 'percentage' | 'amount', value: string) {
    setCart((previous) =>
      previous.map((line) =>
        line.id === id && line.variantId === variantId
          ? {
              ...line,
              discountType: kind === 'none' ? undefined : kind,
              discountValue: kind === 'none' ? undefined : Number(value || 0),
            }
          : line,
      ),
    )
  }
  function removeDraft() {
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      /* browser storage may be unavailable */
    }
  }
  function clear() {
    skipDraftPersist.current = true
    removeDraft()
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setOrderNotes('')
    setPlaced(null)
    setError(null)
  }
  function remove(id: string, variantId?: string, modifierSelections?: Record<string, string[]>) {
    setCart((previous) => previous.filter((l) => l.id !== id || l.variantId !== variantId || !modifierSelectionsEqual(l.modifierSelections, modifierSelections ?? {})))
  }

  async function checkout() {
    if (cart.length === 0 || busy) return
    if (orderType === 'dine_in' && !tableId) {
      setError('اختر الطاولة')
      return
    }
    setBusy(true)
    setError(null)
    const idempotencyKey = submissionKey.current ?? crypto.randomUUID()
    submissionKey.current = idempotencyKey
    try {
      const createOrder = async (): Promise<WaiterPosOrderReference> => {
        const response = await fetch('/api/staff/pos/orders', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            orderType,
            ...(orderType === 'dine_in' ? { tableId } : {}),
            customerName: customerName.trim() || undefined,
            customerPhone: customerPhone.trim() || undefined,
            notes: orderNotes.trim() || undefined,
            ...submittedDiscountFields(mode, discountType === 'none' ? undefined : discountType, Number(discountValue || 0)),
            items: cart.map((l) => ({
              productId: l.id,
              variantId: l.variantId,
              modifierSelections: Object.entries(l.modifierSelections).map(([groupId, valueIds]) => ({ groupId, valueIds })),
              qty: l.qty,
              note: l.note?.trim() || undefined,
              ...submittedDiscountFields(mode, l.discountType, l.discountValue),
            })),
          }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error ?? 'فشل إنشاء الطلب')
        return body as WaiterPosOrderReference
      }

      let data: WaiterPosOrderReference
      if (isWaiter) {
        const result = await confirmWaiterPosOrder(createOrder, async (orderId) => {
          const dispatchResponse = await fetch(`/api/staff/orders/${orderId}/send`, { method: 'POST' })
          const dispatch = await dispatchResponse.json().catch(() => ({}))
          if (!dispatchResponse.ok) throw new Error(dispatch.error ?? 'تعذر إرسال الطلب للمطبخ')
        })
        data = result.order
        if (!result.dispatched) {
          setDispatchRetry({ id: data.id, number: data.orderNumber })
          setPlaced({ orderNumber: data.orderNumber, total: data.total, dispatched: false })
          setError(result.dispatchError ?? 'تعذر إرسال الطلب للمطبخ')
        } else {
          setDispatchRetry(null)
          setPlaced({ orderNumber: data.orderNumber, total: data.total, dispatched: true })
        }
      } else {
        data = await createOrder()
      }
      if (!isWaiter && orderType === 'takeaway') {
        const payIdempotencyKey = paymentKey.current ?? crypto.randomUUID()
        paymentKey.current = payIdempotencyKey
        const paymentResponse = await fetch(`/api/staff/orders/${data.id}/pay`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': payIdempotencyKey,
          },
          body: JSON.stringify(buildPaymentRequestPayload(paymentMethod, received, electronicConfirmed)),
        })
        const payment = await paymentResponse.json().catch(() => ({}))
        if (!paymentResponse.ok) throw new Error(payment.error ?? 'فشل تحصيل طلب التيك أواي؛ لم يُرسل للمطبخ')
        if (payment.invoice) setReceipt(payment.invoice as InvoiceRow)
        const dispatchResponse = await fetch(`/api/staff/orders/${data.id}/send`, { method: 'POST' })
        const dispatch = await dispatchResponse.json().catch(() => ({}))
        if (!dispatchResponse.ok) {
          setDispatchRetry({ id: data.id, number: data.orderNumber })
          setError(`تم الدفع بنجاح، لكن تعذر إرسال الطلب للمطبخ: ${dispatch.error ?? 'أعد المحاولة'}`)
        } else setDispatchRetry(null)
        paymentKey.current = null
      }
      if (!isWaiter) setPlaced({ orderNumber: data.orderNumber, total: data.total })
      skipDraftPersist.current = true
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setOrderNotes('')
      removeDraft()
      submissionKey.current = null
      onOrderCreated?.(data.id)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل إنشاء الطلب')
    } finally {
      setBusy(false)
    }
  }
  async function retryDispatch() {
    if (!dispatchRetry || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/staff/orders/${dispatchRetry.id}/send`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'تعذر إعادة الإرسال')
      setDispatchRetry(null)
      setPlaced((current) => current ? { ...current, dispatched: true } : current)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إعادة الإرسال')
    } finally {
      setBusy(false)
    }
  }
  async function handover(order: StaffOrderRow) {
    if (busy || order.status !== 'ready') return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/staff/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'serve_items', items: order.items.map((item) => ({ orderItemId: item.id, quantity: item.qty - item.servedQty })) }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'تعذر تأكيد تسليم الطلب')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تأكيد تسليم الطلب')
    } finally {
      setBusy(false)
    }
  }
  const categoryOptions = [{ value: 'all', label: 'الكل' }, ...catalog.categories.map((c) => ({ value: c.id, label: c.name }))]
  const tableOptions = catalog.tables.map((t) => ({
    value: t.id,
    label: t.name ? `${t.number} · ${t.name}` : `طاولة ${t.number}`,
    icon: 'tables' as const,
  }))

  const cartContents = (
    <>
      <CardHeader className={cn('flex-row items-center justify-between gap-2', isWaiter && 'border-b')}>
        <CardTitle>السلة</CardTitle>
        <div className="flex items-center gap-1">
          {cart.length ? (
            <Button variant="ghost" size="sm" onClick={clear} className="text-destructive">
              <Icon name="trash" size={16} /> إفراغ
            </Button>
          ) : null}
          {isWaiter && onCartOpenChange ? <Button variant="ghost" size="sm" onClick={() => onCartOpenChange(false)}>إغلاق</Button> : null}
        </div>
      </CardHeader>
      <CardContent className={cn('flex min-h-0 flex-col gap-3', isWaiter && 'overflow-y-auto p-4')}>
        {!isWaiter ? <Segmented
          options={[
            { value: 'dine_in', label: 'داخل الكافيه' },
            { value: 'takeaway', label: 'تيك أواي' },
          ]}
          value={orderType}
          onChange={(value) => setOrderType(value as 'dine_in' | 'takeaway')}
          ariaLabel="نوع الطلب"
        /> : <Badge tone="info" className="justify-center">طلب داخل الكافيه</Badge>}
        {orderType === 'dine_in' ? <Dropdown label="الطاولة" options={tableOptions} value={tableId} onChange={setTableId} className="w-full" /> : <Badge tone="warning" className="whitespace-normal text-center leading-5">تيك أواي · الدفع إلزامي قبل المطبخ</Badge>}
        <Input icon="customers" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اسم العميل (اختياري)" aria-label="اسم العميل" />
        <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={30} placeholder="رقم الهاتف (اختياري)" aria-label="رقم الهاتف (اختياري)" />
        <Input value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} maxLength={2000} placeholder="ملاحظات الطلب (اختياري)" />
        {dispatchRetry ? <Button variant="secondary" disabled={busy} onClick={() => void retryDispatch()}>إعادة الإرسال للمطبخ</Button> : null}
        {placed ? <p className={cn('rounded-md px-3 py-2 text-sm', placed.dispatched === false ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success')}>
          {isWaiter
            ? placed.dispatched === false
              ? `تم حفظ الطلب، لكن تعذر إرساله للمطبخ · ${placed.orderNumber}`
              : `تم تأكيد الطلب وإرساله للمطبخ · ${placed.orderNumber}`
            : `تم إنشاء الطلب ${placed.orderNumber} · ${formatCurrency(Number(placed.total))}`}
        </p> : null}
        {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        {cart.length === 0 ? (
          <EmptyState icon="pos" title="السلة فارغة" description="اختر منتجات لإضافتها." />
        ) : (
          <ul className="flex flex-col gap-2">
            {cart.map((l) => {
              const p = catalog.products.find((x) => x.id === l.id)!
              const v = l.variantId ? p.variants.find((x) => x.id === l.variantId) : null
              const unitPrice = (v ? Number(v.price) : Number(p.price)) + modifierPrice(l.id, l.modifierSelections)
              const label = v ? `${p.name} — ${v.label}` : p.name
              const modifierLabels = Object.entries(l.modifierSelections).flatMap(([groupId, valueIds]) => {
                const group = p.modifierGroups.find((g) => g.id === groupId)
                if (!group) return []
                return valueIds.map((vid: string) => {
                  const opt = group.options.find((o: { id: string }) => o.id === vid)
                  return opt ? `${group.name}: ${opt.label}` : ''
                }).filter(Boolean)
              })
              const fullLabel = modifierLabels.length ? `${label} — ${modifierLabels.join(', ')}` : label
              return (
                <li key={`${l.id}:${l.variantId ?? 'base'}:${JSON.stringify(l.modifierSelections)}`} className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-2 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                    <span className="break-words text-sm font-medium leading-5 text-foreground">{fullLabel}</span>
                    <span className="text-xs text-muted-foreground">{formatCurrency(unitPrice * l.qty)}</span>
                    <Input value={l.note ?? ''} onChange={(e) => setNote(l.id, l.variantId, l.modifierSelections, e.target.value)} maxLength={255} placeholder={isWaiter ? 'ملاحظة للمطبخ (اختياري)' : 'ملاحظة للصنف (اختياري)'} aria-label={`ملاحظة ${label}`} className="h-8 text-xs" />
                    {canUseDiscounts ? <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <select value={l.discountType ?? 'none'} onChange={(event) => setLineDiscount(l.id, l.variantId, l.modifierSelections, event.target.value as 'none' | 'percentage' | 'amount', String(l.discountValue ?? ''))} className="h-8 rounded border bg-background px-2 text-xs" aria-label={`خصم ${label}`}>
                        <option value="none">بدون خصم</option><option value="percentage">خصم %</option><option value="amount">خصم مبلغ</option>
                      </select>
                      {l.discountType ? <Input value={String(l.discountValue ?? '')} onChange={(event) => setLineDiscount(l.id, l.variantId, l.modifierSelections, l.discountType ?? 'none', event.target.value)} inputMode="decimal" className="h-8 text-xs" /> : null}
                    </div> : null}
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1 self-end sm:self-auto">
                    <Button variant="outline" size="icon" className={isWaiter ? 'h-8 w-8' : 'h-7 w-7'} onClick={() => dec(l.id, l.variantId, l.modifierSelections)} aria-label="إنقاص"><Icon name="minus" size={14} /></Button>
                    <span className={cn('text-center text-sm font-semibold', isWaiter ? 'w-7' : 'w-6')}>{l.qty}</span>
                    <Button variant="outline" size="icon" className={isWaiter ? 'h-8 w-8' : 'h-7 w-7'} onClick={() => inc(l.id, l.variantId, l.modifierSelections)} aria-label="زيادة"><Icon name="plus" size={14} /></Button>
                    <Button variant="ghost" size="icon" className={cn(isWaiter ? 'h-8 w-8' : 'h-7 w-7', 'text-destructive')} onClick={() => remove(l.id, l.variantId, l.modifierSelections)} aria-label={`إزالة ${fullLabel} من السلة`}><Icon name="trash" size={14} /></Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex items-center justify-between border-t border-border pt-3 text-base font-bold"><span className="text-foreground">{isWaiter ? 'الإجمالي التقديري' : 'الإجمالي'}</span><span className="text-primary">{formatCurrency(subtotal)}</span></div>
        {canUseDiscounts ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)} className="rounded-lg border bg-background p-2 text-sm"><option value="none">بدون خصم عام</option><option value="percentage">خصم عام %</option><option value="amount">خصم عام مبلغ</option></select>{discountType !== 'none' ? <Input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="قيمة الخصم" /> : null}</div> : null}
        {orderType === 'takeaway' ? <div className="space-y-2 rounded-lg border p-3"><select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value as typeof paymentMethod); setElectronicConfirmed(false) }} className="w-full rounded-lg border bg-background p-2"><option value="cash">نقدي</option><option value="mobile_wallet">محفظة إلكترونية</option><option value="instapay">إنستا باي</option></select>{paymentMethod === 'cash' ? <Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder="المبلغ المستلم" /> : <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={electronicConfirmed} onChange={(event) => setElectronicConfirmed(event.target.checked)} />أؤكد استلام الدفع الإلكتروني</label>}</div> : null}
        <Button size="lg" className="w-full" disabled={!cart.length || busy} onClick={checkout}><Icon name="check" size={18} />{busy ? 'جاري الحفظ…' : 'تأكيد الطلب'}</Button>
        <p className="text-center text-[11px] text-muted-foreground">{formatNumber(itemCount)} صنف · السعر النهائي يُحسب من قاعدة البيانات</p>
      </CardContent>
    </>
  )

  return (
    <>
    <div className={cn('grid min-w-0 gap-4', isWaiter ? 'xl:grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]', !catalogVisible && 'hidden')}>
      <div className="flex min-w-0 flex-col gap-3">
        <Input icon="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن منتج…" aria-label="بحث المنتجات" />
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {categoryOptions.map((c) => (
            <button key={c.value} type="button" onClick={() => setCategory(c.value)} aria-pressed={category === c.value} className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors', category === c.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent')}>
              {c.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon="products" title="لا توجد منتجات مطابقة" description="جرّب بحثاً أو تصنيفاً آخر." />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2 sm:gap-3">
            {visible.map((p) => {
              const variantPrice = p.variants.length > 0 ? Math.min(...p.variants.map((v) => Number(v.price))) : Number(p.price)
              return (
                <button key={p.id} type="button" disabled={!p.isAvailable} onClick={() => add(p.id)} className={cn('flex min-h-28 min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card p-3 text-center sm:p-4', p.isAvailable ? 'hover:border-primary/50 hover:bg-accent/40' : 'cursor-not-allowed opacity-50')}>
                  <span className="break-words text-sm font-medium text-foreground">{p.name}</span>
                  {p.variants.length > 0 ? <span className="text-xs text-muted-foreground">اختر متغير</span> : <span className="text-xs text-muted-foreground">{p.categoryName}</span>}
                  <span className="text-sm font-semibold text-primary">{formatCurrency(variantPrice)}</span>
                  {!p.isAvailable ? <Badge tone="muted">غير متوفر</Badge> : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!isWaiter ? <Card className="flex h-fit min-w-0 flex-col xl:sticky xl:top-24">{cartContents}</Card> : null}
      {/* The waiter cart is rendered once, in the navigation-controlled modal below. */}
      {!isWaiter ? <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-4 xl:col-span-2" aria-label="متابعة طلبات التيك أواي">
          <h2 className="mb-3 font-bold">متابعة طلبات التيك أواي</h2>
          {takeawayOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد طلبات تيك أواي مدفوعة حاليًا.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {takeawayOrders.map((order) => (
                <div key={order.id} className="rounded-lg border p-3">
                  <div className="flex justify-between gap-2">
                    <strong>{order.number}</strong>
                    <Badge tone={order.status === 'ready' ? 'success' : order.status === 'preparing' ? 'warning' : 'muted'}>{order.status === 'new' ? 'بانتظار التحضير' : order.status === 'preparing' ? 'قيد التحضير' : order.status === 'ready' ? 'جاهز للاستلام' : 'تم التسليم'}</Badge>
                  </div>
                  {order.customerName ? <p className="mt-1 text-xs text-muted-foreground">{order.customerName}</p> : null}
                  {order.status === 'ready' ? (
                    <Button className="mt-2 w-full" size="sm" disabled={busy} onClick={() => void handover(order)}>
                      تأكيد التسليم للعميل
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section> : null}

      {variantModal && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-2 sm:p-4" dir="rtl">
          <Card className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)]">
            <CardHeader className="shrink-0 border-b">
              <CardTitle className="break-words">اختر متغيرًا لـ {variantModal.product.name}</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 overflow-y-auto p-4">
              <label className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-medium">الكمية</span>
                <Input type="number" inputMode="numeric" min="1" max="20" value={variantQuantity} onChange={(event) => setVariantQuantity(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} className="h-9 w-24 text-center" aria-label="كمية المنتج" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {variantModal.product.variants.map((v) => (
                  <button key={v.id} type="button" className="flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-right transition-colors hover:border-primary hover:bg-primary/5 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between" onClick={() => variantModal.onConfirm(v.id, variantQuantity)}>
                    <span className="min-w-0 break-words text-sm font-medium">{v.label}</span>
                    <span className="shrink-0 text-sm font-semibold text-primary">{formatCurrency(Number(v.price))}</span>
                  </button>
                ))}
              </div>
              <div className="sticky bottom-0 mt-4 flex justify-end border-t bg-card pt-3">
                <Button variant="outline" onClick={() => setVariantModal(null)}>
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {modifierModal && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-2 sm:p-4" dir="rtl">
          <Card className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)]">
            <CardHeader className="shrink-0 border-b">
              <CardTitle className="break-words">اختر الخصائص لـ {modifierModal.product.name}</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 overflow-y-auto p-4">
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm"><span className="font-medium">الكمية</span><Input type="number" inputMode="numeric" min="1" max="20" value={modifierQuantity} onChange={(event) => setModifierQuantity(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} className="h-9 w-24 text-center" aria-label="كمية المنتج" /></label>
                {modifierModal.product.variants.length ? <div className="min-w-0 rounded-lg border p-3"><p className="mb-2 text-sm font-medium">المتغير</p><select className="h-10 w-full min-w-0 max-w-full truncate rounded border bg-background px-3" value={modifierVariantId} onChange={(event) => setModifierVariantId(event.target.value)}><option value="">اختر المتغير</option>{modifierModal.product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label} — {formatCurrency(Number(variant.price))}</option>)}</select></div> : null}
                {modifierModal.product.modifierGroups.map((group) => {
                  const selected = modifierSelectionsState[group.id] ?? []
                  return (
                    <div key={group.id} className="min-w-0 rounded-lg border p-3">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="break-words text-sm font-medium text-foreground">{group.name}</span>
                          {group.description && <p className="break-words text-xs text-muted-foreground">{group.description}</p>}
                        </div>
                        {group.isRequired ? <Badge tone="destructive">مطلوب</Badge> : <Badge tone="muted">اختياري</Badge>}
                      </div>
                      {group.maxSelections === 1 ? (
                        <div className="space-y-2">
                          {group.options.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => toggleModifierOption(group.id, opt.id, 1)}
                              disabled={!opt.isActive}
                              className={cn(
                                "flex items-center justify-between w-full rounded-lg border px-3 py-2 text-sm transition-colors",
                                selected.includes(opt.id)
                                  ? "border-primary bg-primary/10 text-primary-foreground"
                                  : opt.isActive
                                    ? "border-border bg-card text-foreground hover:bg-accent"
                                    : "border-border bg-muted/30 text-muted-foreground cursor-not-allowed",
                              )}
                            >
                              <span className="min-w-0 break-words text-right">{opt.label}</span>
                              {Number(opt.priceAdjustment) > 0 ? <span className="text-xs text-primary">+{opt.priceAdjustment}</span> : null}
                              {selected.includes(opt.id) ? <Icon name="check" size={14} /> : null}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {group.options.map((opt) => (
                            <label key={opt.id} className="flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent/40">
                              <span className="flex min-w-0 items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(opt.id)}
                                  onChange={() => toggleModifierOption(group.id, opt.id, group.maxSelections)}
                                  disabled={!opt.isActive}
                                  className="rounded border-accent text-accent"
                                />
                                <span className="min-w-0 flex-1 break-words">{opt.label}</span>
                                {Number(opt.priceAdjustment) > 0 ? <span className="text-xs text-primary">+{opt.priceAdjustment}</span> : null}
                              </span>
                              {selected.includes(opt.id) ? <Icon name="check" size={14} className="text-primary" /> : null}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t bg-card pt-3">
                <Button variant="outline" onClick={() => setModifierModal(null)}>
                  إلغاء
                </Button>
                <Button onClick={confirmModifier} disabled={!getModifierModalReady()}>
                  إضافة
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {receipt ? (
        <ThermalReceiptPreview
          invoice={receipt}
          autoPrint
          payment={{
            paid: receipt.paid,
            change: '0',
            method: receipt.payments.at(-1)?.method ?? paymentMethod,
          }}
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </div>
    {isWaiter && cartOpen ? (
      <div role="dialog" aria-modal="true" aria-label="سلة الطلب" className="fixed inset-0 z-50 grid place-items-center bg-black/50 sm:p-4" dir="rtl">
        <Card className="flex h-[100dvh] w-full flex-col overflow-hidden rounded-none sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl sm:rounded-xl">
          {cartContents}
        </Card>
      </div>
    ) : null}
    </>
  )
}

