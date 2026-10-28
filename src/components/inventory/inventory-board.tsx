'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Segmented } from '@/components/ui/segmented'
import { formatNumber, formatRelative } from '@/lib/format'
import type { InventoryBatchRow, InventoryMovement, InventoryRow } from '@/lib/staff-inventory'

type MovementKind = 'inbound' | 'outbound' | 'adjustment'

/**
 * Inventory board â€” real stock levels + movement history from the DB.
 * Manager+ can record inbound/outbound/adjustment movements (server-side,
 * transactional, branch-scoped via the movement API).
 */
export function InventoryBoard({
  items,
  movements,
  batches,
  canManage,
}: {
  items: InventoryRow[]
  movements: InventoryMovement[]
  batches: InventoryBatchRow[]
  canManage: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  // Movement form state (manager+)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [kind, setKind] = useState<MovementKind>('inbound')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim()
    return items.filter(
      (i) => (!lowOnly || i.isLow) && (!q || i.name.includes(q)),
    )
  }, [items, lowOnly, query])

  const lowCount = items.filter((i) => i.isLow).length

  function openMovement(id: string) {
    setActiveId(id)
    setKind('inbound')
    setQty('')
    setNotes('')
    setUnitCost('')
    setExpiresAt('')
    setError(null)
    setSuccess(null)
  }

  function closeMovement() {
    setActiveId(null)
    setError(null)
  }

  async function submitMovement() {
    if (!activeId || saving) return
    const qtyNum = Number(qty)
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError('Ø§Ù„ÙƒÙ…ÙŠØ© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/inventory/${activeId}/movement`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: kind, quantity: qtyNum, notes: notes.trim() || undefined, unitCost: kind === 'inbound' ? Number(unitCost) : undefined, expiresAt: kind === 'inbound' && expiresAt ? new Date(`${expiresAt}T00:00:00`).toISOString() : undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ÙØ´Ù„ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø­Ø±ÙƒØ©')
      setSuccess('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø­Ø±ÙƒØ©')
      setActiveId(null)
      setQty('')
      setNotes('')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ÙØ´Ù„ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø­Ø±ÙƒØ©')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† ØµÙ†Ùâ€¦" aria-label="Ø¨Ø­Ø« Ø§Ù„Ù…Ø®Ø²ÙˆÙ†" className="max-w-xs"
        />
        <button
          type="button" onClick={() => setLowOnly((v) => !v)} aria-pressed={lowOnly}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
        >
          <Icon name={lowOnly ? 'check' : 'flame'} size={16} />
          Ù…Ù†Ø®ÙØ¶ ÙÙ‚Ø· ({formatNumber(lowCount)})
        </button>
      </div>

      {success ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{success}</p>
      ) : null}
      {error && !activeId ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {canManage && activeId ? (
        <Card className="border-primary/40">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Ø­Ø±ÙƒØ© Ù…Ø®Ø²ÙˆÙ† â€” {items.find((i) => i.id === activeId)?.name ?? ''}</CardTitle>
            <Button size="sm" variant="ghost" onClick={closeMovement} aria-label="Ø¥ØºÙ„Ø§Ù‚">
              <Icon name="close" size={16} />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Segmented
              options={[
                { value: 'inbound', label: 'Ø§Ø³ØªÙ„Ø§Ù…' },
                { value: 'outbound', label: 'ØµØ±Ù' },
                { value: 'adjustment', label: 'ØªØ³ÙˆÙŠØ© Ø¬Ø±Ø¯' },
              ]}
              value={kind}
              onChange={(v) => setKind(v as MovementKind)}
              ariaLabel="Ù†ÙˆØ¹ Ø§Ù„Ø­Ø±ÙƒØ©"
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">
                {kind === 'adjustment' ? 'Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„ÙØ¹Ù„ÙŠØ© Ø¨Ø¹Ø¯ Ø§Ù„Ø¬Ø±Ø¯' : 'Ø§Ù„ÙƒÙ…ÙŠØ©'} ({items.find((i) => i.id === activeId)?.unit ?? ''})
              </span>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={qty} onChange={(e) => setQty(e.target.value)}
                placeholder="0.00" aria-label="Ø§Ù„ÙƒÙ…ÙŠØ©"
              />
            </label>
            {kind === 'inbound' ? <div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 text-sm"><span className="text-muted-foreground">ØªÙƒÙ„ÙØ© Ø§Ù„ÙˆØ­Ø¯Ø© *</span><Input type="number" inputMode="decimal" step="0.0001" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" /></label><label className="flex flex-col gap-1 text-sm"><span className="text-muted-foreground">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label></div> : null}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Ø§Ù„Ø³Ø¨Ø¨ / Ù…Ù„Ø§Ø­Ø¸Ø© (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span>
              <Input
                value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ø­Ø±ÙƒØ©" aria-label="Ø§Ù„Ø³Ø¨Ø¨" maxLength={255}
              />
            </label>
            {error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={saving} onClick={submitMovement}>
                <Icon name="check" size={16} /> {saving ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø­ÙØ¸â€¦' : 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø­Ø±ÙƒØ©'}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeMovement} disabled={saving}>
                Ø¥Ù„ØºØ§Ø¡
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Ø§Ù„Ø£ØµÙ†Ø§Ù ({formatNumber(rows.length)})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon="inventory" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£ØµÙ†Ø§Ù Ù…Ø·Ø§Ø¨Ù‚Ø©" description="Ø¬Ø±Ù‘Ø¨ Ø¨Ø­Ø«Ø§Ù‹ Ø¢Ø®Ø± Ø£Ùˆ Ø£Ø¶Ù Ø£ØµÙ†Ø§ÙØ§Ù‹ Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„ØµÙ†Ù</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„ÙØ¹Ù„ÙŠ</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ù…Ø­Ø¬ÙˆØ²</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ù…ØªØ§Ø­</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                    {canManage ? <th className="px-2 py-2 text-start font-medium">Ø¥Ø¬Ø±Ø§Ø¡</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                      <td className="px-2 py-2.5 font-medium text-foreground">{i.name}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{formatNumber(Number(i.qty), 2)} {i.unit}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{formatNumber(Number(i.reservedQty), 2)} {i.unit}</td>
                      <td className="px-2 py-2.5 font-medium text-foreground">{formatNumber(Number(i.availableQty), 2)} {i.unit}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{i.minQty != null ? `${formatNumber(Number(i.minQty), 2)} ${i.unit}` : 'â€”'}</td>
                      <td className="px-2 py-2.5">
                        <Badge tone={i.isLow ? 'warning' : 'success'}>{i.isLow ? 'Ù…Ù†Ø®ÙØ¶' : 'Ù…ØªÙˆÙØ±'}</Badge>
                      </td>
                      {canManage ? (
                        <td className="px-2 py-2.5">
                          <Button size="sm" variant="outline" onClick={() => openMovement(i.id)}>
                            <Icon name="plus" size={14} /> Ø­Ø±ÙƒØ©
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ø¯ÙØ¹Ø§Øª Ø§Ù„Ù…Ø®Ø²ÙˆÙ† â€” FEFO ÙØ¹Ù„ÙŠ / FIFO ØªÙƒÙ„ÙØ©</CardTitle></CardHeader>
        <CardContent>{batches.length === 0 ? <p className="text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¯ÙØ¹Ø§Øª Ù…ØªØ§Ø­Ø©.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-2 text-start">Ø§Ù„ØµÙ†Ù</th><th className="p-2 text-start">Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ</th><th className="p-2 text-start">ØªÙƒÙ„ÙØ© FIFO</th><th className="p-2 text-start">Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡</th><th className="p-2 text-start">Ø§Ù„Ù…ÙˆØ±Ø¯</th><th className="p-2 text-start">Ø§Ù„Ø­Ø§Ù„Ø©</th></tr></thead><tbody>{batches.map((b) => <tr key={b.id} className="border-b border-border/50"><td className="p-2">{b.itemName}</td><td className="p-2">{formatNumber(Number(b.remainingQty), 2)}</td><td className="p-2">{formatNumber(Number(b.unitCost), 2)} Ã— {formatNumber(Number(b.remainingCostQty), 2)}</td><td className="p-2">{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString('ar-EG') : 'â€”'}</td><td className="p-2">{b.supplierReference ?? 'â€”'}</td><td className="p-2"><Badge tone={b.state === 'expired' ? 'destructive' : b.state === 'expiring' ? 'warning' : 'success'}>{b.state === 'expired' ? 'Ù…Ù†ØªÙ‡ÙŠØ©' : b.state === 'expiring' ? 'Ù‚Ø±ÙŠØ¨Ø© Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡' : 'Ù…ØªØ§Ø­Ø©'}</Badge></td></tr>)}</tbody></table></div>}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ø£Ø­Ø¯Ø« Ø§Ù„Ø­Ø±ÙƒØ§Øª</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø±ÙƒØ§Øª Ù…Ø³Ø¬Ù„Ø© Ø¨Ø¹Ø¯.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">{m.itemName}</span>
                    <span className="text-xs text-muted-foreground">{m.type}{m.reason ? ` Â· ${m.reason}` : ''}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-medium">{formatNumber(Number(m.qty), 2)}</span>
                    <span className="text-xs text-muted-foreground">{formatRelative(new Date(m.createdAt))}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


