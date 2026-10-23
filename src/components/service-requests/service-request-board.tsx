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
const types: Record<string, string> = { waiter_call: 'نداء نادل', bill: 'طلب الحساب', water: 'ماء', utensils: 'أدوات', assistance: 'مساعدة', complaint: 'شكوى' }
const states: Record<string, string> = { pending: 'بانتظار الاستلام', accepted: 'مستلم', in_progress: 'قيد المعالجة', resolved: 'تم الحل', cancelled: 'ملغى' }
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
      if (!res.ok) throw new Error(data.error ?? 'تعذر تحميل طلبات الخدمة'); setRows(data.requests ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل طلبات الخدمة') } finally { setLoading(false) }
  }, [priority, status, table, type])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (manager) void fetch('/api/staff/users', { cache: 'no-store' }).then(async r => { const d = await r.json().catch(() => ({})); if (r.ok) setWaiters(d.users ?? []) }) }, [manager])
  const visible = useMemo(() => { const q = query.trim().toLocaleLowerCase('ar'); return q ? rows.filter(r => (types[r.type] + ' ' + r.table.number + ' ' + (r.claimedBy?.name ?? '') + ' ' + (r.details ?? '')).toLocaleLowerCase('ar').includes(q)) : rows }, [query, rows])
  async function act(id: string | number, action: string, extra: Record<string, string> = {}) {
    setBusy(String(id)); setError(null); setNotice(null)
    try { const res = await fetch('/api/staff/service-requests/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error ?? 'تعذر تحديث الطلب'); setNotice('تم حفظ الإجراء وتحديث القائمة.'); await load() } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث الطلب') } finally { setBusy(null) }
  }
  return <Card dir="rtl"><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>{manager ? 'إدارة طلبات الخدمة والشكاوى' : 'طلبات الخدمة'}</CardTitle><p className="mt-1 text-sm text-muted-foreground">بيانات حية من الفرع؛ الإجراءات تتحقق على الخادم.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || !!busy}>تحديث</Button></CardHeader><CardContent className="space-y-4">
    {manager ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><select aria-label="الحالة" value={status} onChange={e => setStatus(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="">كل الحالات</option>{Object.entries(states).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select aria-label="النوع" value={type} onChange={e => setType(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="">كل الأنواع</option>{Object.entries(types).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select aria-label="الأولوية" value={priority} onChange={e => setPriority(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="">كل الأولويات</option><option value="high">عالية / مصعّدة</option><option value="normal">عادية</option></select><Input value={table} onChange={e => setTable(e.target.value)} placeholder="رقم الطاولة" aria-label="رقم الطاولة" /><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث في الطلبات" aria-label="بحث في الطلبات" /></div> : null}
    {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}{notice ? <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p> : null}
    {loading ? <p className="text-sm text-muted-foreground">جارٍ تحميل الطلبات…</p> : visible.length === 0 ? <EmptyState icon="waiter" title="لا توجد طلبات مطابقة" description="ستظهر طلبات العملاء الجديدة هنا عند وصولها." /> : <div className="grid gap-3 lg:grid-cols-2">{visible.map(row => <RequestCard key={String(row.id)} row={row} manager={manager} waiters={waiters} busy={busy === String(row.id)} onAction={act} />)}</div>}
  </CardContent></Card>
}

function RequestCard({ row, manager, waiters, busy, onAction }: { row: Row; manager: boolean; waiters: Waiter[]; busy: boolean; onAction: (id: string | number, action: string, extra?: Record<string, string>) => Promise<void> }) {
  const [assignee, setAssignee] = useState(row.claimedBy?.id ?? ''); const [reason, setReason] = useState('')
  const overdue = ['pending', 'accepted', 'in_progress'].includes(row.status) && Date.now() - new Date(row.createdAt).getTime() > 600000
  return <article className={'rounded-xl border p-4 ' + (row.type === 'complaint' || overdue ? 'border-warning/50' : 'border-border')}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{types[row.type] ?? row.type} · طاولة {row.table.number}</h3><p className="mt-1 text-xs text-muted-foreground">{row.table.name ? row.table.name + ' · ' : ''}{formatRelative(new Date(row.createdAt))}{overdue ? ' · متأخر' : ''}</p></div><div className="flex gap-1"><Badge tone={tones[row.status] ?? 'muted'}>{states[row.status] ?? row.status}</Badge>{row.priority > 0 ? <Badge tone="warning">مصعّد</Badge> : null}</div></div>
    {row.details ? <p className="mt-3 rounded-md bg-muted/50 p-2 text-sm">{row.details}</p> : null}<p className="mt-3 text-sm text-muted-foreground">{row.claimedBy ? 'المسؤول: ' + row.claimedBy.name : 'متاح للاستلام'}</p>{row.resolution ? <p className="mt-2 text-xs text-muted-foreground">الحل: {row.resolution}{row.resolvedBy ? ' — ' + row.resolvedBy.name : ''}</p> : null}
    {manager && !['resolved', 'cancelled'].includes(row.status) ? <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><select value={assignee} onChange={e => setAssignee(e.target.value)} aria-label="إعادة تعيين الطلب" className="h-9 rounded-md border border-border bg-background px-2 text-sm"><option value="">اختر نادلًا</option>{waiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><Button size="sm" variant="outline" disabled={busy || !assignee} onClick={() => void onAction(row.id, 'reassign', { assigneeId: assignee })}>إعادة تعيين</Button></div> : null}
    {['accepted', 'in_progress'].includes(row.status) ? <Input className="mt-3" value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب الحل (مطلوب)" aria-label="سبب الحل" maxLength={500} /> : null}
    <div className="mt-3 flex flex-wrap gap-2">{row.status === 'pending' ? <Button size="sm" disabled={busy} onClick={() => void onAction(row.id, 'accept')}>{busy ? 'جارٍ الحفظ…' : 'استلام'}</Button> : null}{row.status === 'accepted' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction(row.id, 'in_progress')}>بدء الخدمة</Button> : null}{['accepted', 'in_progress'].includes(row.status) ? <Button size="sm" disabled={busy || !reason.trim()} onClick={() => void onAction(row.id, 'resolve', { reason: reason.trim() })}>حل الطلب</Button> : null}{manager && !['resolved', 'cancelled'].includes(row.status) ? <Button size="sm" variant="outline" disabled={busy || row.priority > 0} onClick={() => void onAction(row.id, 'prioritize')}>تصعيد الأولوية</Button> : null}</div>
  </article>
}
