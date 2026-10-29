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
 * POS checkout — real branch catalog + tables from the DB.
 * Pricing is re-computed server-side on submit; client totals are a preview.
 */
export function PosCheckout({ catalog, initialTableId, takeawayOrders = [] }: { catalog: PosCatalog; initialTableId?: string; takeawayOrders?: StaffOrderRow[] }) {
  const router = useRouter()
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<
    {
      id: string
      variantId?: string
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
      }
    } catch {
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
      window.localStorage.setItem(draftKey, JSON.stringify({ cart, tableId, customerName, customerPhone }))
    } catch {
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
    if (product.variants.length > 0) {
      setVariantModal({
        product,
        onConfirm: (variantId, qty) => {
          setCart((prev) => {
            const ex = prev.find((l) => l.id === id && l.variantId === variantId)
            if (ex) return prev.map((l) => (l.id === id && l.variantId === variantId ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
            return [...prev, { id, variantId, qty }]
          })
          setVariantModal(null)
        },
      })
      return
    }
    setPlaced(null)
    setCart((prev) => {
      const ex = prev.find((l) => l.id === id && !l.variantId)
      if (ex) return prev.map((l) => (l.id === id && !l.variantId ? { ...l, qty: Math.min(20, l.qty + 1) } : l))
      return [...prev, { id, qty: 1 }]
    })
  }
  function inc(id: string, variantId?: string) {
    setCart((prev) => prev.map((l) => (l.id === id && l.variantId === variantId ? { ...l, qty: Math.min(20, l.qty + 1) } : l)))
  }
  function dec(id: string, variantId?: string) {
    setCart((prev) => prev.map((l) => (l.id === id && l.variantId === variantId ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0))
  }
  function setNote(id: string, variantId: string | undefined, note: string) {
    setCart((prev) => prev.map((line) => (line.id === id && line.variantId === variantId ? { ...line, note } : line)))
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
  function remove(id: string, variantId?: string) {
    setCart((previous) => previous.filter((l) => l.id !== id || l.variantId !== variantId))
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
            qty: l.qty,
            note: l.note?.trim() || undefined,
            discountType: l.discountType,
            discountValue: l.discountValue,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'فشل إنشاء الطلب')
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-3">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const variantPrice = p.variants.length > 0 ? Math.min(...p.variants.map((v) => Number(v.price))) : Number(p.price)
              return (
                <button key={p.id} type="button" disabled={!p.isAvailable} onClick={() => add(p.id)} className={cn('flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-4 text-center', p.isAvailable ? 'hover:border-primary/50 hover:bg-accent/40' : 'cursor-not-allowed opacity-50')}>
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  {p.variants.length > 0 ? <span className="text-xs text-muted-foreground">اختر متغير</span> : <span className="text-xs text-muted-foreground">{p.categoryName}</span>}
                  <span className="text-sm font-semibold text-primary">{formatCurrency(variantPrice)}</span>
                  {!p.isAvailable ? <Badge tone="muted">غير متوفر</Badge> : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Card className="flex h-fit flex-col lg:sticky lg:top-24">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>السلة</CardTitle>
          {cart.length ? (
            <Button variant="ghost" size="sm" onClick={clear} className="text-destructive">
              <Icon name="trash" size={16} /> إفراغ
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Segmented
            options={[
              { value: 'dine_in', label: 'داخل الكافيه' },
              { value: 'takeaway', label: 'تيك أواي' },
            ]}
            value={orderType}
            onChange={(value) => setOrderType(value as 'dine_in' | 'takeaway')}
            ariaLabel="نوع الطلب"
          />
          {orderType === 'dine_in' ? <Dropdown label="الطاولة" options={tableOptions} value={tableId} onChange={setTableId} className="w-full" /> : <Badge tone="warning">تيك أواي · الدفع إلزامي قبل المطبخ</Badge>}
          <Input icon="customers" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اسم العميل (اختياري)" aria-label="اسم العميل" />
          <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={30} placeholder="رقم الهاتف (اختياري)" aria-label="رقم الهاتف (اختياري)" />
          <Input value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} maxLength={2000} placeholder="ملاحظات الطلب (اختياري)" />
          {dispatchRetry ? (
            <Button variant="secondary" disabled={busy} onClick={() => void retryDispatch()}>
              إعادة إرسال {dispatchRetry.number} للمطبخ بدون دفع جديد
            </Button>
          ) : null}
          {placed ? (
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              تم إنشاء الطلب {placed.orderNumber} · {formatCurrency(Number(placed.total))}
            </p>
          ) : null}
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {cart.length === 0 ? (
            <EmptyState icon="pos" title="السلة فارغة" description="اختر منتجات لإضافتها." />
          ) : (
            <ul className="flex flex-col gap-2">
              {cart.map((l) => {
                const p = catalog.products.find((x) => x.id === l.id)!
                const v = l.variantId ? p.variants.find((x) => x.id === l.variantId) : null
                const unitPrice = v ? Number(v.price) : Number(p.price)
                const label = v ? `${p.name} — ${v.label}` : p.name
                return (
                  <li key={`${l.id}:${l.variantId ?? 'base'}`} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                      <span className="truncate text-sm font-medium text-foreground">{label}</span>
                      <span className="text-xs text-muted-foreground">{formatCurrency(unitPrice * l.qty)}</span>
                      <Input value={l.note ?? ''} onChange={(e) => setNote(l.id, l.variantId, e.target.value)} maxLength={255} placeholder="ملاحظة للصنف (اختياري)" aria-label={`ملاحظة ${label}`} className="h-8 text-xs" />
                      <div className="grid grid-cols-2 gap-1">
                        <select value={l.discountType ?? 'none'} onChange={(event) => setLineDiscount(l.id, l.variantId, event.target.value as 'none' | 'percentage' | 'amount', String(l.discountValue ?? ''))} className="h-8 rounded border bg-background px-2 text-xs" aria-label={`خصم ${label}`}>
                          <option value="none">بدون خصم</option>
                          <option value="percentage">خصم %</option>
                          <option value="amount">خصم مبلغ</option>
                        </select>
                        {l.discountType ? <Input value={String(l.discountValue ?? '')} onChange={(event) => setLineDiscount(l.id, l.variantId, l.discountType ?? 'none', event.target.value)} inputMode="decimal" className="h-8 text-xs" /> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => dec(l.id, l.variantId)} aria-label="إنقاص">
                        <Icon name="minus" size={14} />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => inc(l.id, l.variantId)} aria-label="زيادة">
                        <Icon name="plus" size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(l.id, l.variantId)} aria-label={`إزالة ${label} من السلة`}>
                        <Icon name="trash" size={14} />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3 text-base font-bold">
            <span className="text-foreground">الإجمالي</span>
            <span className="text-primary">{formatCurrency(subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)} className="rounded-lg border bg-background p-2 text-sm">
              <option value="none">بدون خصم عام</option>
              <option value="percentage">خصم عام %</option>
              <option value="amount">خصم عام مبلغ</option>
            </select>
            {discountType !== 'none' ? <Input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" placeholder="قيمة الخصم" /> : null}
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
                <option value="cash">نقدي</option>
                <option value="mobile_wallet">محفظة إلكترونية</option>
                <option value="instapay">إنستا باي</option>
              </select>
              {paymentMethod === 'cash' ? (
                <Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder="المبلغ المستلم" />
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={electronicConfirmed} onChange={(event) => setElectronicConfirmed(event.target.checked)} />
                  أؤكد استلام الدفع الإلكتروني
                </label>
              )}
            </div>
          ) : null}
          <Button size="lg" className="w-full" disabled={!cart.length || busy} onClick={checkout}>
            <Icon name="check" size={18} />
            {busy ? 'جاري الحفظ…' : orderType === 'takeaway' ? 'تحصيل وإرسال للمطبخ' : 'تأكيد الطلب'}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">{formatNumber(itemCount)} صنف · السعر النهائي يُحسب من قاعدة البيانات</p>
        </CardContent>
      </Card>
      <section className="rounded-xl border bg-card p-4 lg:col-span-2" aria-label="متابعة طلبات التيك أواي">
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
      </section>
      {variantModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>اختر متغير لـ {variantModal.product.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {variantModal.product.variants.map((v) => (
                  <div key={v.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="text-sm font-medium">{v.label}</span>
                      <span className="text-sm font-semibold text-primary">{formatCurrency(Number(v.price))}</span>
                    </div>
                    <Input type="number" inputMode="numeric" min="1" max="20" value="1" onChange={() => {}} className="w-20 h-8 text-sm" aria-label={`كمية ${v.label}`} />
                    <Button variant="outline" size="sm" className="w-auto mt-2" onClick={() => variantModal.onConfirm(v.id, 1)}>
                      إضافة
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={() => setVariantModal(null)}>
                  إلغاء
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
