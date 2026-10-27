'use client'

import { useEffect, useState, useTransition } from 'react'
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
      if (!response.ok) throw new Error(data.error ?? 'تعذر تحميل الموظفين')
      setRows(data.employees ?? [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل الموظفين') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function open(id: string) {
    setError(null)
    try {
      const response = await fetch(`/api/staff/employees/${id}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'تعذر تحميل الملف')
      setSelected(data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل الملف') }
  }

  async function post(path: string, body?: unknown) {
    const response = await fetch(path, { method: 'POST', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'تعذر حفظ التغيير')
    return data
  }

  async function archive() {
    if (!selected) return
    const reason = window.prompt('سبب الأرشفة (إلزامي):')
    if (!reason?.trim()) return
    try { await post(`/api/staff/employees/${selected.id}/archive`, { reason }); setSelected(null); transition(() => void load()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر أرشفة الموظف') }
  }

  async function reactivate() {
    if (!selected) return
    try { await post(`/api/staff/employees/${selected.id}/reactivate`); await open(selected.id); transition(() => void load()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إعادة التفعيل') }
  }

  async function terminate() {
    if (!selected) return
    const reason = window.prompt('سبب إنهاء الخدمة (إلزامي):')
    if (!reason?.trim()) return
    try { await post(`/api/staff/employees/${selected.id}/terminate`, { reason }); setSelected(null); transition(() => void load()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إنهاء خدمة الموظف') }
  }

  return (
    <Card dir="rtl">
      <CardHeader><CardTitle>إدارة ملفات الموظفين</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو اسم المستخدم أو البريد" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="active">النشطون</option><option value="inactive">غير النشطين</option><option value="archived">المؤرشفون</option><option value="terminated">المنتهية خدمتهم</option><option value="all">الكل</option>
          </select>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>تحديث</Button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد سجلات مطابقة.</p> : null}
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((employee) => <button key={employee.id} onClick={() => void open(employee.id)} className="rounded-lg border border-border p-3 text-start transition hover:bg-accent/40">
            <b>{employee.name}</b><div className="mt-1 text-xs text-muted-foreground">{employee.roleName} · {employee.status} · {employee.username ?? employee.email ?? '—'}</div>
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
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? 'تعذر حفظ الملف')
      onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حفظ الملف') }
    finally { setBusy(false) }
  }

  return <aside role="dialog" aria-modal="true" aria-label={`ملف ${employee.name}`} className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-s border-border bg-background p-4 shadow-2xl sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">ملف {employee.name}</h3><Button variant="ghost" size="sm" onClick={onClose}>إغلاق</Button></div>
    {!canManage ? <p className="text-sm text-muted-foreground">هذه بيانات تشغيلية فقط. البيانات الشخصية والتعويضات والعقود متاحة للمالك فقط.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">الاسم<Input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="text-sm">هاتف العمل<Input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="text-sm">نوع التوظيف<Input value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} placeholder="مباشر أو تحت التجربة" /></label>
        <label className="text-sm">تاريخ البداية<Input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} /></label>
        <label className="text-sm">اسم جهة الطوارئ<Input value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} /></label>
        <label className="text-sm">هاتف جهة الطوارئ<Input value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={busy}>حفظ الملف</Button>{p?.employmentStatus === 'archived' || p?.employmentStatus === 'terminated' ? <Button variant="outline" onClick={() => void onReactivate()}>إعادة التفعيل</Button> : <><Button variant="outline" onClick={() => void onTerminate()}>إنهاء الخدمة</Button><Button variant="destructive" onClick={() => void onArchive()}>أرشفة</Button></>}</div>
      <div className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-2">
        <label className="text-sm">البريد الشخصي<Input type="email" value={personalEmail} onChange={(event) => setPersonalEmail(event.target.value)} /></label>
        <label className="text-sm">الهاتف الشخصي<Input value={personalPhone} onChange={(event) => setPersonalPhone(event.target.value)} /></label>
        <label className="text-sm sm:col-span-2">العنوان<Input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
        <label className="text-sm">بداية فترة التجربة<Input type="date" value={probationStart} onChange={(event) => setProbationStart(event.target.value)} /></label>
        <label className="text-sm">نهاية فترة التجربة<Input type="date" value={probationEnd} onChange={(event) => setProbationEnd(event.target.value)} /></label>
        <label className="text-sm">حالة فترة التجربة<select value={probationStatus} onChange={(event) => setProbationStatus(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-foreground"><option value="">غير محددة</option><option value="active">قيد التجربة</option><option value="passed">تم التثبيت</option><option value="failed">لم يجتز</option><option value="cancelled">ملغاة</option></select></label>
      </div>
      <div><Button onClick={() => void save()} disabled={busy}>حفظ بيانات HR</Button></div>
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
  async function addContract() { try { await post(`/api/staff/employees/${employee.id}/contracts`, { contractType, effectiveFrom: contractStart }); onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إضافة العقد') } }
  async function addRate() { try { await post(`/api/staff/employees/${employee.id}/compensation`, { compensationType: rateType, paymentFrequency: rateFrequency, amount: rateAmount, effectiveFrom: rateStart }); onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إضافة التعويض') } }
  const profile = employee.employeeProfile
  return <div className="grid gap-4 lg:grid-cols-2">
    <div className="rounded-lg border bg-background p-3"><b>العقود والسجل</b><div className="mt-2 space-y-1 text-xs">{profile?.contracts.map((contract) => <div key={String(contract.id)}>{contract.contractType} · {dateInput(contract.effectiveFrom)} إلى {dateInput(contract.effectiveUntil) || 'مفتوح'}</div>)}</div><div className="mt-3 flex gap-2"><Input value={contractType} onChange={(e) => setContractType(e.target.value)} /><Input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} /><Button size="sm" disabled={!contractStart} onClick={() => void addContract()}>إضافة</Button></div></div>
    <div className="rounded-lg border bg-background p-3"><b>تاريخ التعويض</b><p className="mt-1 text-xs text-muted-foreground">لا تُنشئ هذه الشاشة Payroll أو حركة مالية.</p><div className="mt-2 space-y-1 text-xs">{profile?.compensationRates.map((rate) => <div key={String(rate.id)}>{rate.compensationType} · {String(rate.amount)} {rate.currency} · يبدأ {dateInput(rate.effectiveFrom)}</div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={rateType} onChange={(e) => setRateType(e.target.value)} className="h-10 rounded border bg-background px-2"><option value="monthly">شهري</option><option value="daily">يومي</option><option value="hourly">بالساعة</option><option value="per_shift">بالوردية</option></select><select value={rateFrequency} onChange={(e) => setRateFrequency(e.target.value)} className="h-10 rounded border bg-background px-2"><option value="weekly">أسبوعي</option><option value="semi_monthly">نصف شهري</option><option value="monthly">شهري</option></select><Input inputMode="decimal" value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} placeholder="المبلغ" /><Input type="date" value={rateStart} onChange={(e) => setRateStart(e.target.value)} /><Button size="sm" disabled={!rateAmount || !rateStart} onClick={() => void addRate()}>إضافة سعر</Button></div></div>
    <EmployeeDocumentsPanel employeeId={employee.id} />
  </div>
}

function EmployeeDocumentsPanel({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; kind: string }>>([]); const [file, setFile] = useState<File | null>(null); const [kind, setKind] = useState('other'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const load = async () => { try { const response = await fetch(`/api/staff/hr/documents?employeeId=${encodeURIComponent(employeeId)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.documents ?? []) } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل المستندات') } }
  useEffect(() => { void load() }, [employeeId])
  const upload = async () => { if (!file) return; setBusy(true); setError(''); try { const form = new FormData(); form.set('employeeId', employeeId); form.set('kind', kind); form.set('file', file); const response = await fetch('/api/staff/hr/documents', { method: 'POST', body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setFile(null); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر رفع المستند') } finally { setBusy(false) } }
  const open = async (id: string) => { try { const response = await fetch(`/api/staff/hr/documents/${id}/signed-url`); const data = await response.json(); if (!response.ok) throw new Error(data.error); window.open(data.url, '_blank', 'noopener,noreferrer') } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر فتح المستند') } }
  return <div className="rounded-lg border bg-background p-3 lg:col-span-2"><b>المستندات الخاصة</b><p className="mt-1 text-xs text-muted-foreground">PDF أو صور حتى 8 MB؛ روابط التحميل مؤقتة ومخوّلة للمالك فقط.</p>{error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><select value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 rounded border bg-background px-2 text-sm"><option value="national_id_front">الرقم القومي — أمامي</option><option value="national_id_back">الرقم القومي — خلفي</option><option value="signed_contract">عقد موقّع</option><option value="other">مستند آخر</option></select><Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="max-w-xs"/><Button size="sm" disabled={!file || busy} onClick={() => void upload()}>رفع</Button></div><div className="mt-3 flex flex-wrap gap-2">{rows.map((row) => <Button key={row.id} size="sm" variant="outline" onClick={() => void open(row.id)}>{row.kind}</Button>)}</div></div>
}
