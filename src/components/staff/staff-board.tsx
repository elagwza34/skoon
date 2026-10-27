'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { formatRelative } from '@/lib/format'
import type { StaffDirectory } from '@/lib/staff-directory'
import { EmployeeManagementBoard } from '@/components/staff/employee-management-board'
import { ScheduleManagementBoard } from '@/components/staff/schedule-management-board'
import { PayrollManagementBoard } from '@/components/staff/payroll-management-board'

/**
 * Staff board — real directory + trusted provisioning UI (owner/manager).
 *
 * Adding an employee creates a direct Supabase Auth password identity; the server assigns the
 * role/branch under the caller's authority. Row actions (role, branch,
 * activation) hit the same server-side rules — the UI never grants anything
 * the server would reject.
 */
export function StaffBoard({ directory }: { directory: StaffDirectory }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState('')

  // Direct employee-account form. Password is held only in component state for
  // the request and is never persisted in browser storage.
  const [invOpen, setInvOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('waiter')
  const [branchId, setBranchId] = useState(directory.branches[0]?.id ?? '')
  const [permanentPassword, setPermanentPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [probationStart, setProbationStart] = useState('')
  const [probationEnd, setProbationEnd] = useState('')
  const [personalEmail, setPersonalEmail] = useState('')
  const [personalPhone, setPersonalPhone] = useState('')
  const [address, setAddress] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function openInvite() {
    setError(null)
    setSuccess(null)
    setInvOpen(true)
  }

  function closeInvite() {
    if (!saving) setInvOpen(false)
  }

  useEffect(() => {
    if (!invOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setInvOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [invOpen, saving])

  const rows = useMemo(() => {
    const q = query.trim()
    if (!q) return directory.rows
    return directory.rows.filter(
      (r) => r.name.includes(q) || (r.username ?? '').includes(q.toLowerCase()) || (r.email ?? '').toLowerCase().includes(q.toLowerCase()),
    )
  }, [directory.rows, query])

  async function createEmployee() {
    if (saving) return
    setError(null)
    setSuccess(null)
    if (!name.trim() || !username.trim()) {
      setError('أدخل اسم الموظف واسم المستخدم أولًا.')
      return
    }
    if (permanentPassword.length < 12) {
      setError('كلمة المرور يجب أن تكون 12 حرفًا على الأقل.')
      return
    }
    if (permanentPassword !== confirmPassword) {
      setError('تأكيد كلمة المرور غير مطابق.')
      return
    }
    if (Boolean(probationStart) !== Boolean(probationEnd)) {
      setError('أدخل تاريخ بداية ونهاية فترة التجربة معًا، أو اتركهما فارغين.')
      return
    }
    if (probationStart && probationEnd && probationEnd < probationStart) {
      setError('نهاية فترة التجربة يجب أن تكون بعد بدايتها.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/staff/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          name: name.trim(),
          role,
          branchId: role === 'owner' ? undefined : branchId || undefined,
          accountMode: 'password',
          permanentPassword,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(employmentType.trim() ? { employmentType: employmentType.trim() } : {}),
          ...(hireDate ? { hireDate } : {}),
          ...(probationStart ? { probationStart } : {}),
          ...(probationEnd ? { probationEnd } : {}),
          ...(personalEmail.trim() ? { personalEmail: personalEmail.trim() } : {}),
          ...(personalPhone.trim() ? { personalPhone: personalPhone.trim() } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(emergencyContactName.trim() ? { emergencyContactName: emergencyContactName.trim() } : {}),
          ...(emergencyContactPhone.trim() ? { emergencyContactPhone: emergencyContactPhone.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'تعذر إنشاء الحساب')
      setSuccess(`تم إنشاء حساب الموظف ${data.username ?? username.trim()}`)
      setUsername('')
      setName('')
      setPermanentPassword('')
      setConfirmPassword('')
      setPhone('')
      setEmploymentType('')
      setHireDate(new Date().toISOString().slice(0, 10))
      setProbationStart('')
      setProbationEnd('')
      setPersonalEmail('')
      setPersonalPhone('')
      setAddress('')
      setEmergencyContactName('')
      setEmergencyContactPhone('')
      setInvOpen(false)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء الحساب')
    } finally {
      setSaving(false)
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/users/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'تعذر التحديث')
      setSuccess('تم التحديث')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحديث')
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-5 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}
      {success ? (
        <Card className="border-success/40">
          <CardContent className="pt-5 text-sm text-success">{success}</CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو البريد…" aria-label="بحث الموظفين" className="max-w-xs"
        />
        {directory.canManage ? (
          <Button variant="outline" onClick={openInvite}>
            <Icon name="plus" size={16} /> إضافة موظف
          </Button>
        ) : null}
      </div>

      {directory.canManage && invOpen ? (
        <div role="dialog" aria-modal="true" aria-label="إضافة موظف جديد" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-6">
        <Card className="mx-auto my-4 w-full max-w-4xl sm:my-8">
          <CardHeader>
            <CardTitle>إضافة موظف جديد</CardTitle>
            <CardDescription>أنشئ اسم مستخدم وكلمة مرور مباشرة؛ لا تُرسل رسالة دعوة أو كلمة مرور بالبريد.</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">الاسم</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الموظف" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">اسم المستخدم</span>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" autoComplete="username" placeholder="ahmed.saleh" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">كلمة المرور</span>
                <Input value={permanentPassword} type="password" autoComplete="new-password" onChange={(e) => setPermanentPassword(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">تأكيد كلمة المرور</span>
                <Input value={confirmPassword} type="password" autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">الدور</span>
                <select
                  value={role} onChange={(e) => setRole(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-foreground"
                >
                  {directory.roles.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.name}</option>
                  ))}
                </select>
              </label>
              {role !== 'owner' && directory.branches.length > 0 ? (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">الفرع</span>
                  <select
                    value={branchId} onChange={(e) => setBranchId(e.target.value)}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-foreground"
                  >
                    {directory.branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <details className="mt-4 rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">بيانات ملف HR الأساسية</summary>
              <p className="mt-1 text-xs text-muted-foreground">تُنشأ بطاقة HR مع الحساب. أدخل البيانات المتاحة الآن ويمكن استكمالها لاحقًا من ملف الموظف.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">هاتف العمل</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">نوع التوظيف</span><Input value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} placeholder="دوام كامل / جزئي / تحت التجربة" /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">تاريخ التعيين</span><Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">البريد الشخصي</span><Input type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">الهاتف الشخصي</span><Input value={personalPhone} onChange={(e) => setPersonalPhone(e.target.value)} inputMode="tel" /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">العنوان</span><Input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">بداية فترة التجربة</span><Input type="date" value={probationStart} onChange={(e) => setProbationStart(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">نهاية فترة التجربة</span><Input type="date" value={probationEnd} onChange={(e) => setProbationEnd(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">اسم جهة الطوارئ</span><Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">هاتف جهة الطوارئ</span><Input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} inputMode="tel" /></label>
              </div>
            </details>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={createEmployee} disabled={saving}>
                <Icon name="check" size={16} /> {saving ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
              </Button>
              <Button variant="ghost" onClick={() => setInvOpen(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>الموظفون ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon="staff" title="لا يوجد موظفون مطابقون" description="جرّب بحثاً آخر أو ادعُ موظفاً جديداً." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">الاسم</th>
                    <th className="px-2 py-2 text-start font-medium">الدخول</th>
                    <th className="px-2 py-2 text-start font-medium">الدور</th>
                    <th className="px-2 py-2 text-start font-medium">الفرع</th>
                    <th className="px-2 py-2 text-start font-medium">الحالة</th>
                    <th className="px-2 py-2 text-start font-medium">انضم</th>
                    {directory.canManage ? <th className="px-2 py-2 text-start font-medium">إجراء</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                      <td className="px-2 py-2.5 font-medium text-foreground">{r.name}</td>
                      <td className="px-2 py-2.5 text-muted-foreground" dir="ltr">{r.username ?? r.email ?? '—'}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{r.roleName}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{r.branchName ?? 'كل الفروع'}</td>
                      <td className="px-2 py-2.5">
                        <Badge tone={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'نشط' : 'موقوف'}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">{formatRelative(new Date(r.createdAt))}</td>
                      {directory.canManage ? (
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            {r.role !== 'owner' ? (
                              <>
                                <select
                                  aria-label={`تغيير دور ${r.name}`}
                                  value={r.role}
                                  onChange={(e) => patch(r.id, { role: e.target.value })}
                                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                                >
                                  {directory.roles.map((rl) => (
                                    <option key={rl.slug} value={rl.slug}>{rl.name}</option>
                                  ))}
                                </select>
                                <Button
                                  size="sm" variant="outline"
                                  onClick={() => patch(r.id, { isActive: !r.isActive })}
                                >
                                  {r.isActive ? 'إيقاف' : 'تفعيل'}
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">حساب المالك</span>
                            )}
                          </div>
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
      <EmployeeManagementBoard canManage={directory.canManage} />
      <ScheduleManagementBoard employees={directory.rows.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId }))} canManage={directory.canSchedule} />
      <PayrollManagementBoard employees={directory.rows.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId }))} canManage={directory.canManage} />
      <p className="text-xs text-muted-foreground">
        الدعوة تُنشئ حساباً في Supabase Auth ثم يُربط بدور وفرع محددين هنا — تعديلات الأدوار تُطبَّق على
        الخادم ولا يمكن تجاوزها من المتصفح.
      </p>
    </div>
  )
}
