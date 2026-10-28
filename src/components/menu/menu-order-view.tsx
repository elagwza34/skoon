'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
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
 * UX: a sticky basket bar pins to the top and tracks the running total. Tapping
 * it opens a popup that reviews the lines and collects the customer name
 * (required) and phone (optional) before submitting.
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

  // Lock body scroll while the cart popup is open.
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
      // Persist so the customer can resume tracking after leaving the site.
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
      if (!response.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨')
      setServiceMessage('ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨Ùƒ Ù„Ù„ÙØ±ÙŠÙ‚.')
    } catch (cause) { setServiceMessage(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨') } finally { setServiceBusy(null) }
  }

  return (
    <div dir="rtl" className="relative min-h-dvh overflow-x-hidden text-white">
      {/* Same brand backdrop as the rest of the guest flow. */}
      <PublicBackdrop />

      <div className="relative z-20 mx-auto flex max-w-5xl flex-wrap gap-2 px-4 pt-3 sm:px-6">
        {([['waiter_call', 'Ù†Ø§Ø¯Ù Ø§Ù„Ù†Ø§Ø¯Ù„'], ['bill', 'Ø§Ø·Ù„Ø¨ Ø§Ù„Ø­Ø³Ø§Ø¨'], ['water', 'Ù…Ø§Ø¡'], ['utensils', 'Ø£Ø¯ÙˆØ§Øª'], ['assistance', 'Ù…Ø³Ø§Ø¹Ø¯Ø©'], ['complaint', 'Ø´ÙƒÙˆÙ‰']] as const).map(([type, label]) => <Button key={type} size="sm" variant="secondary" disabled={!!serviceBusy} onClick={() => void requestService(type)}>{serviceBusy === type ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ø±Ø³Ø§Ù„â€¦' : label}</Button>)}
        {serviceMessage ? <span className="self-center text-xs">{serviceMessage}</span> : null}
      </div>

      {/* Sticky basket bar â€” always visible at the top; tap to review + submit. */}
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className={cn(
          'sticky top-0 z-30 flex w-full items-center justify-between gap-3 px-4 py-3 text-start shadow-lg transition-colors sm:px-6',
          itemCount > 0 ? 'bg-orange-500 text-white' : 'bg-black/40 text-white/70',
        )}
        aria-label="ÙØªØ­ Ø³Ù„Ø© Ø§Ù„Ø·Ù„Ø¨"
      >
        <span className="flex items-center gap-2">
          <Icon name="cart" size={20} />
          <span className="font-semibold">Ø³Ù„Ø© Ø§Ù„Ø·Ù„Ø¨</span>
          <span
            className={cn(
              'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold',
              itemCount > 0 ? 'bg-white text-orange-600' : 'bg-white/20 text-white/80',
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
            <span className="text-xs text-white/70">{menu.table.branchName}</span>
            <span className="text-lg font-bold">Ø·Ø§ÙˆÙ„Ø© {menu.table.number} Â· {menu.table.capacity} Ù…Ù‚Ø§Ø¹Ø¯</span>
          </div>
          <Link href="/order-type" className="text-sm text-white/90 hover:underline">
            ØªØºÙŠÙŠØ±
          </Link>
        </header>

        {/* Search */}
        <Input
          icon="search"
          placeholder="Ø¯ÙˆØ± Ø¹Ù„Ù‰ ØµÙ†Ùâ€¦"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-white/20 bg-white/10 text-white placeholder:text-white/60"
        />

        {/* Categories */}
        <Segmented
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'Ø§Ù„ÙƒÙ„' },
            ...menu.categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
          className="border-white/20 bg-white/10 [&>button]:text-white/70 [&>button[aria-pressed=true]]:bg-white [&>button[aria-pressed=true]]:text-purple-900"
        />

        {/* Products */}
        {visible.length === 0 ? (
          <EmptyState title="Ù…ÙÙŠØ´ Ù†ØªØ§Ø¦Ø¬" description="Ø¬Ø±Ù‘Ø¨ ÙƒÙ„Ù…Ø© ØªØ§Ù†ÙŠØ© Ø£Ùˆ Ø§Ø®ØªØ§Ø± ØªØµÙ†ÙŠÙ Ù…Ø®ØªÙ„Ù." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visible.map((p) => {
              const inCart = cart.find((l) => l.productId === p.id)
              return (
                <Card key={p.id} className="flex flex-col justify-between border-white/20 bg-white/10 text-white">
                  <CardContent className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{p.name}</h3>
                      <span className="shrink-0 text-sm font-semibold text-orange-300">
                        {egp(Number(p.price))}
                      </span>
                    </div>
                    {p.description ? (
                      <p className="line-clamp-2 text-sm text-white/70">{p.description}</p>
                    ) : null}
                  </CardContent>
                  <CardFooter className="justify-end">
                    {inCart ? (
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" onClick={() => dec(p.id)} aria-label="Ø¥Ù†Ù‚Ø§Øµ" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                          <Icon name="minus" size={16} />
                        </Button>
                        <span className="w-8 text-center font-semibold">{inCart.qty}</span>
                        <Button size="icon" variant="outline" onClick={() => add(p.id)} aria-label="Ø²ÙŠØ§Ø¯Ø©" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                          <Icon name="plus" size={16} />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => add(p.id)} className="bg-white text-purple-900 hover:bg-orange-400 hover:text-purple-900">
                        <Icon name="plus" size={16} />
                        Ø£Ø¶Ù
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart popup â€” reviews lines + collects name (required) & phone (optional). */}
      {cartOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Ø¥ØºÙ„Ø§Ù‚"
            className="absolute inset-0 bg-black/60"
            onClick={() => setCartOpen(false)}
          />
          <div className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-card text-foreground shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-bold">Ø·Ù„Ø¨Ùƒ ({itemCount})</h2>
              <Button size="icon" variant="ghost" onClick={() => setCartOpen(false)} aria-label="Ø¥ØºÙ„Ø§Ù‚">
                <Icon name="close" size={18} />
              </Button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Ø³Ù„ØªÙƒ ÙØ§Ø¶ÙŠØ© â€” Ø¶ÙŠÙ Ø£ØµÙ†Ø§Ù Ù…Ù† Ø§Ù„Ù…Ù†ÙŠÙˆ.</p>
              ) : (
                cart.map((l) => {
                  const p = menu.products.find((x) => x.id === l.productId)!
                  return (
                    <div key={l.productId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="flex items-center gap-2">
                        <Button size="icon" variant="outline" onClick={() => dec(l.productId)} aria-label="Ø¥Ù†Ù‚Ø§Øµ" className="h-7 w-7">
                          <Icon name="minus" size={14} />
                        </Button>
                        <span className="w-6 text-center font-semibold">{l.qty}</span>
                        <Button size="icon" variant="outline" onClick={() => add(l.productId)} aria-label="Ø²ÙŠØ§Ø¯Ø©" className="h-7 w-7">
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
                  <span className="font-medium">Ø§Ø³Ù…Ùƒ <span className="text-destructive">*</span></span>
                  <Input placeholder="Ø§Ø³Ù…Ùƒ" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ <span className="text-xs text-muted-foreground">(Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span></span>
                  <Input icon="phone" type="tel" placeholder="01xxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Ù…Ù„Ø§Ø­Ø¸Ø© <span className="text-xs text-muted-foreground">(Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span></span>
                  <Input placeholder="Ù…Ù„Ø§Ø­Ø¸Ø© Ù„Ù„Ø·Ù„Ø¨" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
              <div className="flex items-center justify-between font-semibold">
                <span>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</span>
                <span>{egp(total)}</span>
              </div>
              <Button size="lg" onClick={submit} disabled={busy || !name.trim() || cart.length === 0}>
                {busy ? <Icon name="clock" size={18} /> : <Icon name="check" size={18} />}
                {busy ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„â€¦' : 'Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}


