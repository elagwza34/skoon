'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type EmployeeRow = { id: string; name: string; email: string | null; username?: string | null; roleName: string; role: string; active: boolean; status: string; hireDate: string | null; probationStatus: string | null }
type EmployeeDetail = {
  id: string; name: string; email?: string | null; username?: string | null; phone?: string | null; active: boolean; status?: string
  role?: { slug: string; name: string }; roleName?: string
  employeeProfile?: {
    employmentStatus: string; employmentType: string | null; hireDate: string | null; personalEmail: string | null; personalPhone: string | null; address: string | null
    emergencyContactName: string | null; emergencyContactPhone: string | null; probationStart: string | null; probationEnd: string | null; probationStatus: string | null
    contracts: Array<{ id: bigint | string; contractType: string; effectiveFrom: string; effectiveUntil: string | null }>
    compensationRates: Array<{ id: bigint | string; compensationType: string; paymentFrequency: string; amount: { toString(): string } | string | number; currency: string; effectiveFrom: string; effectiveUntil: string | null }>
  }
}

const dateInput = (value: string | null | undefined) => value ? value.slice(0, 10) : ''

export function EmployeeManagementBoard({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [selected, setSelected] = useState<EmployeeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [, transition] = useTransition()

  async function load() {
    setLoading(true); setError(null)
    try {
      const response = await fetch(`/api/staff/employees?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†')
      setRows(data.employees ?? [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function open(id: string) {
    setError(null)
    try {
      const response = await fetch(`/api/staff/employees/${id}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ù„Ù')
      setSelected(data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ù„Ù') }
  }

  async function post(path: string, body?: unknown) {
    const response = await fetch(path, { method: 'POST', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„ØªØºÙŠÙŠØ±')
    return data
  }

  async function archive() {
    if (!selected) return
    const reason = window.prompt('Ø³Ø¨Ø¨ Ø§Ù„Ø£Ø±Ø´ÙØ© (Ø¥Ù„Ø²Ø§Ù…ÙŠ):')
    if (!reason?.trim()) return
    try { await post(`/api/staff/employees/${selected.id}/archive`, { reason }); setSelected(null); transition(() => void load()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø£Ø±Ø´ÙØ© Ø§Ù„Ù…ÙˆØ¸Ù') }
  }

  async function reactivate() {
    if (!selected) return
    try { await post(`/api/staff/employees/${selected.id}/reactivate`); await open(selected.id); transition(() => void load()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªÙØ¹ÙŠÙ„') }
  }

  async function terminate() {
    if (!selected) return
    const reason = window.prompt('Ø³Ø¨Ø¨ Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ø®Ø¯Ù…Ø© (Ø¥Ù„Ø²Ø§Ù…ÙŠ):')
    if (!reason?.trim()) return
    try { await post(`/api/staff/employees/${selected.id}/terminate`, { reason }); setSelected(null); transition(() => void load()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø¥Ù†Ù‡Ø§Ø¡ Ø®Ø¯Ù…Ø© Ø§Ù„Ù…ÙˆØ¸Ù') }
  }

  return (
    <Card dir="rtl">
      <CardHeader><CardTitle>Ø¥Ø¯Ø§Ø±Ø© Ù…Ù„ÙØ§Øª Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ø§Ø¨Ø­Ø« Ø¨Ø§Ù„Ø§Ø³Ù… Ø£Ùˆ Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø£Ùˆ Ø§Ù„Ø¨Ø±ÙŠØ¯" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="active">Ø§Ù„Ù†Ø´Ø·ÙˆÙ†</option><option value="inactive">ØºÙŠØ± Ø§Ù„Ù†Ø´Ø·ÙŠÙ†</option><option value="archived">Ø§Ù„Ù…Ø¤Ø±Ø´ÙÙˆÙ†</option><option value="terminated">Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ© Ø®Ø¯Ù…ØªÙ‡Ù…</option><option value="all">Ø§Ù„ÙƒÙ„</option>
          </select>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>ØªØ­Ø¯ÙŠØ«</Button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ù…ÙŠÙ„â€¦</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ø¬Ù„Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø©.</p> : null}
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((employee) => <button key={employee.id} onClick={() => void open(employee.id)} className="rounded-lg border border-border p-3 text-start transition hover:bg-accent/40">
            <b>{employee.name}</b><div className="mt-1 text-xs text-muted-foreground">{employee.roleName} Â· {employee.status} Â· {employee.username ?? employee.email ?? 'â€”'}</div>
          </button>)}
        </div>
        {selected ? <EmployeeDetailPanel employee={selected} canManage={canManage} onClose={() => setSelected(null)} onChanged={() => { void open(selected.id); transition(() => void load()) }} onArchive={archive} onReactivate={reactivate} onTerminate={terminate} post={post} setError={setError} /> : null}
      </CardContent>
    </Card>
  )
}

function EmployeeDetailPanel({ employee, canManage, onClose, onChanged, onArchive, onReactivate, onTerminate, post, setError }: { employee: EmployeeDetail; canManage: boolean; onClose: () => void; onChanged: () => void; onArchive: () => void; onReactivate: () => void; onTerminate: () => void; post: (path: string, body?: unknown) => Promise<unknown>; setError: (value: string | null) => void }) {
  const p = employee.employeeProfile
  const [name, setName] = useState(employee.name)
  const [phone, setPhone] = useState(employee.phone ?? '')
  const [employmentType, setEmploymentType] = useState(p?.employmentType ?? '')
  const [hireDate, setHireDate] = useState(dateInput(p?.hireDate))
  const [personalEmail, setPersonalEmail] = useState(p?.personalEmail ?? '')
  const [personalPhone, setPersonalPhone] = useState(p?.personalPhone ?? '')
  const [address, setAddress] = useState(p?.address ?? '')
  const [emergencyName, setEmergencyName] = useState(p?.emergencyContactName ?? '')
  const [emergencyPhone, setEmergencyPhone] = useState(p?.emergencyContactPhone ?? '')
  const [probationStart, setProbationStart] = useState(dateInput(p?.probationStart))
  const [probationEnd, setProbationEnd] = useState(dateInput(p?.probationEnd))
  const [probationStatus, setProbationStatus] = useState(p?.probationStatus ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/staff/employees/${employee.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, phone: phone || null, employmentType: employmentType || null, hireDate: hireDate || null, personalEmail: personalEmail || null, personalPhone: personalPhone || null, address: address || null, emergencyContactName: emergencyName || null, emergencyContactPhone: emergencyPhone || null, probationStart: probationStart || null, probationEnd: probationEnd || null, probationStatus: probationStatus || null }) })
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ù…Ù„Ù')
      onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ù…Ù„Ù') }
    finally { setBusy(false) }
  }

  return <aside role="dialog" aria-modal="true" aria-label={`Ù…Ù„Ù ${employee.name}`} className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-s border-border bg-background p-4 shadow-2xl sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Ù…Ù„Ù {employee.name}</h3><Button variant="ghost" size="sm" onClick={onClose}>Ø¥ØºÙ„Ø§Ù‚</Button></div>
    {!canManage ? <p className="text-sm text-muted-foreground">Ù‡Ø°Ù‡ Ø¨ÙŠØ§Ù†Ø§Øª ØªØ´ØºÙŠÙ„ÙŠØ© ÙÙ‚Ø·. Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø´Ø®ØµÙŠØ© ÙˆØ§Ù„ØªØ¹ÙˆÙŠØ¶Ø§Øª ÙˆØ§Ù„Ø¹Ù‚ÙˆØ¯ Ù…ØªØ§Ø­Ø© Ù„Ù„Ù…Ø§Ù„Ùƒ ÙÙ‚Ø·.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Ø§Ù„Ø§Ø³Ù…<Input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="text-sm">Ù‡Ø§ØªÙ Ø§Ù„Ø¹Ù…Ù„<Input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="text-sm">Ù†ÙˆØ¹ Ø§Ù„ØªÙˆØ¸ÙŠÙ<Input value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} placeholder="Ù…Ø¨Ø§Ø´Ø± Ø£Ùˆ ØªØ­Øª Ø§Ù„ØªØ¬Ø±Ø¨Ø©" /></label>
        <label className="text-sm">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¨Ø¯Ø§ÙŠØ©<Input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} /></label>
        <label className="text-sm">Ø§Ø³Ù… Ø¬Ù‡Ø© Ø§Ù„Ø·ÙˆØ§Ø±Ø¦<Input value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} /></label>
        <label className="text-sm">Ù‡Ø§ØªÙ Ø¬Ù‡Ø© Ø§Ù„Ø·ÙˆØ§Ø±Ø¦<Input value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={busy}>Ø­ÙØ¸ Ø§Ù„Ù…Ù„Ù</Button>{p?.employmentStatus === 'archived' || p?.employmentStatus === 'terminated' ? <Button variant="outline" onClick={() => void onReactivate()}>Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªÙØ¹ÙŠÙ„</Button> : <><Button variant="outline" onClick={() => void onTerminate()}>Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„Ø®Ø¯Ù…Ø©</Button><Button variant="destructive" onClick={() => void onArchive()}>Ø£Ø±Ø´ÙØ©</Button></>}</div>
      <div className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-2">
        <label className="text-sm">Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø´Ø®ØµÙŠ<Input type="email" value={personalEmail} onChange={(event) => setPersonalEmail(event.target.value)} /></label>
        <label className="text-sm">Ø§Ù„Ù‡Ø§ØªÙ Ø§Ù„Ø´Ø®ØµÙŠ<Input value={personalPhone} onChange={(event) => setPersonalPhone(event.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Ø§Ù„Ø¹Ù†ÙˆØ§Ù†<Input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
        <label className="text-sm">Ø¨Ø¯Ø§ÙŠØ© ÙØªØ±Ø© Ø§Ù„ØªØ¬Ø±Ø¨Ø©<Input type="date" value={probationStart} onChange={(event) => setProbationStart(event.target.value)} /></label>
        <label className="text-sm">Ù†Ù‡Ø§ÙŠØ© ÙØªØ±Ø© Ø§Ù„ØªØ¬Ø±Ø¨Ø©<Input type="date" value={probationEnd} onChange={(event) => setProbationEnd(event.target.value)} /></label>
        <label className="text-sm">Ø­Ø§Ù„Ø© ÙØªØ±Ø© Ø§Ù„ØªØ¬Ø±Ø¨Ø©<select value={probationStatus} onChange={(event) => setProbationStatus(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-foreground"><option value="">ØºÙŠØ± Ù…Ø­Ø¯Ø¯Ø©</option><option value="active">Ù‚ÙŠØ¯ Ø§Ù„ØªØ¬Ø±Ø¨Ø©</option><option value="passed">ØªÙ… Ø§Ù„ØªØ«Ø¨ÙŠØª</option><option value="failed">Ù„Ù… ÙŠØ¬ØªØ²</option><option value="cancelled">Ù…Ù„ØºØ§Ø©</option></select></label>
      </div>
      <div><Button onClick={() => void save()} disabled={busy}>Ø­ÙØ¸ Ø¨ÙŠØ§Ù†Ø§Øª HR</Button></div>
      <HistoryPanels employee={employee} post={post} onChanged={onChanged} setError={setError} />
    </>}
  </aside>
}

function HistoryPanels({ employee, post, onChanged, setError }: { employee: EmployeeDetail; post: (path: string, body?: unknown) => Promise<unknown>; onChanged: () => void; setError: (value: string | null) => void }) {
  const [contractType, setContractType] = useState('fixed_term')
  const [contractStart, setContractStart] = useState('')
  const [rateType, setRateType] = useState('monthly')
  const [rateFrequency, setRateFrequency] = useState('monthly')
  const [rateAmount, setRateAmount] = useState('')
  const [rateStart, setRateStart] = useState('')
  async function addContract() { try { await post(`/api/staff/employees/${employee.id}/contracts`, { contractType, effectiveFrom: contractStart }); onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø¹Ù‚Ø¯') } }
  async function addRate() { try { await post(`/api/staff/employees/${employee.id}/compensation`, { compensationType: rateType, paymentFrequency: rateFrequency, amount: rateAmount, effectiveFrom: rateStart }); onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØªØ¹ÙˆÙŠØ¶') } }
  const profile = employee.employeeProfile
  return <div className="grid gap-4 lg:grid-cols-2">
    <div className="rounded-lg border bg-background p-3"><b>Ø§Ù„Ø¹Ù‚ÙˆØ¯ ÙˆØ§Ù„Ø³Ø¬Ù„</b><div className="mt-2 space-y-1 text-xs">{profile?.contracts.map((contract) => <div key={String(contract.id)}>{contract.contractType} Â· {dateInput(contract.effectiveFrom)} Ø¥Ù„Ù‰ {dateInput(contract.effectiveUntil) || 'Ù…ÙØªÙˆØ­'}</div>)}</div><div className="mt-3 flex gap-2"><Input value={contractType} onChange={(e) => setContractType(e.target.value)} /><Input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} /><Button size="sm" disabled={!contractStart} onClick={() => void addContract()}>Ø¥Ø¶Ø§ÙØ©</Button></div></div>
    <div className="rounded-lg border bg-background p-3"><b>ØªØ§Ø±ÙŠØ® Ø§Ù„ØªØ¹ÙˆÙŠØ¶</b><p className="mt-1 text-xs text-muted-foreground">Ù„Ø§ ØªÙÙ†Ø´Ø¦ Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø§Ø´Ø© Payroll Ø£Ùˆ Ø­Ø±ÙƒØ© Ù…Ø§Ù„ÙŠØ©.</p><div className="mt-2 space-y-1 text-xs">{profile?.compensationRates.map((rate) => <div key={String(rate.id)}>{rate.compensationType} Â· {String(rate.amount)} {rate.currency} Â· ÙŠØ¨Ø¯Ø£ {dateInput(rate.effectiveFrom)}</div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={rateType} onChange={(e) => setRateType(e.target.value)} className="h-10 rounded border bg-background px-2"><option value="monthly">Ø´Ù‡Ø±ÙŠ</option><option value="daily">ÙŠÙˆÙ…ÙŠ</option><option value="hourly">Ø¨Ø§Ù„Ø³Ø§Ø¹Ø©</option><option value="per_shift">Ø¨Ø§Ù„ÙˆØ±Ø¯ÙŠØ©</option></select><select value={rateFrequency} onChange={(e) => setRateFrequency(e.target.value)} className="h-10 rounded border bg-background px-2"><option value="weekly">Ø£Ø³Ø¨ÙˆØ¹ÙŠ</option><option value="semi_monthly">Ù†ØµÙ Ø´Ù‡Ø±ÙŠ</option><option value="monthly">Ø´Ù‡Ø±ÙŠ</option></select><Input inputMode="decimal" value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} placeholder="Ø§Ù„Ù…Ø¨Ù„Øº" /><Input type="date" value={rateStart} onChange={(e) => setRateStart(e.target.value)} /><Button size="sm" disabled={!rateAmount || !rateStart} onClick={() => void addRate()}>Ø¥Ø¶Ø§ÙØ© Ø³Ø¹Ø±</Button></div></div>
    <EmployeeDocumentsPanel employeeId={employee.id} />
  </div>
}

function EmployeeDocumentsPanel({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; kind: string }>>([]); const [file, setFile] = useState<File | null>(null); const [kind, setKind] = useState('other'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { const response = await fetch(`/api/staff/hr/documents?employeeId=${encodeURIComponent(employeeId)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.documents ?? []) } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª') } }, [employeeId])
  useEffect(() => { void load() }, [load])
  const upload = async () => { if (!file) return; setBusy(true); setError(''); try { const form = new FormData(); form.set('employeeId', employeeId); form.set('kind', kind); form.set('file', file); const response = await fetch('/api/staff/hr/documents', { method: 'POST', body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setFile(null); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø±ÙØ¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯') } finally { setBusy(false) } }
  const open = async (id: string) => { try { const response = await fetch(`/api/staff/hr/documents/${id}/signed-url`); const data = await response.json(); if (!response.ok) throw new Error(data.error); window.open(data.url, '_blank', 'noopener,noreferrer') } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ÙØªØ­ Ø§Ù„Ù…Ø³ØªÙ†Ø¯') } }
  return <div className="rounded-lg border bg-background p-3 lg:col-span-2"><b>Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ø®Ø§ØµØ©</b><p className="mt-1 text-xs text-muted-foreground">PDF Ø£Ùˆ ØµÙˆØ± Ø­ØªÙ‰ 8 MBØ› Ø±ÙˆØ§Ø¨Ø· Ø§Ù„ØªØ­Ù…ÙŠÙ„ Ù…Ø¤Ù‚ØªØ© ÙˆÙ…Ø®ÙˆÙ‘Ù„Ø© Ù„Ù„Ù…Ø§Ù„Ùƒ ÙÙ‚Ø·.</p>{error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><select value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 rounded border bg-background px-2 text-sm"><option value="national_id_front">Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù‚ÙˆÙ…ÙŠ â€” Ø£Ù…Ø§Ù…ÙŠ</option><option value="national_id_back">Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù‚ÙˆÙ…ÙŠ â€” Ø®Ù„ÙÙŠ</option><option value="signed_contract">Ø¹Ù‚Ø¯ Ù…ÙˆÙ‚Ù‘Ø¹</option><option value="other">Ù…Ø³ØªÙ†Ø¯ Ø¢Ø®Ø±</option></select><Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="max-w-xs"/><Button size="sm" disabled={!file || busy} onClick={() => void upload()}>Ø±ÙØ¹</Button></div><div className="mt-3 flex flex-wrap gap-2">{rows.map((row) => <Button key={row.id} size="sm" variant="outline" onClick={() => void open(row.id)}>{row.kind}</Button>)}</div></div>
}


