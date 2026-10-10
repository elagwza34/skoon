'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
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
 */
export function MenuOrderView({ menu }: { menu: PublicMenu }) {
  const router = useRouter()
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          items: cart.map((l) => ({ productId: l.productId, qty: l.qty, note: note.trim() || undefined })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Order failed')
      router.push(`/order/${data.id}?n=${encodeURIComponent(data.orderNumber)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order failed')
      setBusy(false)
    }
  }

  return (
    <div dir="rtl" className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{menu.table.branchName}</span>
          <h1 className="text-xl font-bold">
            طاولة {menu.table.number}
            {menu.table.name ? ` · ${menu.table.name}` : ''}
          </h1>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
          <Icon name="utensils" size={16} />
          المنيو
        </span>
      </header>

      <Input
        icon="search"
        placeholder="ابحث عن صنف…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm',
            category === 'all'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-accent',
          )}
        >
          الكل
        </button>
        {menu.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              category === c.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="search" title="مفيش نتائج" description="جرب كلمة بحث تانية أو قسم تاني." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((p) => {
            const inCart = cart.find((l) => l.productId === p.id)
            return (
              <Card key={p.id} className="flex flex-col justify-between">
                <CardContent className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {egp(Number(p.price))}
                    </span>
                  </div>
                  {p.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-end">
                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" onClick={() => dec(p.id)} aria-label="إنقاص">
                        <Icon name="minus" size={16} />
                      </Button>
                      <span className="w-8 text-center font-semibold">{inCart.qty}</span>
                      <Button size="icon" variant="outline" onClick={() => add(p.id)} aria-label="زيادة">
                        <Icon name="plus" size={16} />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => add(p.id)}>
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

      {cart.length > 0 ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>طلبك ({itemCount})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {cart.map((l) => {
              const p = menu.products.find((x) => x.id === l.productId)!
              return (
                <div key={l.productId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {p.name} <span className="text-muted-foreground">× {l.qty}</span>
                  </span>
                  <span className="font-medium">{egp((priceById.get(l.productId) ?? 0) * l.qty)}</span>
                </div>
              )
            })}
            <Input placeholder="اسمك" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              placeholder="ملاحظة للطلب (اختياري)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <div className="flex items-center justify-between font-semibold">
              <span>الإجمالي</span>
              <span>{egp(total)}</span>
            </div>
            <Button size="lg" onClick={submit} disabled={busy || !name.trim() || cart.length === 0}>
              {busy ? <Icon name="clock" size={18} /> : <Icon name="check" size={18} />}
              {busy ? 'جاري الإرسال…' : 'إرسال الطلب'}
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  )
}

