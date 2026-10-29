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

/**
 * POS checkout â€” real branch catalog + tables from the DB.
 * Pricing is re-computed server-side on submit; client totals are a preview.
 */
export function PosCheckout({ catalog, initialTableId, takeawayOrders = [], mode = "cashier" }: { catalog: PosCatalog; initialTableId?: string; takeawayOrders?: StaffOrderRow[]; mode?: "cashier" | "waiter" }) {
  const isWaiter = mode === 'waiter'
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
  } | null>(null)
  const [variantModal, setVariantModal] = useState<{
    product: NonNullable<typeof catalog.products>[number]
    onConfirm: (variantId: string, qty: number) => void
  } | null>(null)
  const [modifierModal, setModifierModal] = useState<{
    product: NonNullable<typeof catalog.products>[number]
    variantId?: string
    onConfirm: (variantId: string | undefined, modifierSelections: Record<string, string[]>, qty: number) => void
  } | null>(null)
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

  const subtotal = cart.reduce((s, l) => s + (variantPriceById.get(`${l.id}:${l.variantId}`) ?? priceById.get(l.id) ?? 0) * l.qty, 0)
  const itemCount = cart.reduce((s, l) => s + l.qty, 0)

  function add(id: string) {
    const product = catalog.products.find((p) => p.id === id)
    if (!product) return
    if (product.modifierGroups.length > 0) {
      // Initialize modifier state with empty selections
      const initialSelections: Record<string, string[]> = {}
      product.modifierGroups.forEach((g) => { initialSelections[g.id] = [] })
      setModifierSelectionsState(initialSelections)
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
    modifierModal.onConfirm(modifierModal.variantId, selections, 1)
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
  function setLineDiscount(id: string, variantId: string | undefined, kind: 'none' | 'percentage' | 'amount', value: string) {
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
      setError('Ø§Ø®ØªØ± Ø§Ù„Ø·Ø§ÙˆÙ„Ø©')
      return
    }
    setBusy(true)
    setError(null)
    const idempotencyKey = submissionKey.current ?? crypto.randomUUID()
    submissionKey.current = idempotencyKey
    try {
      const res = await fetch('/api/staff/pos/orders', {
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
          discountType: discountType === 'none' ? undefined : discountType,
          discountValue: discountType === 'none' ? undefined : Number(discountValue || 0),
          items: cart.map((l) => ({
            productId: l.id,
            variantId: l.variantId,
            modifierSelections: Object.entries(l.modifierSelections).map(([groupId, valueIds]) => ({ groupId, valueIds })),
            qty: l.qty,
            note: l.note?.trim() || undefined,
            discountType: l.discountType,
            discountValue: l.discountValue,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø·Ù„Ø¨')
      if (orderType === 'takeaway') {
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
        if (!paymentResponse.ok) throw new Error(payment.error ?? 'ÙØ´Ù„ ØªØ­ØµÙŠÙ„ Ø·Ù„Ø¨ Ø§Ù„ØªÙŠÙƒ Ø£ÙˆØ§ÙŠØ› Ù„Ù… ÙŠÙØ±Ø³Ù„ Ù„Ù„Ù…Ø·Ø¨Ø®')
        if (payment.invoice) setReceipt(payment.invoice as InvoiceRow)
        const dispatchResponse = await fetch(`/api/staff/orders/${data.id}/send`, { method: 'POST' })
        const dispatch = await dispatchResponse.json().catch(() => ({}))
        if (!dispatchResponse.ok) {
          setDispatchRetry({ id: data.id, number: data.orderNumber })
          setError(`ØªÙ… Ø§Ù„Ø¯ÙØ¹ Ø¨Ù†Ø¬Ø§Ø­ØŒ Ù„ÙƒÙ† ØªØ¹Ø°Ø± Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨ Ù„Ù„Ù…Ø·Ø¨Ø®: ${dispatch.error ?? 'Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©'}`)
        } else setDispatchRetry(null)
        paymentKey.current = null
      }
      setPlaced({ orderNumber: data.orderNumber, total: data.total })
      skipDraftPersist.current = true
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setOrderNotes('')
      removeDraft()
      submissionKey.current = null
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø·Ù„Ø¨')
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
      if (!response.ok) throw new Error(body.error ?? 'ØªØ¹Ø°Ø± Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¥Ø±Ø³Ø§Ù„')
      setDispatchRetry(null)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¥Ø±Ø³Ø§Ù„')
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
      if (!response.ok) throw new Error(body.error ?? 'ØªØ¹Ø°Ø± ØªØ£ÙƒÙŠØ¯ ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø·Ù„Ø¨')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ£ÙƒÙŠØ¯ ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø·Ù„Ø¨')
    } finally {
      setBusy(false)
    }
  }
  const categoryOptions = [{ value: 'all', label: 'Ø§Ù„ÙƒÙ„' }, ...catalog.categories.map((c) => ({ value: c.id, label: c.name }))]
  const tableOptions = catalog.tables.map((t) => ({
    value: t.id,
    label: t.name ? `${t.number} Â· ${t.name}` : `Ø·Ø§ÙˆÙ„Ø© ${t.number}`,
    icon: 'tables' as const,
  }))

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-3">
        <Input icon="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ù…Ù†ØªØ¬â€¦" aria-label="Ø¨Ø­Ø« Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª" />
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {categoryOptions.map((c) => (
            <button key={c.value} type="button" onClick={() => setCategory(c.value)} aria-pressed={category === c.value} className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors', category === c.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent')}>
              {c.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon="products" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù†ØªØ¬Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø©" description="Ø¬Ø±Ù‘Ø¨ Ø¨Ø­Ø«Ø§Ù‹ Ø£Ùˆ ØªØµÙ†ÙŠÙØ§Ù‹ Ø¢Ø®Ø±." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const variantPrice = p.variants.length > 0 ? Math.min(...p.variants.map((v) => Number(v.price))) : Number(p.price)
              return (
                <button key={p.id} type="button" disabled={!p.isAvailable} onClick={() => add(p.id)} className={cn('flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-4 text-center', p.isAvailable ? 'hover:border-primary/50 hover:bg-accent/40' : 'cursor-not-allowed opacity-50')}>
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  {p.variants.length > 0 ? <span className="text-xs text-muted-foreground">Ø§Ø®ØªØ± Ù…ØªØºÙŠØ±</span> : <span className="text-xs text-muted-foreground">{p.categoryName}</span>}
                  <span className="text-sm font-semibold text-primary">{formatCurrency(variantPrice)}</span>
                  {!p.isAvailable ? <Badge tone="muted">ØºÙŠØ± Ù…ØªÙˆÙØ±</Badge> : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Card className="flex h-fit flex-col lg:sticky lg:top-24">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Ø§Ù„Ø³Ù„Ø©</CardTitle>
          {cart.length ? (
            <Button variant="ghost" size="sm" onClick={clear} className="text-destructive">
              <Icon name="trash" size={16} /> Ø¥ÙØ±Ø§Øº
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Segmented
            options={[
              { value: 'dine_in', label: 'Ø¯Ø§Ø®Ù„ Ø§Ù„ÙƒØ§ÙÙŠÙ‡' },
              { value: 'takeaway', label: 'ØªÙŠÙƒ Ø£ÙˆØ§ÙŠ' },
            ]}
            value={orderType}
            onChange={(value) => setOrderType(value as 'dine_in' | 'takeaway')}
            ariaLabel="Ù†ÙˆØ¹ Ø§Ù„Ø·Ù„Ø¨"
          />
          {orderType === 'dine_in' ? <Dropdown label="Ø§Ù„Ø·Ø§ÙˆÙ„Ø©" options={tableOptions} value={tableId} onChange={setTableId} className="w-full" /> : <Badge tone="warning">ØªÙŠÙƒ Ø£ÙˆØ§ÙŠ Â· Ø§Ù„Ø¯ÙØ¹ Ø¥Ù„Ø²Ø§Ù…ÙŠ Ù‚Ø¨Ù„ Ø§Ù„Ù…Ø·Ø¨Ø®</Badge>}
          <Input icon="customers" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" aria-label="Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„" />
          <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={30} placeholder="Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" aria-label="Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" />
          <Input value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} maxLength={2000} placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„Ø·Ù„Ø¨ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" />
          {dispatchRetry ? (
            <Button variant="secondary" disabled={busy} onClick={() => void retryDispatch()}>
              Ø¥Ø¹Ø§Ø¯Ø© Ø¥Ø±Ø³Ø§Ù„ {dispatchRetry.number} Ù„Ù„Ù…Ø·Ø¨Ø® Ø¨Ø¯ÙˆÙ† Ø¯ÙØ¹ Ø¬Ø¯ÙŠØ¯
            </Button>
          ) : null}
          {placed ? (
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø·Ù„Ø¨ {placed.orderNumber} Â· {formatCurrency(Number(placed.total))}
            </p>
          ) : null}
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {cart.length === 0 ? (
            <EmptyState icon="pos" title="Ø§Ù„Ø³Ù„Ø© ÙØ§Ø±ØºØ©" description="Ø§Ø®ØªØ± Ù…Ù†ØªØ¬Ø§Øª Ù„Ø¥Ø¶Ø§ÙØªÙ‡Ø§." />
          ) : (
            <ul className="flex flex-col gap-2">
              {cart.map((l) => {
                const p = catalog.products.find((x) => x.id === l.id)!
                const v = l.variantId ? p.variants.find((x) => x.id === l.variantId) : null
                const unitPrice = v ? Number(v.price) : Number(p.price)
                const label = v ? `${p.name} â€” ${v.label}` : p.name
                const modifierLabels = Object.entries(l.modifierSelections).flatMap(([groupId, valueIds]) => {
                  const group = p.modifierGroups.find((g) => g.id === groupId)
                  if (!group) return []
                  return valueIds.map((vid) => {
                    const opt = group.options.find((o) => o.id === vid)
                    return opt ? `${group.name}: ${opt.label}` : ''
                  }).filter(Boolean)
                })
                const fullLabel = modifierLabels.length ? `${label} â€” ${modifierLabels.join(', ')}` : label
                return (
                  <li key={`${l.id}:${l.variantId ?? 'base'}:${JSON.stringify(l.modifierSelections)}`} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                      <span className="truncate text-sm font-medium text-foreground">{fullLabel}</span>
                      <span className="text-xs text-muted-foreground">{formatCurrency(unitPrice * l.qty)}</span>
                      <Input value={l.note ?? ''} onChange={(e) => setNote(l.id, l.variantId, l.modifierSelections, e.target.value)} maxLength={255} placeholder="Ù…Ù„Ø§Ø­Ø¸Ø© Ù„Ù„ØµÙ†Ù (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" aria-label={`Ù…Ù„Ø§Ø­Ø¸Ø© ${label}`} className="h-8 text-xs" />
                      <div className="grid grid-cols-2 gap-1">
                        <select value={l.discountType ?? 'none'} onChange={(event) => setLineDiscount(l.id, l.variantId, l.modifierSelections, event.target.value as 'none' | 'percentage' | 'amount', String(l.discountValue ?? ''))} className="h-8 rounded border bg-background px-2 text-xs" aria-label={`Ø®ØµÙ… ${label}`}>
                          <option value="none">Ø¨Ø¯ÙˆÙ† Ø®ØµÙ…</option>
                          <option value="percentage">Ø®ØµÙ… %</option>
                          <option value="amount">Ø®ØµÙ… Ù…Ø¨Ù„Øº</option>
                        </select>
                        {l.discountType ? <Input value={String(l.discountValue ?? '')} onChange={(event) => setLineDiscount(l.id, l.variantId, l.modifierSelections, l.discountType ?? 'none', event.target.value)} inputMode="decimal" className="h-8 text-xs" /> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => dec(l.id, l.variantId, l.modifierSelections)} aria-label="Ø¥Ù†Ù‚Ø§Øµ">
                        <Icon name="minus" size={14} />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => inc(l.id, l.variantId, l.modifierSelections)} aria-label="Ø²ÙŠØ§Ø¯Ø©">
                        <Icon name="plus" size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(l.id, l.variantId, l.modifierSelections)} aria-label={`Ø¥Ø²Ø§Ù„Ø© ${fullLabel} Ù…Ù† Ø§Ù„Ø³Ù„Ø©`}>
                        <Icon name="trash" size={14} />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3 text-base font-bold">
            <span className="text-foreground">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</span>
            <span className="text-primary">{formatCurrency(subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)} className="rounded-lg border bg-background p-2 text-sm">
              <option value="none">Ø¨Ø¯ÙˆÙ† Ø®ØµÙ… Ø¹Ø§Ù…</option>
              <option value="percentage">Ø®ØµÙ… Ø¹Ø§Ù… %</option>
              <option value="amount">Ø®ØµÙ… Ø¹Ø§Ù… Ù…Ø¨Ù„Øº</option>
            </select>
            {discountType !== 'none' ? <Input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="Ù‚ÙŠÙ…Ø© Ø§Ù„Ø®ØµÙ…" /> : null}
          </div>
          {orderType === 'takeaway' ? (
            <div className="space-y-2 rounded-lg border p-3">
              <select
                value={paymentMethod}
                onChange={(event) => {
                  setPaymentMethod(event.target.value as typeof paymentMethod)
                  setElectronicConfirmed(false)
                }}
                className="w-full rounded-lg border bg-background p-2"
              >
                <option value="cash">Ù†Ù‚Ø¯ÙŠ</option>
                <option value="mobile_wallet">Ù…Ø­ÙØ¸Ø© Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ©</option>
                <option value="instapay">Ø¥Ù†Ø³ØªØ§ Ø¨Ø§ÙŠ</option>
              </select>
              {paymentMethod === 'cash' ? (
                <Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder="Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³ØªÙ„Ù…" />
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={electronicConfirmed} onChange={(event) => setElectronicConfirmed(event.target.checked)} />
                  Ø£Ø¤ÙƒØ¯ Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø¯ÙØ¹ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ
                </label>
              )}
            </div>
          ) : null}
          <Button size="lg" className="w-full" disabled={!cart.length || busy} onClick={checkout}>
            <Icon name="check" size={18} />
            {busy ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø­ÙØ¸â€¦' : 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø·Ù„Ø¨'}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">{formatNumber(itemCount)} ØµÙ†Ù Â· Ø§Ù„Ø³Ø¹Ø± Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ ÙŠÙØ­Ø³Ø¨ Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª</p>
        </CardContent>
      </Card>
      <section className="rounded-xl border bg-card p-4 lg:col-span-2" aria-label="Ù…ØªØ§Ø¨Ø¹Ø© Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªÙŠÙƒ Ø£ÙˆØ§ÙŠ">
          <h2 className="mb-3 font-bold">Ù…ØªØ§Ø¨Ø¹Ø© Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªÙŠÙƒ Ø£ÙˆØ§ÙŠ</h2>
          {takeawayOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª ØªÙŠÙƒ Ø£ÙˆØ§ÙŠ Ù…Ø¯ÙÙˆØ¹Ø© Ø­Ø§Ù„ÙŠÙ‹Ø§.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {takeawayOrders.map((order) => (
                <div key={order.id} className="rounded-lg border p-3">
                  <div className="flex justify-between gap-2">
                    <strong>{order.number}</strong>
                    <Badge tone={order.status === 'ready' ? 'success' : order.status === 'preparing' ? 'warning' : 'muted'}>{order.status === 'new' ? 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„ØªØ­Ø¶ÙŠØ±' : order.status === 'preparing' ? 'Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ø¶ÙŠØ±' : order.status === 'ready' ? 'Ø¬Ø§Ù‡Ø² Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù…' : 'ØªÙ… Ø§Ù„ØªØ³Ù„ÙŠÙ…'}</Badge>
                  </div>
                  {order.customerName ? <p className="mt-1 text-xs text-muted-foreground">{order.customerName}</p> : null}
                  {order.status === 'ready' ? (
                    <Button className="mt-2 w-full" size="sm" disabled={busy} onClick={() => void handover(order)}>
                      ØªØ£ÙƒÙŠØ¯ Ø§Ù„ØªØ³Ù„ÙŠÙ… Ù„Ù„Ø¹Ù…ÙŠÙ„
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

      {variantModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Ø§Ø®ØªØ± Ù…ØªØºÙŠØ± Ù„Ù€ {variantModal.product.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {variantModal.product.variants.map((v) => (
                  <div key={v.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="text-sm font-medium">{v.label}</span>
                      <span className="text-sm font-semibold text-primary">{formatCurrency(Number(v.price))}</span>
                    </div>
                    <Input type="number" inputMode="numeric" min="1" max="20" value="1" onChange={() => {}} className="w-20 h-8 text-sm" aria-label={`ÙƒÙ…ÙŠØ© ${v.label}`} />
                    <Button variant="outline" size="sm" className="w-auto mt-2" onClick={() => variantModal.onConfirm(v.id, 1)}>
                      Ø¥Ø¶Ø§ÙØ©
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={() => setVariantModal(null)}>
                  Ø¥Ù„ØºØ§Ø¡
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {modifierModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Ø§Ø®ØªØ± Ø§Ù„Ø®ØµØ§Ø¦Øµ Ù„Ù€ {modifierModal.product.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-4">
                {modifierModal.product.modifierGroups.map((group) => {
                  const selected = modifierSelectionsState[group.id] ?? []
                  return (
                    <div key={group.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-sm font-medium text-foreground">{group.name}</span>
                          {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
                        </div>
                        <Badge variant="destructive">Ù…Ø·Ù„ÙˆØ¨</Badge>
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
                              <span>{opt.label}</span>
                              {Number(opt.priceAdjustment) > 0 ? <span className="text-xs text-primary">+{opt.priceAdjustment}</span> : null}
                              {selected.includes(opt.id) ? <Icon name="check" size={14} /> : null}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {group.options.map((opt) => (
                            <label key={opt.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-accent/40">
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(opt.id)}
                                  onChange={() => toggleModifierOption(group.id, opt.id, group.maxSelections)}
                                  disabled={!opt.isActive}
                                  className="rounded border-accent text-accent"
                                />
                                <span className="flex-1">{opt.label}</span>
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
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setModifierModal(null)}>
                  Ø¥Ù„ØºØ§Ø¡
                </Button>
                <Button onClick={confirmModifier} disabled={!getModifierModalReady()}>
                  Ø¥Ø¶Ø§ÙØ©
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
  )
}

