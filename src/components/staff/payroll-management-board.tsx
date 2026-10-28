'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Employee = { id: string; name: string; branchId: string | null }
type Row = { id: string; status: string; type?: string; amount?: string; reason?: string; employeeId?: string; startsOn?: string; endsOn?: string; branchId?: string; period?: { startsOn: string; endsOn: string } | null; lines?: unknown[] }
const text = (value: unknown) => String(value ?? '')
const label: Record<string, string> = { pending: 'بانتظار القرار', approved: 'معتمد', rejected: 'مرفوض', draft: 'مسودة', under_review: 'قيد المراجعة', partially_paid: 'مدفوع جزئيًا', paid: 'مدفوع', closed: 'مغلق', bonus: 'مكافأة', deduction: 'خصم', penalty: 'جزاء' }
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
    if (!a.ok) throw new Error(ad.error ?? 'تعذر تحميل سجلات HR المالية')
    if (!p.ok) throw new Error(pd.error ?? 'تعذر تحميل مسير الرواتب')
    setFinancials({ adjustments: ad.adjustments ?? [], advances: ad.advances ?? [] }); setRuns(pd.runs ?? [])
  }, [canManage])
  useEffect(() => { void load().catch((e) => setMessage(e instanceof Error ? e.message : 'تعذر التحميل')) }, [load])
  const submit = async (url: string, body: unknown) => { setBusy(true); setMessage(''); try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'تعذر الحفظ'); await load(); setMessage('تم الحفظ بنجاح.') } catch (e) { setMessage(e instanceof Error ? e.message : 'تعذر الحفظ') } finally { setBusy(false) } }
  const createPeriodAndRun = async () => { const branchId = employees.find((employee) => employee.branchId)?.branchId; if (!branchId) { setMessage('لا يوجد موظف تابع لفرع لإنشاء مسير الرواتب.'); return } setBusy(true); setMessage(''); try { const periodResponse = await fetch('/api/staff/hr/payroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'period', startsOn: periodStart, endsOn: periodEnd }) }); const periodData = await periodResponse.json(); if (!periodResponse.ok) throw new Error(periodData.error ?? 'تعذر إنشاء فترة الرواتب'); const runResponse = await fetch('/api/staff/hr/payroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'run', periodId: String(periodData.period.id), branchId }) }); const runData = await runResponse.json(); if (!runResponse.ok) throw new Error(runData.error ?? 'تم إنشاء الفترة لكن تعذر إنشاء المسير'); await load(); setMessage('تم إنشاء فترة ومسودة رواتب للفرع.') } catch (e) { setMessage(e instanceof Error ? e.message : 'تعذر إنشاء مسير الرواتب') } finally { setBusy(false) } }
  if (!canManage) return null
  return <section dir="rtl" className="grid gap-4 xl:grid-cols-2">
    <Card><CardHeader><CardTitle>المكافآت والخصومات والسلف</CardTitle><CardDescription>لا تسجل هذه الإجراءات أي حركة في صندوق الكاشير أو العهدة.</CardDescription></CardHeader><CardContent className="space-y-3">
      {message ? <p role="status" className="rounded border border-border px-3 py-2 text-sm">{message}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2"><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3">{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 rounded-lg border border-border bg-background px-3"><option value="bonus">مكافأة</option><option value="deduction">خصم</option><option value="penalty">جزاء</option></select><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="المبلغ بالجنيه"/><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب"/></div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !employeeId} onClick={() => submit('/api/staff/hr/financials', { kind: 'adjustment', employeeId, type: kind, amount, effectiveOn: new Date().toISOString().slice(0, 10), reason })}>إضافة بند</Button><Button variant="outline" disabled={busy || !employeeId} onClick={() => submit('/api/staff/hr/financials', { kind: 'advance', employeeId, amount, reason })}>طلب سلفة</Button></div>
      <div className="max-h-56 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-card text-start text-muted-foreground"><tr><th>النوع</th><th>المبلغ</th><th>الحالة</th><th /></tr></thead><tbody>{[...financials.adjustments, ...financials.advances].map((row) => <tr key={`${row.id}-${row.reason}`} className="border-t"><td className="py-2">{label[row.type ?? ''] ?? 'سلفة'}</td><td>{text(row.amount)} ج.م</td><td><Badge tone={tone(row.status) as never}>{label[row.status] ?? row.status}</Badge></td><td>{row.status === 'pending' ? <span className="flex gap-1"><Button size="sm" disabled={busy} onClick={() => submit(`/api/staff/hr/financials/${row.id}`, { kind: row.type ? 'adjustment' : 'advance', approve: true })}>اعتماد</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => submit(`/api/staff/hr/financials/${row.id}`, { kind: row.type ? 'adjustment' : 'advance', approve: false })}>رفض</Button></span> : null}</td></tr>)}</tbody></table></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>مسير الرواتب</CardTitle><CardDescription>لا يمكن اعتماد مسير بلا سطور احتساب خادمية موثقة.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}/><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}/></div><Button disabled={busy || !periodStart || !periodEnd} onClick={createPeriodAndRun}>إنشاء فترة ومسودة</Button><div className="max-h-56 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-card text-start text-muted-foreground"><tr><th>الفترة</th><th>الحالة</th><th>السطور</th><th>إجراء</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="border-t"><td className="py-2">{run.period ? `${String(run.period.startsOn).slice(0, 10)} — ${String(run.period.endsOn).slice(0, 10)}` : '—'}</td><td><Badge tone={tone(run.status) as never}>{label[run.status] ?? run.status}</Badge></td><td>{run.lines?.length ?? 0}</td><td className="py-1"><span className="flex flex-wrap gap-1">{run.status === 'draft' ? <Button size="sm" disabled={busy} onClick={() => submit(`/api/staff/hr/payroll/${run.id}`, { action: 'generate' })}>احتساب</Button> : null}{run.status === 'draft' && (run.lines?.length ?? 0) > 0 ? <Button size="sm" variant="outline" disabled={busy} onClick={() => submit(`/api/staff/hr/payroll/${run.id}`, { action: 'review' })}>مراجعة</Button> : null}{run.status === 'under_review' ? <Button size="sm" disabled={busy} onClick={() => submit(`/api/staff/hr/payroll/${run.id}`, { action: 'approve' })}>اعتماد</Button> : null}</span></td></tr>)}</tbody></table></div></CardContent></Card>
  </section>
}
