'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Employee = { id: string; name: string; branchId: string | null }
type Day = { weekday: number; restDay: boolean; startsAt: string | null; endsAt: string | null }
type Schedule = { id: string | number; effectiveFrom: string; effectiveUntil: string | null; timezone: string; graceMinutes: number; status: string; employee: { id: string; name: string }; days: Day[] }
const week = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export function ScheduleManagementBoard({ employees, canManage }: { employees: Employee[]; canManage: boolean }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [schedules, setSchedules] = useState<Schedule[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false)
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10)); const [until, setUntil] = useState(''); const [grace, setGrace] = useState('0')
  const [days, setDays] = useState<Day[]>(() => Array.from({ length: 7 }, (_, weekday) => ({ weekday, restDay: weekday === 5, startsAt: '09:00', endsAt: '17:00' })))
  const branchId = employees.find((employee) => employee.id === employeeId)?.branchId ?? ''
  async function load() { if (!employeeId) return; setLoading(true); setError(null); try { const res = await fetch(`/api/staff/hr/schedules?employeeId=${encodeURIComponent(employeeId)}`); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error ?? 'تعذر تحميل الجداول'); setSchedules(data.schedules ?? []) } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل الجداول') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [employeeId]) // eslint-disable-line react-hooks/exhaustive-deps
  function changeDay(index: number, patch: Partial<Day>) { setDays((current) => current.map((day, i) => i === index ? { ...day, ...patch } : day)) }
  async function save() { if (!canManage || saving || !employeeId || !branchId) return; setSaving(true); setError(null); try { const res = await fetch('/api/staff/hr/schedules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId, branchId, effectiveFrom: from, effectiveUntil: until || null, graceMinutes: Number(grace), days }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error ?? 'تعذر حفظ الجدول'); await load() } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ الجدول') } finally { setSaving(false) } }
  return <Card dir="rtl"><CardHeader><CardTitle>جداول العمل والحضور</CardTitle></CardHeader><CardContent className="space-y-4">
    {error ? <p className="rounded border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 rounded border bg-background px-3">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select><Button variant="outline" onClick={() => void load()} disabled={loading}>تحديث</Button></div>
    {canManage ? <div className="rounded border p-3 space-y-3"><p className="font-medium">مراجعة فعّالة جديدة</p><div className="grid gap-2 sm:grid-cols-3"><label>من<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>إلى (اختياري)<Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label><label>سماح التأخير بالدقائق<Input type="number" min="0" value={grace} onChange={(e) => setGrace(e.target.value)} /></label></div><div className="grid gap-2 md:grid-cols-2">{days.map((day, i) => <div key={day.weekday} className="flex items-center gap-2 rounded border p-2"><label className="min-w-20"><input type="checkbox" checked={day.restDay} onChange={(e) => changeDay(i, { restDay: e.target.checked })} /> {week[day.weekday]} راحة</label>{!day.restDay ? <><Input aria-label={`بداية ${week[day.weekday]}`} type="time" value={day.startsAt ?? ''} onChange={(e) => changeDay(i, { startsAt: e.target.value })} /><Input aria-label={`نهاية ${week[day.weekday]}`} type="time" value={day.endsAt ?? ''} onChange={(e) => changeDay(i, { endsAt: e.target.value })} /></> : null}</div>)}</div><Button onClick={() => void save()} disabled={saving || !branchId}>{saving ? 'جارٍ الحفظ…' : 'حفظ المراجعة'}</Button></div> : <p className="text-sm text-muted-foreground">هذه قراءة جدولك فقط.</p>}
    {loading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : null}{!loading && schedules.length === 0 ? <p className="text-sm text-muted-foreground">لا يوجد جدول فعّال أو محفوظ لهذا الموظف.</p> : null}
    {schedules.map((schedule) => <div key={String(schedule.id)} className="rounded border p-3"><div className="flex justify-between gap-2"><b>{schedule.employee.name}</b><span className="text-xs text-muted-foreground">{schedule.effectiveFrom.slice(0, 10)} — {schedule.effectiveUntil?.slice(0, 10) ?? 'مستمر'}</span></div><p className="mt-1 text-xs text-muted-foreground">سماح: {schedule.graceMinutes} دقيقة · {schedule.timezone}</p><div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{schedule.days.map((day) => <span key={day.weekday}>{week[day.weekday]}: {day.restDay ? 'راحة' : `${day.startsAt} – ${day.endsAt}${day.endsAt && day.startsAt && day.endsAt <= day.startsAt ? ' (ليلي)' : ''}`}</span>)}</div></div>)}
    <p className="text-xs text-muted-foreground">مؤشرات التأخير والخروج المبكر والعمل الإضافي تُحتسب من أوقات فتح وإغلاق ورديات التشغيل، وتصحيحها يتطلب طلبًا وموافقة المالك.</p>
  </CardContent></Card>
}
