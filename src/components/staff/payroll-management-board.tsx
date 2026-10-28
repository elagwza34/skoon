'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Employee = { id: string; name: string; branchId: string | null }
type Row = { id: string; status: string; type?: string; amount?: string; reason?: string; employeeId?: string; startsOn?: string; endsOn?: string; branchId?: string; period?: { startsOn: string; endsOn: string } | null; lines?: unknown[] }
const text = (value: unknown) => String(value ?? '')
const label: Record<string, string> = { pending: 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù‚Ø±Ø§Ø±', approved: 'Ù…Ø¹ØªÙ…Ø¯', rejected: 'Ù…Ø±ÙÙˆØ¶', draft: 'Ù…Ø³ÙˆØ¯Ø©', under_review: 'Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©', partially_paid: 'Ù…Ø¯ÙÙˆØ¹ Ø¬Ø²Ø¦ÙŠÙ‹Ø§', paid: 'Ù…Ø¯ÙÙˆØ¹', closed: 'Ù…ØºÙ„Ù‚', bonus: 'Ù…ÙƒØ§ÙØ£Ø©', deduction: 'Ø®ØµÙ…', penalty: 'Ø¬Ø²Ø§Ø¡' }
const tone = (s: string) => s === 'approved' || s === 'paid' ? 'success' : s === 'rejected' ? 'destructive' : s === 'pending' || s === 'under_review' ? 'warning' : 'muted'

/** Compact, real-data owner workspace for the financial HR records. The server
 * retains all authorization and mutation rules; this component only renders
 * returned records and submits explicit owner actions. */
export function PayrollManagementBoard({ employees, canManage }: { employees: Employee[]; canManage: boolean }) {
  const [financials, setFinancials] = useState<{ adjustments: Row[]; advances: Row[] }>({ adjustments: [], advances: [] })
  const [runs, setRuns] = useState<Row[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [kind, setKind] = useState<'bonus' | 'deduction' | 'penalty'>('bonus')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const load = useCallback(async () => {
    if (!canManage) return
    const [a, p] = await Promise.all([fetch('/api/staff/hr/financials'), fetch('/api/staff/hr/payroll')])
    const ad = await a.json(); const pd = await p.json()
    if (!a.ok) throw new Error(ad.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø³Ø¬Ù„Ø§Øª HR Ø§Ù„Ù…Ø§Ù„ÙŠØ©')
    if (!p.ok) throw new Error(pd.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨')
    setFinancials({ adjustments: ad.adjustments ?? [], advances: ad.advances ?? [] }); setRuns(pd.runs ?? [])
  }, [canManage])
  useEffect(() => { void load().catch((e) => setMessage(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± Ø§Ù„ØªØ­Ù…ÙŠÙ„')) }, [load])
  const submit = async (url: string, body: unknown) => { setBusy(true); setMessage(''); try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'ØªØ¹Ø°Ø± Ø§Ù„Ø­ÙØ¸'); await load(); setMessage('ØªÙ… Ø§Ù„Ø­ÙØ¸ Ø¨Ù†Ø¬Ø§Ø­.') } catch (e) { setMessage(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± Ø§Ù„Ø­ÙØ¸') } finally { setBusy(false) } }
  const createPeriodAndRun = async () => { const branchId = employees.find((employee) => employee.branchId)?.branchId; if (!branchId) { setMessage('Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…ÙˆØ¸Ù ØªØ§Ø¨Ø¹ Ù„ÙØ±Ø¹ Ù„Ø¥Ù†Ø´Ø§Ø¡ Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨.'); return } setBusy(true); setMessage(''); try { const periodResponse = await fetch('/api/staff/hr/payroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'period', startsOn: periodStart, endsOn: periodEnd }) }); const periodData = await periodResponse.json(); if (!periodResponse.ok) throw new Error(periodData.error ?? 'ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ ÙØªØ±Ø© Ø§Ù„Ø±ÙˆØ§ØªØ¨'); const runResponse = await fetch('/api/staff/hr/payroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'run', periodId: String(periodData.period.id), branchId }) }); const runData = await runResponse.json(); if (!runResponse.ok) throw new Error(runData.error ?? 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØªØ±Ø© Ù„ÙƒÙ† ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø³ÙŠØ±'); await load(); setMessage('ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ ÙØªØ±Ø© ÙˆÙ…Ø³ÙˆØ¯Ø© Ø±ÙˆØ§ØªØ¨ Ù„Ù„ÙØ±Ø¹.') } catch (e) { setMessage(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨') } finally { setBusy(false) } }
  if (!canManage) return null
  return <section dir="rtl" className="grid gap-4 xl:grid-cols-2">
    <Card><CardHeader><CardTitle>Ø§Ù„Ù…ÙƒØ§ÙØ¢Øª ÙˆØ§Ù„Ø®ØµÙˆÙ…Ø§Øª ÙˆØ§Ù„Ø³Ù„Ù</CardTitle><CardDescription>Ù„Ø§ ØªØ³Ø¬Ù„ Ù‡Ø°Ù‡ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø£ÙŠ Ø­Ø±ÙƒØ© ÙÙŠ ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ø£Ùˆ Ø§Ù„Ø¹Ù‡Ø¯Ø©.</CardDescription></CardHeader><CardContent className="space-y-3">
      {message ? <p role="status" className="rounded border border-border px-3 py-2 text-sm">{message}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2"><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3">{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 rounded-lg border border-border bg-background px-3"><option value="bonus">Ù…ÙƒØ§ÙØ£Ø©</option><option value="deduction">Ø®ØµÙ…</option><option value="penalty">Ø¬Ø²Ø§Ø¡</option></select><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Ø§Ù„Ù…Ø¨Ù„Øº Ø¨Ø§Ù„Ø¬Ù†ÙŠÙ‡"/><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ø§Ù„Ø³Ø¨Ø¨"/></div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !employeeId} onClick={() => submit('/api/staff/hr/financials', { kind: 'adjustment', employeeId, type: kind, amount, effectiveOn: new Date().toISOString().slice(0, 10), reason })}>Ø¥Ø¶Ø§ÙØ© Ø¨Ù†Ø¯</Button><Button variant="outline" disabled={busy || !employeeId} onClick={() => submit('/api/staff/hr/financials', { kind: 'advance', employeeId, amount, reason })}>Ø·Ù„Ø¨ Ø³Ù„ÙØ©</Button></div>
      <div className="max-h-56 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-card text-start text-muted-foreground"><tr><th>Ø§Ù„Ù†ÙˆØ¹</th><th>Ø§Ù„Ù…Ø¨Ù„Øº</th><th>Ø§Ù„Ø­Ø§Ù„Ø©</th><th /></tr></thead><tbody>{[...financials.adjustments, ...financials.advances].map((row) => <tr key={`${row.id}-${row.reason}`} className="border-t"><td className="py-2">{label[row.type ?? ''] ?? 'Ø³Ù„ÙØ©'}</td><td>{text(row.amount)} Ø¬.Ù…</td><td><Badge tone={tone(row.status) as never}>{label[row.status] ?? row.status}</Badge></td><td>{row.status === 'pending' ? <span className="flex gap-1"><Button size="sm" disabled={busy} onClick={() => submit(`/api/staff/hr/financials/${row.id}`, { kind: row.type ? 'adjustment' : 'advance', approve: true })}>Ø§Ø¹ØªÙ…Ø§Ø¯</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => submit(`/api/staff/hr/financials/${row.id}`, { kind: row.type ? 'adjustment' : 'advance', approve: false })}>Ø±ÙØ¶</Button></span> : null}</td></tr>)}</tbody></table></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨</CardTitle><CardDescription>Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ø¹ØªÙ…Ø§Ø¯ Ù…Ø³ÙŠØ± Ø¨Ù„Ø§ Ø³Ø·ÙˆØ± Ø§Ø­ØªØ³Ø§Ø¨ Ø®Ø§Ø¯Ù…ÙŠØ© Ù…ÙˆØ«Ù‚Ø©.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}/><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}/></div><Button disabled={busy || !periodStart || !periodEnd} onClick={createPeriodAndRun}>Ø¥Ù†Ø´Ø§Ø¡ ÙØªØ±Ø© ÙˆÙ…Ø³ÙˆØ¯Ø©</Button><div className="max-h-56 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-card text-start text-muted-foreground"><tr><th>Ø§Ù„ÙØªØ±Ø©</th><th>Ø§Ù„Ø­Ø§Ù„Ø©</th><th>Ø§Ù„Ø³Ø·ÙˆØ±</th><th>Ø¥Ø¬Ø±Ø§Ø¡</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="border-t"><td className="py-2">{run.period ? `${String(run.period.startsOn).slice(0, 10)} â€” ${String(run.period.endsOn).slice(0, 10)}` : 'â€”'}</td><td><Badge tone={tone(run.status) as never}>{label[run.status] ?? run.status}</Badge></td><td>{run.lines?.length ?? 0}</td><td className="py-1"><span className="flex flex-wrap gap-1">{run.status === 'draft' ? <Button size="sm" disabled={busy} onClick={() => submit(`/api/staff/hr/payroll/${run.id}`, { action: 'generate' })}>Ø§Ø­ØªØ³Ø§Ø¨</Button> : null}{run.status === 'draft' && (run.lines?.length ?? 0) > 0 ? <Button size="sm" variant="outline" disabled={busy} onClick={() => submit(`/api/staff/hr/payroll/${run.id}`, { action: 'review' })}>Ù…Ø±Ø§Ø¬Ø¹Ø©</Button> : null}{run.status === 'under_review' ? <Button size="sm" disabled={busy} onClick={() => submit(`/api/staff/hr/payroll/${run.id}`, { action: 'approve' })}>Ø§Ø¹ØªÙ…Ø§Ø¯</Button> : null}</span></td></tr>)}</tbody></table></div></CardContent></Card>
  </section>
}


