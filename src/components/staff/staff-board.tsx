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
import { AttendancePanel, LeaveManagementControls, LeavePanel, OvertimePanel, OvertimePolicyControls } from '@/components/staff/hr-workspace-panels'
import { HrKpiCards } from '@/components/staff/hr-kpi-cards'
import { HrReportsBoard } from '@/components/staff/hr-reports-board'
import { OvertimePolicyHistory } from '@/components/staff/overtime-policy-history'

/**
 * Staff board â€” real directory + trusted provisioning UI (owner/manager).
 *
 * Adding an employee creates a direct Supabase Auth password identity; the server assigns the
 * role/branch under the caller's authority. Row actions (role, branch,
 * activation) hit the same server-side rules â€” the UI never grants anything
 * the server would reject.
 */
export function StaffBoard({ directory }: { directory: StaffDirectory }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'employees' | 'schedules' | 'attendance' | 'leave' | 'overtime' | 'financials' | 'advances' | 'payroll' | 'reports'>('employees')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

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
  const [branchName, setBranchName] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [branchPhone, setBranchPhone] = useState('')
  const [branchAddress, setBranchAddress] = useState('')
  const [bootstrappingBranch, setBootstrappingBranch] = useState(false)

  function openInvite() {
    setError(null)
    setSuccess(null)
    setInvOpen(true)
  }

  function closeInvite() {
    if (!saving) setInvOpen(false)
  }

  async function createInitialBranch() {
    if (bootstrappingBranch) return
    setError(null)
    setSuccess(null)
    setBootstrappingBranch(true)
    try {
      const response = await fetch('/api/staff/branches/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: branchName, code: branchCode, phone: branchPhone || undefined, address: branchAddress || undefined }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø£ÙˆÙ„')
      setSuccess(`ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ù†Ø´Ø· ${data.branch.name} (${data.branch.code}). ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¢Ù† Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ù…ÙˆØ¸Ù.`)
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø£ÙˆÙ„')
    } finally {
      setBootstrappingBranch(false)
    }
  }

  useEffect(() => {
    if (!invOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setInvOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [invOpen, saving])

  useEffect(() => {
    if (!error && !success) return
    const timer = window.setTimeout(() => { setError(null); setSuccess(null) }, 5_000)
    return () => window.clearTimeout(timer)
  }, [error, success])

  const rows = useMemo(() => {
    const q = query.trim()
    if (!q) return directory.rows
    return directory.rows.filter((r) => (r.name.includes(q) || (r.username ?? '').includes(q.toLowerCase()) || (r.email ?? '').toLowerCase().includes(q.toLowerCase())) && (!roleFilter || r.role === roleFilter) && (statusFilter === 'all' || (statusFilter === 'active' ? r.isActive : !r.isActive)))
  }, [directory.rows, query, roleFilter, statusFilter])

  async function createEmployee() {
    if (saving) return
    setError(null)
    setSuccess(null)
    if (!name.trim() || !username.trim()) {
      setError('Ø£Ø¯Ø®Ù„ Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù ÙˆØ§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø£ÙˆÙ„Ù‹Ø§.')
      return
    }
    if (permanentPassword.length < 12) {
      setError('ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† 12 Ø­Ø±ÙÙ‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„.')
      return
    }
    if (permanentPassword !== confirmPassword) {
      setError('ØªØ£ÙƒÙŠØ¯ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ØºÙŠØ± Ù…Ø·Ø§Ø¨Ù‚.')
      return
    }
    if (Boolean(probationStart) !== Boolean(probationEnd)) {
      setError('Ø£Ø¯Ø®Ù„ ØªØ§Ø±ÙŠØ® Ø¨Ø¯Ø§ÙŠØ© ÙˆÙ†Ù‡Ø§ÙŠØ© ÙØªØ±Ø© Ø§Ù„ØªØ¬Ø±Ø¨Ø© Ù…Ø¹Ù‹Ø§ØŒ Ø£Ùˆ Ø§ØªØ±ÙƒÙ‡Ù…Ø§ ÙØ§Ø±ØºÙŠÙ†.')
      return
    }
    if (probationStart && probationEnd && probationEnd < probationStart) {
      setError('Ù†Ù‡Ø§ÙŠØ© ÙØªØ±Ø© Ø§Ù„ØªØ¬Ø±Ø¨Ø© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø¨Ø¹Ø¯ Ø¨Ø¯Ø§ÙŠØªÙ‡Ø§.')
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
      if (!res.ok) throw new Error(data?.error ?? 'ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨')
      setSuccess(`ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ ÙˆØªÙØ¹ÙŠÙ„ Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¸Ù ${data.username ?? username.trim()} Ù…Ø¨Ø§Ø´Ø±Ø©Ù‹.`)
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
      setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨')
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
      if (!res.ok) throw new Error(data?.error ?? 'ØªØ¹Ø°Ø± Ø§Ù„ØªØ­Ø¯ÙŠØ«')
      setSuccess('ØªÙ… Ø§Ù„ØªØ­Ø¯ÙŠØ«')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± Ø§Ù„ØªØ­Ø¯ÙŠØ«')
      startTransition(() => router.refresh())
    }
  }

  async function archiveEmployee(id: string, name: string) {
    const reason = window.prompt(`Ø³Ø¨Ø¨ Ø§Ù„Ø­Ø°Ù Ø§Ù„Ø¢Ù…Ù† Ù„Ù„Ù…ÙˆØ¸Ù ${name} (Ø¥Ù„Ø²Ø§Ù…ÙŠ):`)
    if (!reason?.trim()) return

    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/employees/${id}/archive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ØªØ¹Ø°Ø± Ø­Ø°Ù Ø§Ù„Ù…ÙˆØ¸Ù')
      setSuccess(`ØªÙ… Ø­Ø°Ù Ø§Ù„Ù…ÙˆØ¸Ù ${name} Ø¨Ø£Ù…Ø§Ù† ÙˆØ¥ÙŠÙ‚Ø§Ù Ø¯Ø®ÙˆÙ„Ù‡ Ù…Ø¹ Ø§Ù„Ø§Ø­ØªÙØ§Ø¸ Ø¨Ø³Ø¬Ù„Ø§ØªÙ‡.`)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± Ø­Ø°Ù Ø§Ù„Ù…ÙˆØ¸Ù')
    }
  }

  return (
    <div dir="rtl" className="flex min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-3">
        <div><h1 className="text-xl font-bold">Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©</h1><p className="text-sm text-muted-foreground">Ù…Ù„ÙØ§Øª Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†ØŒ Ø§Ù„Ø­Ø¶ÙˆØ±ØŒ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚Ø§Øª ÙˆØ§Ù„Ø±ÙˆØ§ØªØ¨ ÙÙŠ Ù…Ø³Ø§Ø­Ø© Ø¹Ù…Ù„ ÙˆØ§Ø­Ø¯Ø©.</p></div>
        {activeTab === 'employees' && directory.canManage && directory.branches.length > 0 ? <Button onClick={openInvite}><Icon name="plus" size={16} /> Ø¥Ø¶Ø§ÙØ© Ù…ÙˆØ¸Ù</Button> : null}
      </header>
      <HrKpiCards />
      <nav aria-label="Ø£Ù‚Ø³Ø§Ù… Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {([['employees', 'Ø§Ù„Ù…ÙˆØ¸ÙÙˆÙ†'], ['schedules', 'Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„'], ['attendance', 'Ø§Ù„Ø­Ø¶ÙˆØ±'], ['leave', 'Ø§Ù„Ø¥Ø¬Ø§Ø²Ø§Øª'], ['overtime', 'Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ'], ['financials', 'Ø§Ù„Ù…Ø³ØªØ­Ù‚Ø§Øª'], ['advances', 'Ø§Ù„Ø³Ù„Ù'], ['payroll', 'Ø§Ù„Ø±ÙˆØ§ØªØ¨'], ['reports', 'Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${activeTab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>{label}</button>)}
      </nav>
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

      {activeTab === 'employees' ? <>
      {directory.canManage && directory.branches.length === 0 ? (
        <Card className="border-warning/50">
          <CardHeader><CardTitle>ØªÙ‡ÙŠØ¦Ø© Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ</CardTitle><CardDescription>Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥Ù†Ø´Ø§Ø¡ Ù…ÙˆØ¸Ù ØªØ´ØºÙŠÙ„ÙŠ Ù‚Ø¨Ù„ ÙˆØ¬ÙˆØ¯ ÙØ±Ø¹ Ù†Ø´Ø·. Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ù…ØªØ§Ø­Ø© Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© ÙÙ‚Ø· Ø¹Ù†Ø¯ Ø¹Ø¯Ù… ÙˆØ¬ÙˆØ¯ Ø£ÙŠ ÙØ±Ø¹ØŒ ÙˆØªÙØ³Ø¬Ù„ ÙÙŠ Ø³Ø¬Ù„ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ø§Ø³Ù… Ø§Ù„ÙØ±Ø¹</span><Input value={branchName} onChange={(event) => setBranchName(event.target.value)} maxLength={100} /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ø±Ù…Ø² Ø§Ù„ÙØ±Ø¹</span><Input value={branchCode} onChange={(event) => setBranchCode(event.target.value)} dir="ltr" maxLength={20} placeholder="MAIN" /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ù‡Ø§ØªÙ Ø§Ù„ÙØ±Ø¹ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span><Input value={branchPhone} onChange={(event) => setBranchPhone(event.target.value)} inputMode="tel" maxLength={20} /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ø§Ù„Ø¹Ù†ÙˆØ§Ù† (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span><Input value={branchAddress} onChange={(event) => setBranchAddress(event.target.value)} maxLength={255} /></label>
            <div className="sm:col-span-2"><p className="mb-2 text-xs text-muted-foreground">Ø³ÙŠÙÙ†Ø´Ø£ Ø§Ù„ÙØ±Ø¹ Ù†Ø´Ø·Ù‹Ø§ Ø¨Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø²Ù…Ù†ÙŠØ© Africa/Cairo. Ø±Ø§Ø¬Ø¹ Ø§Ù„Ø§Ø³Ù… ÙˆØ§Ù„Ø±Ù…Ø² Ù‚Ø¨Ù„ Ø§Ù„ØªØ£ÙƒÙŠØ¯.</p><Button disabled={bootstrappingBranch || !branchName.trim() || !branchCode.trim()} onClick={() => void createInitialBranch()}>{bootstrappingBranch ? 'Ø¬Ø§Ø±Ù Ø§Ù„ØªÙ‡ÙŠØ¦Ø©â€¦' : 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ'}</Button></div>
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Ø§Ø¨Ø­Ø« Ø¨Ø§Ù„Ø§Ø³Ù… Ø£Ùˆ Ø§Ù„Ø¨Ø±ÙŠØ¯â€¦" aria-label="Ø¨Ø­Ø« Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†" className="max-w-xs"
        />
      </div>

      {directory.canManage && invOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Ø¥Ø¶Ø§ÙØ© Ù…ÙˆØ¸Ù Ø¬Ø¯ÙŠØ¯" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-6">
        <Card className="mx-auto my-4 w-full max-w-4xl sm:my-8">
          <CardHeader>
            <CardTitle>Ø¥Ø¶Ø§ÙØ© Ù…ÙˆØ¸Ù Ø¬Ø¯ÙŠØ¯</CardTitle>
            <CardDescription>Ø£Ù†Ø´Ø¦ Ø§Ø³Ù… Ù…Ø³ØªØ®Ø¯Ù… ÙˆÙƒÙ„Ù…Ø© Ù…Ø±ÙˆØ± Ù…Ø¨Ø§Ø´Ø±Ø©Ø› Ù„Ø§ ØªÙØ±Ø³Ù„ Ø±Ø³Ø§Ù„Ø© Ø¯Ø¹ÙˆØ© Ø£Ùˆ ÙƒÙ„Ù…Ø© Ù…Ø±ÙˆØ± Ø¨Ø§Ù„Ø¨Ø±ÙŠØ¯.</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Ø§Ù„Ø§Ø³Ù…</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…</span>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" autoComplete="username" placeholder="ahmed.saleh" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±</span>
                <Input value={permanentPassword} type="password" autoComplete="new-password" onChange={(e) => setPermanentPassword(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">ØªØ£ÙƒÙŠØ¯ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±</span>
                <Input value={confirmPassword} type="password" autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Ø§Ù„Ø¯ÙˆØ±</span>
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
                  <span className="text-muted-foreground">Ø§Ù„ÙØ±Ø¹</span>
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
              <summary className="cursor-pointer text-sm font-medium">Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ù„Ù HR Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ©</summary>
              <p className="mt-1 text-xs text-muted-foreground">ØªÙÙ†Ø´Ø£ Ø¨Ø·Ø§Ù‚Ø© HR Ù…Ø¹ Ø§Ù„Ø­Ø³Ø§Ø¨. Ø£Ø¯Ø®Ù„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ØªØ§Ø­Ø© Ø§Ù„Ø¢Ù† ÙˆÙŠÙ…ÙƒÙ† Ø§Ø³ØªÙƒÙ…Ø§Ù„Ù‡Ø§ Ù„Ø§Ø­Ù‚Ù‹Ø§ Ù…Ù† Ù…Ù„Ù Ø§Ù„Ù…ÙˆØ¸Ù.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ù‡Ø§ØªÙ Ø§Ù„Ø¹Ù…Ù„</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ù†ÙˆØ¹ Ø§Ù„ØªÙˆØ¸ÙŠÙ</span><Input value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} placeholder="Ø¯ÙˆØ§Ù… ÙƒØ§Ù…Ù„ / Ø¬Ø²Ø¦ÙŠ / ØªØ­Øª Ø§Ù„ØªØ¬Ø±Ø¨Ø©" /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">ØªØ§Ø±ÙŠØ® Ø§Ù„ØªØ¹ÙŠÙŠÙ†</span><Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø´Ø®ØµÙŠ</span><Input type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ø§Ù„Ù‡Ø§ØªÙ Ø§Ù„Ø´Ø®ØµÙŠ</span><Input value={personalPhone} onChange={(e) => setPersonalPhone(e.target.value)} inputMode="tel" /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ø§Ù„Ø¹Ù†ÙˆØ§Ù†</span><Input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ø¨Ø¯Ø§ÙŠØ© ÙØªØ±Ø© Ø§Ù„ØªØ¬Ø±Ø¨Ø©</span><Input type="date" value={probationStart} onChange={(e) => setProbationStart(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ù†Ù‡Ø§ÙŠØ© ÙØªØ±Ø© Ø§Ù„ØªØ¬Ø±Ø¨Ø©</span><Input type="date" value={probationEnd} onChange={(e) => setProbationEnd(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ø§Ø³Ù… Ø¬Ù‡Ø© Ø§Ù„Ø·ÙˆØ§Ø±Ø¦</span><Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">Ù‡Ø§ØªÙ Ø¬Ù‡Ø© Ø§Ù„Ø·ÙˆØ§Ø±Ø¦</span><Input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} inputMode="tel" /></label>
              </div>
            </details>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={createEmployee} disabled={saving}>
                <Icon name="check" size={16} /> {saving ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡â€¦' : 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨'}
              </Button>
              <Button variant="ghost" onClick={() => setInvOpen(false)}>Ø¥Ù„ØºØ§Ø¡</Button>
            </div>
          </CardContent>
        </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Ø§Ù„Ù…ÙˆØ¸ÙÙˆÙ† ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon="staff" title="Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…ÙˆØ¸ÙÙˆÙ† Ù…Ø·Ø§Ø¨Ù‚ÙˆÙ†" description="Ø¬Ø±Ù‘Ø¨ Ø¨Ø­Ø«Ø§Ù‹ Ø¢Ø®Ø± Ø£Ùˆ Ø§Ø¯Ø¹Ù Ù…ÙˆØ¸ÙØ§Ù‹ Ø¬Ø¯ÙŠØ¯Ø§Ù‹." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø§Ø³Ù…</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø¯Ø®ÙˆÙ„</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø¯ÙˆØ±</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„ÙØ±Ø¹</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù†Ø¶Ù…</th>
                    {directory.canManage ? <th className="px-2 py-2 text-start font-medium">Ø¥Ø¬Ø±Ø§Ø¡</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                      <td className="px-2 py-2.5 font-medium text-foreground">{r.name}</td>
                      <td className="px-2 py-2.5 text-muted-foreground" dir="ltr">{r.username ?? r.email ?? 'â€”'}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{r.roleName}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{r.branchName ?? 'ÙƒÙ„ Ø§Ù„ÙØ±ÙˆØ¹'}</td>
                      <td className="px-2 py-2.5">
                        <Badge tone={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Ù†Ø´Ø·' : 'Ù…ÙˆÙ‚ÙˆÙ'}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">{formatRelative(new Date(r.createdAt))}</td>
                      {directory.canManage ? (
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            {r.role !== 'owner' ? (
                              <>
                                <select
                                  aria-label={`ØªØºÙŠÙŠØ± Ø¯ÙˆØ± ${r.name}`}
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
                                  {r.isActive ? 'Ø¥ÙŠÙ‚Ø§Ù' : 'ØªÙØ¹ÙŠÙ„'}
                                </Button>
                                <Button
                                  size="sm" variant="destructive"
                                  onClick={() => void archiveEmployee(r.id, r.name)}
                                >
                                  Ø­Ø°Ù Ø¢Ù…Ù†
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø§Ù„Ùƒ</span>
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
      </> : null}
      {activeTab === 'schedules' ? <ScheduleManagementBoard employees={directory.rows.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId }))} canManage={directory.canSchedule} /> : null}
      {activeTab === 'attendance' ? <AttendancePanel employees={directory.rows.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId }))} /> : null}
      {activeTab === 'leave' ? <><LeaveManagementControls employees={directory.rows.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId }))} /><LeavePanel canDecide={directory.canManage} /></> : null}
      {activeTab === 'overtime' ? <><OvertimePolicyControls /><OvertimePolicyHistory /><OvertimePanel /></> : null}
      {activeTab === 'financials' || activeTab === 'advances' || activeTab === 'payroll' ? <PayrollManagementBoard employees={directory.rows.map((row) => ({ id: row.id, name: row.name, branchId: row.branchId }))} canManage={directory.canManage} /> : null}
      {activeTab === 'reports' ? <HrReportsBoard employees={directory.rows.map((row) => ({ id: row.id, name: row.name }))} /> : null}
      <p className="text-xs text-muted-foreground">
        Ø§Ù„Ø¯Ø¹ÙˆØ© ØªÙÙ†Ø´Ø¦ Ø­Ø³Ø§Ø¨Ø§Ù‹ ÙÙŠ Supabase Auth Ø«Ù… ÙŠÙØ±Ø¨Ø· Ø¨Ø¯ÙˆØ± ÙˆÙØ±Ø¹ Ù…Ø­Ø¯Ø¯ÙŠÙ† Ù‡Ù†Ø§ â€” ØªØ¹Ø¯ÙŠÙ„Ø§Øª Ø§Ù„Ø£Ø¯ÙˆØ§Ø± ØªÙØ·Ø¨ÙŽÙ‘Ù‚ Ø¹Ù„Ù‰
        Ø§Ù„Ø®Ø§Ø¯Ù… ÙˆÙ„Ø§ ÙŠÙ…ÙƒÙ† ØªØ¬Ø§ÙˆØ²Ù‡Ø§ Ù…Ù† Ø§Ù„Ù…ØªØµÙØ­.
      </p>
    </div>
  )
}


