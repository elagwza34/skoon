'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatRelative } from '@/lib/format'

type Row = { id: string | number; type: string; status: string; priority: number; details?: string | null; resolution?: string | null; createdAt: string; table: { number: string; name?: string | null }; claimedBy: { id: string; name: string } | null; resolvedBy?: { id: string; name: string } | null }
type Waiter = { id: string; name: string }
const types: Record<string, string> = { waiter_call: 'Ù†Ø¯Ø§Ø¡ Ù†Ø§Ø¯Ù„', bill: 'Ø·Ù„Ø¨ Ø§Ù„Ø­Ø³Ø§Ø¨', water: 'Ù…Ø§Ø¡', utensils: 'Ø£Ø¯ÙˆØ§Øª', assistance: 'Ù…Ø³Ø§Ø¹Ø¯Ø©', complaint: 'Ø´ÙƒÙˆÙ‰' }
const states: Record<string, string> = { pending: 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…', accepted: 'Ù…Ø³ØªÙ„Ù…', in_progress: 'Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø©', resolved: 'ØªÙ… Ø§Ù„Ø­Ù„', cancelled: 'Ù…Ù„ØºÙ‰' }
const tones: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'destructive'> = { pending: 'warning', accepted: 'info', in_progress: 'info', resolved: 'success', cancelled: 'muted' }

/** Branch-scoped customer-request queue. Server APIs remain authoritative. */
export function ServiceRequestBoard({ manager = false }: { manager?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]); const [waiters, setWaiters] = useState<Waiter[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState(''); const [type, setType] = useState(''); const [priority, setPriority] = useState(''); const [table, setTable] = useState(''); const [query, setQuery] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams(); if (status) p.set('status', status); if (type) p.set('type', type); if (priority) p.set('priority', priority); if (table.trim()) p.set('table', table.trim())
      const res = await fetch('/api/staff/service-requests' + (p.size ? '?' + p.toString() : ''), { cache: 'no-store' }); const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø©'); setRows(data.requests ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø©') } finally { setLoading(false) }
  }, [priority, status, table, type])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (manager) void fetch('/api/staff/users', { cache: 'no-store' }).then(async r => { const d = await r.json().catch(() => ({})); if (r.ok) setWaiters(d.users ?? []) }) }, [manager])
  const visible = useMemo(() => { const q = query.trim().toLocaleLowerCase('ar'); return q ? rows.filter(r => (types[r.type] + ' ' + r.table.number + ' ' + (r.claimedBy?.name ?? '') + ' ' + (r.details ?? '')).toLocaleLowerCase('ar').includes(q)) : rows }, [query, rows])
  async function act(id: string | number, action: string, extra: Record<string, string> = {}) {
    setBusy(String(id)); setError(null); setNotice(null)
    try { const res = await fetch('/api/staff/service-requests/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø·Ù„Ø¨'); setNotice('ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ ÙˆØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©.'); await load() } catch (e) { setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø·Ù„Ø¨') } finally { setBusy(null) }
  }
  return <Card dir="rtl"><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>{manager ? 'Ø¥Ø¯Ø§Ø±Ø© Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø© ÙˆØ§Ù„Ø´ÙƒØ§ÙˆÙ‰' : 'Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø©'}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Ø¨ÙŠØ§Ù†Ø§Øª Ø­ÙŠØ© Ù…Ù† Ø§Ù„ÙØ±Ø¹Ø› Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª ØªØªØ­Ù‚Ù‚ Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø§Ø¯Ù….</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || !!busy}>ØªØ­Ø¯ÙŠØ«</Button></CardHeader><CardContent className="space-y-4">
    {manager ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><select aria-label="Ø§Ù„Ø­Ø§Ù„Ø©" value={status} onChange={e => setStatus(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="">ÙƒÙ„ Ø§Ù„Ø­Ø§Ù„Ø§Øª</option>{Object.entries(states).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select aria-label="Ø§Ù„Ù†ÙˆØ¹" value={type} onChange={e => setType(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="">ÙƒÙ„ Ø§Ù„Ø£Ù†ÙˆØ§Ø¹</option>{Object.entries(types).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select aria-label="Ø§Ù„Ø£ÙˆÙ„ÙˆÙŠØ©" value={priority} onChange={e => setPriority(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="">ÙƒÙ„ Ø§Ù„Ø£ÙˆÙ„ÙˆÙŠØ§Øª</option><option value="high">Ø¹Ø§Ù„ÙŠØ© / Ù…ØµØ¹Ù‘Ø¯Ø©</option><option value="normal">Ø¹Ø§Ø¯ÙŠØ©</option></select><Input value={table} onChange={e => setTable(e.target.value)} placeholder="Ø±Ù‚Ù… Ø§Ù„Ø·Ø§ÙˆÙ„Ø©" aria-label="Ø±Ù‚Ù… Ø§Ù„Ø·Ø§ÙˆÙ„Ø©" /><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø·Ù„Ø¨Ø§Øª" aria-label="Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø·Ù„Ø¨Ø§Øª" /></div> : null}
    {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}{notice ? <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p> : null}
    {loading ? <p className="text-sm text-muted-foreground">Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨Ø§Øªâ€¦</p> : visible.length === 0 ? <EmptyState icon="waiter" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø©" description="Ø³ØªØ¸Ù‡Ø± Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ù‡Ù†Ø§ Ø¹Ù†Ø¯ ÙˆØµÙˆÙ„Ù‡Ø§." /> : <div className="grid gap-3 lg:grid-cols-2">{visible.map(row => <RequestCard key={String(row.id)} row={row} manager={manager} waiters={waiters} busy={busy === String(row.id)} onAction={act} />)}</div>}
  </CardContent></Card>
}

function RequestCard({ row, manager, waiters, busy, onAction }: { row: Row; manager: boolean; waiters: Waiter[]; busy: boolean; onAction: (id: string | number, action: string, extra?: Record<string, string>) => Promise<void> }) {
  const [assignee, setAssignee] = useState(row.claimedBy?.id ?? ''); const [reason, setReason] = useState('')
  const overdue = ['pending', 'accepted', 'in_progress'].includes(row.status) && Date.now() - new Date(row.createdAt).getTime() > 600000
  return <article className={'rounded-xl border p-4 ' + (row.type === 'complaint' || overdue ? 'border-warning/50' : 'border-border')}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{types[row.type] ?? row.type} Â· Ø·Ø§ÙˆÙ„Ø© {row.table.number}</h3><p className="mt-1 text-xs text-muted-foreground">{row.table.name ? row.table.name + ' Â· ' : ''}{formatRelative(new Date(row.createdAt))}{overdue ? ' Â· Ù…ØªØ£Ø®Ø±' : ''}</p></div><div className="flex gap-1"><Badge tone={tones[row.status] ?? 'muted'}>{states[row.status] ?? row.status}</Badge>{row.priority > 0 ? <Badge tone="warning">Ù…ØµØ¹Ù‘Ø¯</Badge> : null}</div></div>
    {row.details ? <p className="mt-3 rounded-md bg-muted/50 p-2 text-sm">{row.details}</p> : null}<p className="mt-3 text-sm text-muted-foreground">{row.claimedBy ? 'Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„: ' + row.claimedBy.name : 'Ù…ØªØ§Ø­ Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù…'}</p>{row.resolution ? <p className="mt-2 text-xs text-muted-foreground">Ø§Ù„Ø­Ù„: {row.resolution}{row.resolvedBy ? ' â€” ' + row.resolvedBy.name : ''}</p> : null}
    {manager && !['resolved', 'cancelled'].includes(row.status) ? <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><select value={assignee} onChange={e => setAssignee(e.target.value)} aria-label="Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø·Ù„Ø¨" className="h-9 rounded-md border border-border bg-background px-2 text-sm"><option value="">Ø§Ø®ØªØ± Ù†Ø§Ø¯Ù„Ù‹Ø§</option>{waiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><Button size="sm" variant="outline" disabled={busy || !assignee} onClick={() => void onAction(row.id, 'reassign', { assigneeId: assignee })}>Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ†</Button></div> : null}
    {['accepted', 'in_progress'].includes(row.status) ? <Input className="mt-3" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ø­Ù„ (Ù…Ø·Ù„ÙˆØ¨)" aria-label="Ø³Ø¨Ø¨ Ø§Ù„Ø­Ù„" maxLength={500} /> : null}
    <div className="mt-3 flex flex-wrap gap-2">{row.status === 'pending' ? <Button size="sm" disabled={busy} onClick={() => void onAction(row.id, 'accept')}>{busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦' : 'Ø§Ø³ØªÙ„Ø§Ù…'}</Button> : null}{row.status === 'accepted' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction(row.id, 'in_progress')}>Ø¨Ø¯Ø¡ Ø§Ù„Ø®Ø¯Ù…Ø©</Button> : null}{['accepted', 'in_progress'].includes(row.status) ? <Button size="sm" disabled={busy || !reason.trim()} onClick={() => void onAction(row.id, 'resolve', { reason: reason.trim() })}>Ø­Ù„ Ø§Ù„Ø·Ù„Ø¨</Button> : null}{manager && !['resolved', 'cancelled'].includes(row.status) ? <Button size="sm" variant="outline" disabled={busy || row.priority > 0} onClick={() => void onAction(row.id, 'prioritize')}>ØªØµØ¹ÙŠØ¯ Ø§Ù„Ø£ÙˆÙ„ÙˆÙŠØ©</Button> : null}</div>
  </article>
}


