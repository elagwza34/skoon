'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { PublicBackdrop } from '@/components/public/public-backdrop'
import { saveGuestOrder } from '@/lib/guest-orders'
import type { PublicMenu } from '@/lib/public-menu'

interface CartLine {
  productId: string
  qty: number
}

const egp = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(n)

/**
 * Customer menu + cart + order submit for one table token.
 * Prices shown come from the server; the submit API re-prices from the DB.
 *
 * Styled with the café premium palette: Espresso, Mocha, Caramel, Cream.
 */
export function MenuOrderView({ menu }: { menu: PublicMenu }) {
  const router = useRouter()
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [serviceBusy, setServiceBusy] = useState<string | null>(null)
  const [serviceMessage, setServiceMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!cartOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [cartOpen])

  const priceById = useMemo(() => new Map(menu.products.map((p) => [p.id, Number(p.price)])), [menu.products])

  const visible = useMemo(() => {
    const q = query.trim()
    return menu.products.filter((p) => {
      if (category !== 'all' && p.categoryId !== category) return false
      if (q && !p.name.includes(q)) return false
      return true
    })
  }, [menu.products, category, query])

  const total = useMemo(
    () => cart.reduce((s, l) => s + (priceById.get(l.productId) ?? 0) * l.qty, 0),
    [cart, priceById],
  )
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart])

  function add(productId: string) {
    setCart((prev) => {
      const ex = prev.find((l) => l.productId === productId)
      if (ex) return prev.map((l) => (l.productId === productId ? { ...l, qty: Math.min(20, l.qty + 1) } : l))
      return [...prev, { productId, qty: 1 }]
    })
  }

  function dec(productId: string) {
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0),
    )
  }

  async function submit() {
    if (!name.trim() || cart.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: menu.table.token,
          customerName: name.trim(),
          customerPhone: phone.trim() || undefined,
          items: cart.map((l) => ({ productId: l.productId, qty: l.qty, note: note.trim() || undefined })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Order failed')
      if (typeof data?.id !== 'string' || typeof data?.orderNumber !== 'string') {
        throw new Error('Order failed')
      }
      saveGuestOrder({ id: data.id, orderNumber: data.orderNumber })
      router.push(`/order/${encodeURIComponent(data.id)}?n=${encodeURIComponent(data.orderNumber)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order failed')
      setBusy(false)
    }
  }

  async function requestService(type: 'waiter_call' | 'bill' | 'water' | 'utensils' | 'assistance' | 'complaint') {
    if (serviceBusy) return
    setServiceBusy(type); setServiceMessage(null)
    try {
      const response = await fetch('/api/public/service-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: menu.table.token, type }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'تعذر إرسال الطلب')
      setServiceMessage('تم إرسال طلبك للفريق.')
    } catch (cause) { setServiceMessage(cause instanceof Error ? cause.message : 'تعذر إرسال الطلب') } finally { setServiceBusy(null) }
  }

  return (
    <div dir="rtl" className="relative min-h-dvh overflow-x-hidden bg-cafe-espresso">
      {/* Same brand backdrop as the rest of the guest flow. */}
      <PublicBackdrop />

      <div className="relative z-20 mx-auto flex max-w-5xl flex-wrap gap-2 px-4 pt-3 sm:px-6">
        {([['waiter_call', 'نادِ النادل'], ['bill', 'اطلب الحساب'], ['water', 'ماء'], ['utensils', 'أدوات'], ['assistance', 'مساعدة'], ['complaint', 'شكوى']] as const).map(([type, label]) => (
          <Button
            key={type}
            size="sm"
            variant="outline"
            disabled={!!serviceBusy}
            onClick={() => void requestService(type)}
            className="border-cafe-caramel/50 text-cafe-cream hover:bg-cafe-caramel/10 hover:text-cafe-caramel"
          >
            {serviceBusy === type ? 'جارٍ الإرسال…' : label}
          </Button>
        ))}
        {serviceMessage ? <span className="self-center text-xs text-cafe-caramel">{serviceMessage}</span> : null}
      </div>

      {/* Sticky basket bar — always visible at the top; tap to review + submit. */}
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className={cn(
          'sticky top-0 z-30 flex w-full items-center justify-between gap-3 px-4 py-3 text-start shadow-lg transition-colors sm:px-6',
          itemCount > 0 ? 'bg-cafe-caramel text-cafe-espresso' : 'bg-cafe-mocha/80 text-cafe-cream/80',
        )}
        aria-label="فتح سلة الطلب"
      >
        <span className="flex items-center gap-2">
          <Icon name="cart" size={20} />
          <span className="font-semibold">سلة الطلب</span>
          <span
            className={cn(
              'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold',
              itemCount > 0 ? 'bg-cafe-cream text-cafe-espresso' : 'bg-white/10 text-cafe-cream/60',
            )}
          >
            {itemCount}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {egp(total)}
          <Icon name="chevronLeft" size={16} />
        </span>
      </button>

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-28 sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs text-cafe-cream/60">{menu.table.branchName}</span>
            <span className="text-lg font-bold text-cafe-cream">طاولة {menu.table.number} · {menu.table.capacity} مقاعد</span>
          </div>
          <Link href="/order-type" className="text-sm text-cafe-cream/90 hover:text-cafe-caramel transition-colors">
            تغيير
          </Link>
        </header>

        {/* Search */}
        <Input
          icon="search"
          placeholder="دور على صنف…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-cafe-mocha/30 bg-cafe-mocha/40 text-cafe-cream placeholder:text-cafe-cream/50"
        />

        {/* Categories */}
        <Segmented
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'الكل' },
            ...menu.categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
          className="border-cafe-mocha/30 bg-cafe-mocha/40 [&>button]:text-cafe-cream/70 [&>button[aria-pressed=true]]:bg-cafe-caramel [&>button[aria-pressed=true]]:text-cafe-espresso"
        />

        {/* Products */}
        {visible.length === 0 ? (
          <EmptyState title="مفيش نتائج" description="جرّب كلمة تانية أو اختار تصنيف مختلف." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => {
              const inCart = cart.find((l) => l.productId === p.id)
              return (
                <Card key={p.id} className="flex flex-col justify-between border-cafe-mocha/30 bg-cafe-mocha/30 text-cafe-cream hover:border-cafe-caramel/50 transition-all">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-cafe-cream">{p.name}</h3>
                      <span className="shrink-0 text-sm font-semibold text-cafe-caramel">
                        {egp(Number(p.price))}
                      </span>
                    </div>
                    {p.description ? (
                      <p className="line-clamp-2 text-sm text-cafe-cream/60">{p.description}</p>
                    ) : null}
                  </CardContent>
                  <CardFooter className="justify-end">
                    {inCart ? (
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" onClick={() => dec(p.id)} aria-label="إنقاص" className="border-cafe-mocha/40 bg-cafe-mocha/40 text-cafe-cream hover:bg-cafe-mocha/60">
                          <Icon name="minus" size={16} />
                        </Button>
                        <span className="w-8 text-center font-semibold">{inCart.qty}</span>
                        <Button size="icon" variant="outline" onClick={() => add(p.id)} aria-label="زيادة" className="border-cafe-mocha/40 bg-cafe-mocha/40 text-cafe-cream hover:bg-cafe-mocha/60">
                          <Icon name="plus" size={16} />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => add(p.id)} className="bg-cafe-caramel text-cafe-espresso hover:bg-cafe-caramel/90">
                        <Icon name="plus" size={16} />
                        أضف
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart popup — reviews lines + collects name (required) & phone (optional). */}
      {cartOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="إغلاق"
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setCartOpen(false)}
          />
          <div className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-cafe-espresso text-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[#4a5568] px-4 py-3">
              <h2 className="text-base font-bold text-white">طلبك ({itemCount})</h2>
              <Button size="icon" variant="ghost" onClick={() => setCartOpen(false)} aria-label="إغلاق" className="text-white">
                <Icon name="close" size={18} />
              </Button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">سلتك فاضية — ضيف أصناف من المنيو.</p>
              ) : (
                cart.map((l) => {
                  const p = menu.products.find((x) => x.id === l.productId)!
                  return (
                    <div key={l.productId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="flex items-center gap-2">
                        <Button size="icon" variant="outline" onClick={() => dec(l.productId)} aria-label="إنقاص" className="h-7 w-7">
                          <Icon name="minus" size={14} />
                        </Button>
                        <span className="w-6 text-center font-semibold">{l.qty}</span>
                        <Button size="icon" variant="outline" onClick={() => add(l.productId)} aria-label="زيادة" className="h-7 w-7">
                          <Icon name="plus" size={14} />
                        </Button>
                        <span className="w-20 text-end font-medium">{egp((priceById.get(l.productId) ?? 0) * l.qty)}</span>
                      </span>
                    </div>
                  )
                })
              )}

              <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">اسمك <span className="text-destructive">*</span></span>
                  <Input placeholder="اسمك" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">رقم الهاتف <span className="text-xs text-muted-foreground">(اختياري)</span></span>
                  <Input icon="phone" type="tel" placeholder="01xxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">ملاحظة <span className="text-xs text-muted-foreground">(اختياري)</span></span>
                  <Input placeholder="ملاحظة للطلب" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
              <div className="flex items-center justify-between font-semibold">
                <span>الإجمالي</span>
                <span>{egp(total)}</span>
              </div>
              <Button size="lg" onClick={submit} disabled={busy || !name.trim() || cart.length === 0}>
                {busy ? <Icon name="clock" size={18} /> : <Icon name="check" size={18} />}
                {busy ? 'جاري الإرسال…' : 'إرسال الطلب'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
