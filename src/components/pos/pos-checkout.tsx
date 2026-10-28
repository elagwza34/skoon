'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dropdown } from '@/components/ui/dropdown'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { formatCurrency, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PosCatalog } from '@/lib/staff-pos'

/**
 * POS checkout â€” real branch catalog + tables from the DB.
 * Pricing is re-computed server-side on submit; client totals are a preview.
 */
export function PosCheckout({ catalog, initialTableId }: { catalog: PosCatalog; initialTableId?: string }) {
  const router = useRouter()
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<{ id: string; qty: number; note?: string }[]>([])
  const [tableId, setTableId] = useState(initialTableId ?? catalog.tables[0]?.id ?? '')
  const [customerName, setCustomerName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [placed, setPlaced] = useState<{ orderNumber: string; total: string } | null>(null)
  const submissionKey = useRef<string | null>(null)

  const priceById = useMemo(() => new Map(catalog.products.map((p) => [p.id, Number(p.price)])), [catalog.products])

  const visible = useMemo(() => {
    const q = query.trim()
    return catalog.products.filter(
      (p) =>
        (category === 'all' || p.categoryId === category) &&
        (!q || p.name.includes(q)),
    )
  }, [catalog.products, category, query])

  const subtotal = cart.reduce((s, l) => s + (priceById.get(l.id) ?? 0) * l.qty, 0)
  const itemCount = cart.reduce((s, l) => s + l.qty, 0)

  function add(id: string) {
    setPlaced(null)
    setCart((prev) => {
      const ex = prev.find((l) => l.id === id)
      if (ex) return prev.map((l) => (l.id === id ? { ...l, qty: Math.min(20, l.qty + 1) } : l))
      return [...prev, { id, qty: 1 }]
    })
  }
  function inc(id: string) {
    setCart((prev) => prev.map((l) => (l.id === id ? { ...l, qty: Math.min(20, l.qty + 1) } : l)))
  }
  function dec(id: string) {
    setCart((prev) => prev.map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0))
  }
  function setNote(id: string, note: string) {
    setCart((prev) => prev.map((line) => (line.id === id ? { ...line, note } : line)))
  }
  function clear() {
    setCart([])
    setPlaced(null)
    setError(null)
  }

  async function checkout() {
    if (cart.length === 0 || busy) return
    if (!tableId) {
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
        headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          tableId,
          customerName: customerName.trim() || undefined,
          items: cart.map((l) => ({ productId: l.id, qty: l.qty, note: l.note?.trim() || undefined })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø·Ù„Ø¨')
      setPlaced({ orderNumber: data.orderNumber, total: data.total })
      setCart([])
      submissionKey.current = null
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø·Ù„Ø¨')
    } finally {
      setBusy(false)
    }
  }
  const categoryOptions = [
    { value: 'all', label: 'Ø§Ù„ÙƒÙ„' },
    ...catalog.categories.map((c) => ({ value: c.id, label: c.name })),
  ]
  const tableOptions = catalog.tables.map((t) => ({
    value: t.id, label: t.name ? `${t.number} Â· ${t.name}` : `Ø·Ø§ÙˆÙ„Ø© ${t.number}`, icon: 'tables' as const,
  }))

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-3">
        <Input icon="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ù…Ù†ØªØ¬â€¦" aria-label="Ø¨Ø­Ø« Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª" />
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {categoryOptions.map((c) => (
            <button
              key={c.value} type="button" onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                category === c.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon="products" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù†ØªØ¬Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø©" description="Ø¬Ø±Ù‘Ø¨ Ø¨Ø­Ø«Ø§Ù‹ Ø£Ùˆ ØªØµÙ†ÙŠÙØ§Ù‹ Ø¢Ø®Ø±." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
              <button
                key={p.id} type="button" disabled={!p.isAvailable} onClick={() => add(p.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-4 text-center',
                  p.isAvailable ? 'hover:border-primary/50 hover:bg-accent/40' : 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.categoryName}</span>
                <span className="text-sm font-semibold text-primary">{formatCurrency(Number(p.price))}</span>
                {!p.isAvailable ? <Badge tone="muted">ØºÙŠØ± Ù…ØªÙˆÙØ±</Badge> : null}
              </button>
            ))}
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
          <Dropdown label="Ø§Ù„Ø·Ø§ÙˆÙ„Ø©" options={tableOptions} value={tableId} onChange={setTableId} className="w-full" />
          <Input icon="customers" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" aria-label="Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„" />
          {placed ? (
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø·Ù„Ø¨ {placed.orderNumber} Â· {formatCurrency(Number(placed.total))}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
          {cart.length === 0 ? (
            <EmptyState icon="pos" title="Ø§Ù„Ø³Ù„Ø© ÙØ§Ø±ØºØ©" description="Ø§Ø®ØªØ± Ù…Ù†ØªØ¬Ø§Øª Ù„Ø¥Ø¶Ø§ÙØªÙ‡Ø§." />
          ) : (
            <ul className="flex flex-col gap-2">
              {cart.map((l) => {
                const p = catalog.products.find((x) => x.id === l.id)!
                return (
                  <li key={l.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                      <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{formatCurrency(Number(p.price) * l.qty)}</span>
                      <Input value={l.note ?? ''} onChange={(e) => setNote(l.id, e.target.value)} maxLength={255} placeholder="Ù…Ù„Ø§Ø­Ø¸Ø© Ù„Ù„ØµÙ†Ù (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" aria-label={`Ù…Ù„Ø§Ø­Ø¸Ø© ${p.name}`} className="h-8 text-xs" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => dec(l.id)} aria-label="Ø¥Ù†Ù‚Ø§Øµ">
                        <Icon name="minus" size={14} />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => inc(l.id)} aria-label="Ø²ÙŠØ§Ø¯Ø©">
                        <Icon name="plus" size={14} />
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
          <Button size="lg" className="w-full" disabled={!cart.length || busy} onClick={checkout}>
            <Icon name="check" size={18} />
            {busy ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø­ÙØ¸â€¦' : 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø·Ù„Ø¨'}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {formatNumber(itemCount)} ØµÙ†Ù Â· Ø§Ù„Ø³Ø¹Ø± Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ ÙŠÙØ­Ø³Ø¨ Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
          </p>
        </CardContent>
      </Card>
    </div>
  )
}



