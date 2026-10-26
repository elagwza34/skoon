'use client'

import { useMemo, useState, useTransition } from 'react'
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim()
    if (!q) return directory.rows
    return directory.rows.filter(
      (r) => r.name.includes(q) || (r.username ?? '').includes(q.toLowerCase()) || (r.email ?? '').toLowerCase().includes(q.toLowerCase()),
    )
  }, [directory.rows, query])

  async function createEmployee() {
    if (saving) return
    setSaving(true)
    setError(null)
    setSuccess(null)
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
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'تعذر إنشاء الحساب')
      setSuccess(`تم إنشاء حساب الموظف ${data.username ?? username.trim()}`)
      setUsername('')
      setName('')
      setPermanentPassword('')
      setConfirmPassword('')
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
          <Button variant="outline" onClick={() => setInvOpen((v) => !v)}>
            <Icon name="plus" size={16} /> إضافة موظف
          </Button>
        ) : null}
      </div>

      {directory.canManage && invOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>إضافة موظف جديد</CardTitle>
            <CardDescription>أنشئ اسم مستخدم وكلمة مرور مباشرة؛ لا تُرسل رسالة دعوة أو كلمة مرور بالبريد.</CardDescription>
          </CardHeader>
          <CardContent>
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
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={createEmployee} disabled={saving || !username.trim() || !name.trim() || permanentPassword.length < 12 || permanentPassword !== confirmPassword}>
                <Icon name="check" size={16} /> {saving ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
              </Button>
              <Button variant="ghost" onClick={() => setInvOpen(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
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
      <p className="text-xs text-muted-foreground">
        الدعوة تُنشئ حساباً في Supabase Auth ثم يُربط بدور وفرع محددين هنا — تعديلات الأدوار تُطبَّق على
        الخادم ولا يمكن تجاوزها من المتصفح.
      </p>
    </div>
  )
}
