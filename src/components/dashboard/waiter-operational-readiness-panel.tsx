'use client'

import { useMemo, useState } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { WaiterOperationalReadiness, WaiterResponsibilityReviewRow } from '@/lib/staff-waiter-readiness'
import { type ReconciliationDecision, validateLegacyReconciliationProposal } from '@/lib/waiter-reconciliation-policy'

const labels: Record<string, string> = {
  operational: 'ØªØ´ØºÙŠÙ„ÙŠ', ambiguous: 'ÙŠØ­ØªØ§Ø¬ Ù‚Ø±Ø§Ø±', historical: 'ØªØ§Ø±ÙŠØ®ÙŠ', new: 'Ø¬Ø¯ÙŠØ¯', preparing: 'Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ø¶ÙŠØ±',
  ready: 'Ø¬Ø§Ù‡Ø²', served: 'ØªÙ… Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…', cancelled: 'Ù…Ù„ØºÙ‰', paid: 'Ù…Ø¯ÙÙˆØ¹', unpaid: 'ØºÙŠØ± Ù…Ø¯ÙÙˆØ¹',
  qr: 'QR', waiter: 'ÙˆÙŠØªØ±', pos: 'Ù†Ù‚Ø·Ø© Ø§Ù„Ø¨ÙŠØ¹', open: 'ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©', closed: 'ÙˆØ±Ø¯ÙŠØ© Ù…ØºÙ„Ù‚Ø©',
  none: 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ù†Ø§ØµØ± ØªØ´ØºÙŠÙ„ÙŠØ©', pending_review: 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©', preview_only: 'Ù…Ø¹Ø§ÙŠÙ†Ø© ØºÙŠØ± Ù…Ø­ÙÙˆØ¸Ø©',
}
const decisionLabels: Record<ReconciliationDecision, string> = {
  assign_waiter: 'Ø§Ù‚ØªØ±Ø§Ø­ Ø¥Ø³Ù†Ø§Ø¯ Ù„ÙˆÙŠØªØ±', keep_unassigned: 'Ø§Ù„Ø¥Ø¨Ù‚Ø§Ø¡ Ø¨Ù„Ø§ Ù…Ø³Ø¤ÙˆÙ„',
  review_later: 'Ù…Ø±Ø§Ø¬Ø¹Ø© Ù„Ø§Ø­Ù‚Ù‹Ø§', resolve_through_existing_workflow: 'Ø§Ù„Ø­Ù„ Ø¹Ø¨Ø± Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯',
}
function label(value: string | null) { return value === null ? 'Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ© Ù…Ø±ØªØ¨Ø·Ø©' : labels[value.toLowerCase()] ?? value }
function tone(bucket: string): BadgeTone { return bucket === 'operational' ? 'destructive' : bucket === 'historical' ? 'success' : 'warning' }

