'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StaffTable } from '@/lib/staff-tables'

/**
 * Tables board â€” real branch tables + live occupancy.
 * No local state mutation: occupancy derives from open orders in the DB.
 */
export function TablesBoard({ tables, canEditLayout = false, branches = [] }: { tables: StaffTable[]; canEditLayout?: boolean; branches?: { id: string; name: string }[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const available = tables.filter((t) => t.status === 'available').length
  const occupied = tables.filter((t) => t.status === 'occupied').length
  const [view, setView] = useState<'grid' | 'floor'>('grid')
  const [editing, setEditing] = useState<StaffTable | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '')
  const [zone, setZone] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function openCreate() { setEditing(null); setNumber(''); setName(''); setCapacity('4'); setZone(''); setBranchId(branches[0]?.id ?? ''); setError(null); setFormOpen(true) }
  function openEdit(table: StaffTable) { setEditing(table); setNumber(table.number); setName(table.name ?? ''); setCapacity(String(table.capacity)); setZone(table.floorPlanZone ?? ''); setError(null); setFormOpen(true) }
  async function saveTable() { if (saving) return; const seats = Number(capacity); if (!number.trim() || !Number.isInteger(seats) || seats < 1 || (!editing && !branchId)) { setError('Ø£Ø¯Ø®Ù„ Ø±Ù‚Ù… Ø§Ù„Ø·Ø§ÙˆÙ„Ø© ÙˆØ³Ø¹Ø© ØµØ­ÙŠØ­Ø© ÙˆØ§Ù„ÙØ±Ø¹.'); return }; setSaving(true); setError(null); try { const response = await fetch('/api/staff/tables', { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editing ? { id: editing.id, number: number.trim(), name: name.trim() || null, capacity: seats, zone: zone.trim() || null } : { branchId, number: number.trim(), name: name.trim() || null, capacity: seats, zone: zone.trim() || null }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ø·Ø§ÙˆÙ„Ø©'); setFormOpen(false); setNotice(editing ? 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø·Ø§ÙˆÙ„Ø©.' : 'ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø·Ø§ÙˆÙ„Ø©.'); startTransition(() => router.refresh()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ø·Ø§ÙˆÙ„Ø©') } finally { setSaving(false) } }
  async function archive(table: StaffTable) { if (!confirm(`Ø£Ø±Ø´ÙØ© Ø§Ù„Ø·Ø§ÙˆÙ„Ø© ${table.number}ØŸ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø£Ø±Ø´ÙØ© Ø·Ø§ÙˆÙ„Ø© Ø¹Ù„ÙŠÙ‡Ø§ Ø·Ù„Ø¨Ø§Øª Ù†Ø´Ø·Ø©.`)) return; setSaving(true); setError(null); try { const response = await fetch(`/api/staff/tables?id=${encodeURIComponent(table.id)}`, { method: 'DELETE' }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? 'ØªØ¹Ø°Ø± Ø£Ø±Ø´ÙØ© Ø§Ù„Ø·Ø§ÙˆÙ„Ø©'); setNotice('ØªÙ…Øª Ø£Ø±Ø´ÙØ© Ø§Ù„Ø·Ø§ÙˆÙ„Ø©.'); startTransition(() => router.refresh()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø£Ø±Ø´ÙØ© Ø§Ù„Ø·Ø§ÙˆÙ„Ø©') } finally { setSaving(false) } }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
          <span className="text-lg font-bold text-foreground">{formatNumber(available)}</span>
          <span className="text-success">Ù…ØªØ§Ø­Ø©</span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
          <span className="text-lg font-bold text-foreground">{formatNumber(occupied)}</span>
          <span className="text-warning">Ù…Ø´ØºÙˆÙ„Ø©</span>
        </span>
        {canEditLayout ? <Button size="sm" className="ms-auto" onClick={openCreate}><Icon name="plus" size={14} />Ø¥Ø¶Ø§ÙØ© Ø·Ø§ÙˆÙ„Ø©</Button> : null}
        <Link href="/tables/print" className={!canEditLayout ? 'ms-auto' : undefined}>
          <Button size="sm" variant="outline">
            <Icon name="orders" size={14} />
            Ø·Ø¨Ø§Ø¹Ø© QR
          </Button>
        </Link>
        <div className="flex rounded-md border border-border p-0.5"><Button size="sm" variant={view === 'grid' ? 'primary' : 'ghost'} onClick={() => setView('grid')}>Ø´Ø¨ÙƒØ©</Button><Button size="sm" variant={view === 'floor' ? 'primary' : 'ghost'} onClick={() => setView('floor')}>Ù…Ø®Ø·Ø· Ø§Ù„Ù‚Ø§Ø¹Ø©</Button></div>
      </div>
      {notice ? <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {formOpen ? <div role="dialog" aria-modal="true" aria-label={editing ? 'ØªØ¹Ø¯ÙŠÙ„ Ø·Ø§ÙˆÙ„Ø©' : 'Ø¥Ø¶Ø§ÙØ© Ø·Ø§ÙˆÙ„Ø©'} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><Card className="w-full max-w-lg"><CardContent className="space-y-4 p-5"><h2 className="text-lg font-bold">{editing ? 'ØªØ¹Ø¯ÙŠÙ„ Ø·Ø§ÙˆÙ„Ø©' : 'Ø¥Ø¶Ø§ÙØ© Ø·Ø§ÙˆÙ„Ø©'}</h2><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Ø±Ù‚Ù… Ø§Ù„Ø·Ø§ÙˆÙ„Ø©<Input value={number} onChange={(event) => setNumber(event.target.value)} maxLength={20} /></label><label className="text-sm">Ø§Ù„Ø³Ø¹Ø©<Input type="number" min="1" max="100" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><label className="text-sm">Ø§Ù„Ø§Ø³Ù… (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} /></label><label className="text-sm">Ø§Ù„Ù…Ù†Ø·Ù‚Ø© (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)<Input value={zone} onChange={(event) => setZone(event.target.value)} maxLength={80} /></label>{!editing ? <label className="text-sm sm:col-span-2">Ø§Ù„ÙØ±Ø¹<select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Ø§Ø®ØªØ± Ø§Ù„ÙØ±Ø¹</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}</div>{error ? <p className="text-sm text-destructive">{error}</p> : null}<div className="flex gap-2"><Button disabled={saving} onClick={() => void saveTable()}>{saving ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦' : 'Ø­ÙØ¸'}</Button><Button variant="ghost" disabled={saving} onClick={() => setFormOpen(false)}>Ø¥Ù„ØºØ§Ø¡</Button></div></CardContent></Card></div> : null}

      {tables.length === 0 ? (
        <EmptyState icon="tables" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ø§ÙˆÙ„Ø§Øª" description="Ø£Ø¶Ù Ø·Ø§ÙˆÙ„Ø§Øª Ø§Ù„ÙØ±Ø¹ Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø£ÙˆÙ„Ø§Ù‹." />
      ) : (
        <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5', view !== 'grid' && 'hidden')}>
          {tables.map((t) => (
            <Card
              key={t.id}
              className={cn(
                'flex flex-col',
                t.status === 'available' ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10',
              )}
            >
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn('h-2.5 w-2.5 rounded-full', t.status === 'available' ? 'bg-success' : 'bg-warning')}
                      aria-hidden="true"
                    />
                    <span className="text-lg font-bold text-foreground">{t.number}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatNumber(t.capacity)} Ù…Ù‚Ø§Ø¹Ø¯</span>
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium text-foreground">
                    {t.status === 'available' ? 'Ù…ØªØ§Ø­Ø©' : `Ù…Ø´ØºÙˆÙ„Ø© Â· ${formatNumber(t.openOrders)} Ø·Ù„Ø¨`}
                  </span>
                  {t.name ? <span className="text-xs text-muted-foreground">{t.name}</span> : null}
                </div>
                <Link href={`/menu/${t.publicToken}`} className="mt-auto">
                  <Button size="sm" variant={t.status === 'available' ? 'primary' : 'outline'} className="w-full">
                    <Icon name="utensils" size={14} />
                    ÙØªØ­ Ø§Ù„Ù…Ù†ÙŠÙˆ
                  </Button>
                </Link>
                {canEditLayout ? <div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(t)}>ØªØ¹Ø¯ÙŠÙ„</Button><Button size="sm" variant="destructive" disabled={saving || t.openOrders > 0} onClick={() => void archive(t)}>Ø£Ø±Ø´ÙØ©</Button></div> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {tables.length > 0 && view === 'floor' ? <FloorPlanPanel tables={tables} canEdit={canEditLayout} /> : null}
    </div>
  )
}

function FloorPlanPanel({ tables, canEdit }: { tables: StaffTable[]; canEdit: boolean }) {
  type Layout = { x: number; y: number; zone: string; rotation: number }
  const [draft, setDraft] = useState<Record<string, Layout>>(() => Object.fromEntries(
    tables.map((table, index) => [table.id, {
      x: table.floorPlanX ?? 10 + (index % 5) * 19,
      y: table.floorPlanY ?? 10 + Math.floor(index / 5) * 24,
      zone: table.floorPlanZone ?? '', rotation: table.floorPlanRotation,
    }]),
  ) as Record<string, Layout>)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  async function save() {
    if (!canEdit || saving) return
    setSaving(true); setMessage(null)
    try {
      const response = await fetch('/api/staff/tables/layout', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tables: tables.map((table) => ({ id: table.id, ...draft[table.id], zone: draft[table.id].zone || null })) }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error ?? 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ù…Ø®Ø·Ø·')
      setMessage('ØªÙ… Ø­ÙØ¸ Ù…Ø®Ø·Ø· Ø§Ù„Ù‚Ø§Ø¹Ø©.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ù…Ø®Ø·Ø·') } finally { setSaving(false) }
  }
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Ø§Ù„Ù…Ø®Ø·Ø· ÙŠØ³ØªØ®Ø¯Ù… Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª Ø§Ù„ÙØ¹Ù„ÙŠØ© Ù†ÙØ³Ù‡Ø§ ÙÙŠ Ø¹Ø±Ø¶ Ø§Ù„Ø´Ø¨ÙƒØ©. Ø¹Ù„Ù‰ Ø§Ù„Ù‡Ø§ØªÙ ÙŠØ¨Ø¯Ø£ Ø§Ù„Ø¹Ø±Ø¶ Ø¨Ø§Ù„Ø´Ø¨ÙƒØ© Ø§ÙØªØ±Ø§Ø¶ÙŠÙ‹Ø§.</p>{canEdit ? <Button disabled={saving} onClick={() => void save()}>{saving ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦' : 'Ø­ÙØ¸ Ù…ÙˆØ§Ù‚Ø¹ Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª'}</Button> : <Badge tone="muted">Ø§Ù„Ø¹Ø±Ø¶ ÙÙ‚Ø· â€” Ø§Ù„ØªØ­Ø±ÙŠØ± Ù„Ù„Ù…Ø§Ù„Ùƒ</Badge>}</div>{message ? <p className="rounded border border-border px-3 py-2 text-sm">{message}</p> : null}<div className="relative min-h-[460px] overflow-hidden rounded-xl border bg-muted/30" aria-label="Ù…Ø®Ø·Ø· Ø§Ù„Ù‚Ø§Ø¹Ø©">{tables.map((table) => { const item = draft[table.id]; return <div key={table.id} className={cn('absolute w-28 rounded-lg border p-2 text-center shadow-sm', table.status === 'available' ? 'border-success/50 bg-success/10' : 'border-warning/50 bg-warning/10')} style={{ left: `${item.x}%`, top: `${item.y}%`, transform: `translate(-50%, -50%) rotate(${item.rotation}deg)` }}><p className="font-bold">Ø·Ø§ÙˆÙ„Ø© {table.number}</p><p className="text-xs">{table.status === 'available' ? 'Ù…ØªØ§Ø­Ø©' : `Ù…Ø´ØºÙˆÙ„Ø© Â· ${table.openOrders}`}</p>{canEdit ? <div className="mt-2 grid grid-cols-2 gap-1" onPointerDown={(event) => event.stopPropagation()}><Input type="number" min="0" max="100" value={item.x} aria-label={`Ø§Ù„Ù…ÙˆØ¶Ø¹ Ø§Ù„Ø£ÙÙ‚ÙŠ Ù„Ù„Ø·Ø§ÙˆÙ„Ø© ${table.number}`} onChange={(event) => setDraft((value) => ({ ...value, [table.id]: { ...value[table.id], x: Number(event.target.value) } }))} /><Input type="number" min="0" max="100" value={item.y} aria-label={`Ø§Ù„Ù…ÙˆØ¶Ø¹ Ø§Ù„Ø±Ø£Ø³ÙŠ Ù„Ù„Ø·Ø§ÙˆÙ„Ø© ${table.number}`} onChange={(event) => setDraft((value) => ({ ...value, [table.id]: { ...value[table.id], y: Number(event.target.value) } }))} /></div> : null}</div> })}</div></section>
}