/** Browser-only proposals. This component never fetches, approves, or mutates an order. */
export function WaiterOperationalReadinessPanel({ data }: { data: WaiterOperationalReadiness }) {
  const [bucket, setBucket] = useState('all')
  const [source, setSource] = useState('all')
  const [payment, setPayment] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decision, setDecision] = useState<ReconciliationDecision>('assign_waiter')
  const [waiterId, setWaiterId] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<Record<string, { decision: ReconciliationDecision; reason: string; waiterId: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const rows = useMemo(() => data.cases.filter((row) =>
    (bucket === 'all' || row.bucket === bucket) && (source === 'all' || row.source.toLowerCase() === source) && (payment === 'all' || row.paymentStatus.toLowerCase() === payment),
  ), [bucket, data.cases, payment, source])
  const selected = data.cases.find((row) => row.id === selectedId) ?? null

  function openRow(row: WaiterResponsibilityReviewRow) {
    setSelectedId(row.id)
    const current = preview[row.id]
    setDecision(current?.decision ?? 'assign_waiter'); setWaiterId(current?.waiterId ?? ''); setReason(current?.reason ?? ''); setError(null)
  }
  function createPreview() {
    if (!selected) return
    const result = validateLegacyReconciliationProposal({
      order: { branchId: selected.branchId, status: selected.status, paymentStatus: selected.paymentStatus, source: selected.source, responsibleWaiterId: null, updatedAt: selected.updatedAt },
      decision, reason, proposedWaiterId: waiterId || null,
      eligibleWaiters: selected.eligibleWaiters.map((waiter) => ({ ...waiter, branchId: selected.branchId, role: 'waiter', isActive: true, hasOpenShift: true })),
    })
    if (!result.ok) { setError(result.error); return }
    setPreview((current) => ({ ...current, [selected.id]: { decision, reason: reason.trim(), waiterId } })); setError(null)
  }

  return <section dir="rtl" className="space-y-3">
    <Card className={data.operational > 0 || data.ambiguous > 0 ? 'border-warning/50' : ''}><CardHeader><CardTitle>Ù…Ø±Ø§Ø¬Ø¹Ø© Ù…Ø³Ø¤ÙˆÙ„ÙŠØ© Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙˆÙŠØªØ± Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø©</CardTitle><CardDescription>Ù…Ø¹Ø§ÙŠÙ†Ø§Øª Ù„Ù„Ù…Ø§Ù„Ùƒ/Ø§Ù„Ù…Ø¯ÙŠØ± ÙÙ‚Ø·: Ù„Ø§ ØªØ­ÙØ¸ Ø£Ùˆ ØªØ¹ØªÙ…Ø¯ Ø£Ùˆ ØªØ³Ù†Ø¯ ÙˆÙŠØªØ±Ù‹Ø§ØŒ ÙˆÙ„Ø§ ØªØºÙŠÙ‘Ø± Ø§Ù„Ø·Ù„Ø¨ Ø£Ùˆ Ø§Ù„Ø³Ø¯Ø§Ø¯ Ø£Ùˆ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">{[['ÙƒÙ„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø¨Ù„Ø§ Ù…Ø³Ø¤ÙˆÙ„', data.totalUnassigned, 'muted'], ['ØªØ­ØªØ§Ø¬ Ù…Ø±Ø§Ø¬Ø¹Ø© ØªØ´ØºÙŠÙ„ÙŠØ©', data.operational, 'destructive'], ['ØªØ­ØªØ§Ø¬ Ù‚Ø±Ø§Ø±Ù‹Ø§', data.ambiguous, 'warning'], ['ØªØ§Ø±ÙŠØ®ÙŠØ©/Ù…Ø³Ø¯Ø¯Ø©', data.historical, 'success']].map(([title, count, state]) => <div key={String(title)} className="rounded-md border p-3"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold">{count}</p><Badge tone={state as BadgeTone} className="mt-2">Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø·</Badge></div>)}</div>
      <div className="grid gap-2 sm:grid-cols-3"><select aria-label="ØªØµÙ†ÙŠÙ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©" value={bucket} onChange={(event) => setBucket(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">ÙƒÙ„ Ø§Ù„ØªØµÙ†ÙŠÙØ§Øª</option><option value="operational">ØªØ´ØºÙŠÙ„ÙŠ</option><option value="ambiguous">ÙŠØ­ØªØ§Ø¬ Ù‚Ø±Ø§Ø±</option><option value="historical">ØªØ§Ø±ÙŠØ®ÙŠ</option></select><select aria-label="Ù…ØµØ¯Ø± Ø§Ù„Ø·Ù„Ø¨" value={source} onChange={(event) => setSource(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">ÙƒÙ„ Ø§Ù„Ù…ØµØ§Ø¯Ø±</option><option value="qr">QR</option><option value="waiter">ÙˆÙŠØªØ±</option><option value="pos">Ù†Ù‚Ø·Ø© Ø§Ù„Ø¨ÙŠØ¹</option></select><select aria-label="Ø­Ø§Ù„Ø© Ø§Ù„Ø³Ø¯Ø§Ø¯" value={payment} onChange={(event) => setPayment(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">ÙƒÙ„ Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø³Ø¯Ø§Ø¯</option><option value="unpaid">ØºÙŠØ± Ù…Ø¯ÙÙˆØ¹</option><option value="paid">Ù…Ø¯ÙÙˆØ¹</option></select></div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø§Ù„Ø§Øª ØªØ·Ø§Ø¨Ù‚ Ø¹ÙˆØ§Ù…Ù„ Ø§Ù„ØªØµÙÙŠØ©.</p> : <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[960px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">Ø§Ù„Ø·Ù„Ø¨</th><th className="p-3 text-start">Ø§Ù„Ø·Ø§ÙˆÙ„Ø©</th><th className="p-3 text-start">Ø§Ù„Ø­Ø§Ù„Ø©</th><th className="p-3 text-start">Ø§Ù„Ø³Ø¯Ø§Ø¯/Ø§Ù„Ù…ØµØ¯Ø±</th><th className="p-3 text-start">Ø§Ù„Ù…Ø·Ø¨Ø®</th><th className="p-3 text-start">Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©</th><th className="p-3 text-start">Ø¥Ø¬Ø±Ø§Ø¡</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t align-top"><td className="p-3 font-medium">{row.orderNumber}</td><td className="p-3">{row.table}</td><td className="p-3"><Badge tone={tone(row.bucket)}>{label(row.status)} â€” {label(row.bucket)}</Badge></td><td className="p-3">{label(row.paymentStatus)}<span className="block pt-1 text-xs text-muted-foreground">{label(row.source)} Â· {label(row.shiftStatus)}</span></td><td className="p-3">{label(row.kitchenState)}</td><td className="p-3"><Badge tone={preview[row.id] ? 'warning' : 'muted'}>{preview[row.id] ? label('preview_only') : label('pending_review')}</Badge></td><td className="p-3"><Button variant="outline" size="sm" onClick={() => openRow(row)}>Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©</Button></td></tr>)}</tbody></table></div>}
    </CardContent></Card>
    {selected ? <Card className="border-primary/30"><CardHeader><CardTitle>ØªÙØ§ØµÙŠÙ„ Ù…Ø±Ø§Ø¬Ø¹Ø© {selected.orderNumber}</CardTitle><CardDescription>Ù„Ù‚Ø·Ø© Ù‚Ø±Ø§Ø± Ù…Ù‚ØªØ±Ø­. Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯ ÙˆØ§Ù„ØªÙ†ÙÙŠØ° ØºÙŠØ± Ù…ØªØ§Ø­ÙŠÙ† Ø§Ù„Ø¢Ù†.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 text-sm sm:grid-cols-2"><p>Ø§Ù„Ø·Ø§ÙˆÙ„Ø©: <b>{selected.table}</b></p><p>Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„ Ø§Ù„Ø­Ø§Ù„ÙŠ: <b>ØºÙŠØ± Ù…Ø³Ù†Ø¯</b></p><p>Ø§Ù„Ù…Ù†Ø´Ø¦ Ù…Ø³Ø¬Ù„: <b>{selected.creatorRecorded ? 'Ù†Ø¹Ù…' : 'Ù„Ø§'}</b></p><p>Ø¢Ø®Ø± ØªØ­Ø¯ÙŠØ«: <b>{new Date(selected.updatedAt).toLocaleString('ar-EG')}</b></p></div>{selected.bucket === 'historical' ? <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">Ù‡Ø°Ø§ Ø·Ù„Ø¨ ØªØ§Ø±ÙŠØ®ÙŠ Ø£Ùˆ Ù…Ø³Ø¯Ø¯Ø› Ø§Ù„Ø­Ù…Ø§ÙŠØ© ØªÙ…Ù†Ø¹ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù‚ØªØ±Ø§Ø­ ØªØ³ÙˆÙŠØ© Ù„Ù‡.</p> : <><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Ø§Ù„Ù‚Ø±Ø§Ø± Ø§Ù„Ù…Ù‚ØªØ±Ø­</span><select value={decision} onChange={(event) => { setDecision(event.target.value as ReconciliationDecision); setWaiterId(''); setError(null) }} className="h-10 w-full rounded-md border bg-background px-3"><option value="assign_waiter">Ø§Ù‚ØªØ±Ø§Ø­ Ø¥Ø³Ù†Ø§Ø¯ Ù„ÙˆÙŠØªØ±</option><option value="keep_unassigned">Ø§Ù„Ø¥Ø¨Ù‚Ø§Ø¡ Ø¨Ù„Ø§ Ù…Ø³Ø¤ÙˆÙ„</option><option value="review_later">Ù…Ø±Ø§Ø¬Ø¹Ø© Ù„Ø§Ø­Ù‚Ù‹Ø§</option><option value="resolve_through_existing_workflow">Ø§Ù„Ø­Ù„ Ø¹Ø¨Ø± Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯</option></select></label>{decision === 'assign_waiter' ? <label className="space-y-1 text-sm"><span>ÙˆÙŠØªØ± Ù…Ø¤Ù‡Ù„ (ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©)</span><select value={waiterId} onChange={(event) => { setWaiterId(event.target.value); setError(null) }} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Ø§Ø®ØªØ± Ø§Ù„ÙˆÙŠØªØ±</option>{selected.eligibleWaiters.map((waiter) => <option key={waiter.id} value={waiter.id}>{waiter.name}</option>)}</select></label> : null}</div><label className="block space-y-1 text-sm"><span>Ø³Ø¨Ø¨ Ø§Ù„Ù‚Ø±Ø§Ø± (Ù…Ø·Ù„ÙˆØ¨)</span><textarea value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }} maxLength={500} className="min-h-24 w-full rounded-md border bg-background p-3" placeholder="Ø³Ø¨Ø¨ ÙˆØ§Ø¶Ø­ Ù„Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©ØŒ Ø¯ÙˆÙ† Ø¨ÙŠØ§Ù†Ø§Øª Ø¹Ù…ÙŠÙ„ Ø­Ø³Ø§Ø³Ø©" /></label>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}{preview[selected.id] ? <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">ØªÙ… Ø¥Ø¹Ø¯Ø§Ø¯ Ù…Ø¹Ø§ÙŠÙ†Ø© ØºÙŠØ± Ù…Ø­ÙÙˆØ¸Ø©: {decisionLabels[preview[selected.id].decision]}. Ù„Ù† ØªÙ†Ø´Ø£ Ù…ÙˆØ§ÙÙ‚Ø© Ø£Ùˆ Ø­Ø±ÙƒØ© Ø£Ùˆ Ø¥Ø³Ù†Ø§Ø¯.</p> : null}<div className="flex flex-wrap gap-2"><Button onClick={createPreview}>Ø¥Ø¹Ø¯Ø§Ø¯ Ù…Ø¹Ø§ÙŠÙ†Ø© ÙÙ‚Ø·</Button><Button variant="outline" onClick={() => setSelectedId(null)}>Ø¥ØºÙ„Ø§Ù‚</Button></div></>}</CardContent></Card> : null}
  </section>
}


