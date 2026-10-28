'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort, formatTime, formatNumber } from '@/lib/format'
import type { StaffSession } from '@/lib/session'
import type { ShiftBoardData, ShiftView } from '@/lib/staff-shifts'

/**
 * CashierDashboard â€” renders the shift-aware cashier workstation.
 *
 * No active shift â†’ prominent "Open Shift" action + lock message.
 * Active shift   â†’ live reconciliation + end-of-shift handover action.
 * Closed shift   â†’ read-only closing summary.
 */
export function CashierDashboard({
  session,
  board,
  branchName,
  compact = false,
}: {
  session: StaffSession
  board: ShiftBoardData
  branchName: string | null
  compact?: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [data, setData] = useState(board)
  const [openingCash, setOpeningCash] = useState('')
  const [openingNotes, setOpeningNotes] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [handoverNotes, setHandoverNotes] = useState('')
  const [handoverRecipientId, setHandoverRecipientId] = useState('')
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => setData(board), [board])

  const refresh = () => startTransition(() => router.refresh())

  const current = data.current
  const hasActiveShift = current !== null && current.status === 'open'

  // ---------- Open shift ----------
  async function openShift() {
    if (busy) return
    const cash = Number(openingCash)
    if (!Number.isFinite(cash) || cash < 0) {
      setError('Ø£Ø¯Ø®Ù„ Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ ØµØ­ÙŠØ­Ù‹Ø§')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/staff/shifts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ openingCash: cash, branchId: Number(data.branchId) }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error ?? 'ØªØ¹Ø°Ø± ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©')
      setOpeningCash('')
      setOpeningNotes('')
      setSuccess('ØªÙ… ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© â€” ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¢Ù† Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø·Ù„Ø¨Ø§Øª ÙˆØªØ­ØµÙŠÙ„ Ø§Ù„Ø¯ÙØ¹')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©')
    } finally {
      setBusy(false)
    }
  }

  // ---------- Close shift (cash handover) ----------
  async function closeShift() {
    if (busy || !current) return
    const cash = Number(closingCash)
    if (!Number.isFinite(cash) || cash < 0) {
      setError('Ø£Ø¯Ø®Ù„ Ù‚ÙŠÙ…Ø© Ø¬Ø±Ø¯ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„ØµØ­ÙŠØ­Ø©')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/shifts/${current.id}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          closingCash: cash,
          handoverNotes: handoverNotes.trim() || null,
          handoverRecipientId: handoverRecipientId || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error ?? 'ØªØ¹Ø°Ø± Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©')
      const diff = Number(payload?.cashDifference ?? 0)
      setClosingCash('')
      setHandoverNotes('')
      setHandoverRecipientId('')
      setSuccess(
        diff === 0
          ? 'ØªÙ… Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© â€” Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ù…Ø·Ø§Ø¨Ù‚'
          : diff > 0
            ? `ØªÙ… Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© â€” Ø²ÙŠØ§Ø¯Ø© ${formatCurrency(diff)}`
            : `ØªÙ… Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© â€” Ù†Ù‚Øµ ${formatCurrency(Math.abs(diff))}`,
      )
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©')
    } finally {
      setBusy(false)
    }
  }

  async function recordOperationalWithdrawal() {
    const amount = Number(withdrawalAmount)
    if (!Number.isFinite(amount) || amount <= 0 || withdrawalReason.trim().length < 3) { setError('Ø£Ø¯Ø®Ù„ Ù…Ø¨Ù„ØºØ§Ù‹ Ù…ÙˆØ¬Ø¨Ø§Ù‹ ÙˆØ³Ø¨Ø¨Ø§Ù‹ ÙˆØ§Ø¶Ø­Ø§Ù‹ Ù„Ù„Ø³Ø­Ø¨'); return }
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/staff/fixed-float', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ direction: 'withdrawal', amount, reason: withdrawalReason.trim(), branchId: Number(data.branchId) }) })
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error ?? 'ØªØ¹Ø°Ø± ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø³Ø­Ø¨')
      setWithdrawalAmount(''); setWithdrawalReason(''); setSuccess('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø³Ø­Ø¨ ØªØ´ØºÙŠÙ„ÙŠ Ù…Ù† Ø¯Ø±Ø¬ Ø§Ù„ÙƒØ§Ø´ÙŠØ±'); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø³Ø­Ø¨') } finally { setBusy(false) }
  }

  const openedAtLabel = (iso: string): string => {
    const d = new Date(iso)
    return `${formatDateShort(d)} â€” ${formatTime(d)}`
  }

  const diffTone = (shift: ShiftView): { tone: 'success' | 'warning' | 'destructive' | 'primary'; label: string } => {
    if (shift.status === 'open') return { tone: 'primary', label: 'Ù…ÙØªÙˆØ­Ø©' }
    const diff = Number(shift.cashDifference)
    if (diff > 0) return { tone: 'warning', label: `Ø²ÙŠØ§Ø¯Ø© ${formatCurrency(diff)}` }
    if (diff < 0) return { tone: 'destructive', label: `Ù†Ù‚Øµ ${formatCurrency(Math.abs(diff))}` }
    return { tone: 'success', label: 'Ù…Ø·Ø§Ø¨Ù‚' }
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      {!compact && <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ù„ÙˆØ­Ø© Ø§Ù„ÙƒØ§Ø´ÙŠØ±</h1>
          <p className="text-sm text-muted-foreground">
            Ø§Ù„ÙØ±Ø¹: {branchName ?? 'â€”'} Â· Ø§Ù„ÙƒØ§Ø´ÙŠØ±: {session.name}
          </p>
        </div>
        <form action="/login?next=/cashier">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-xs">ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬</span>
          </button>
        </form>
      </div>}

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

      {/* ---------- No active shift ---------- */}
      {!hasActiveShift ? (
        <Card className="border-warning/30 bg-warning/10">
          <CardHeader>
            <CardTitle>Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©</CardTitle>
            <CardDescription>
              Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨ Ø£Ùˆ ØªØ­ØµÙŠÙ„ Ø¯ÙØ¹ Ø£Ùˆ Ø¥Ø¬Ø±Ø§Ø¡ Ø£ÙŠ Ø¹Ù…Ù„ÙŠØ© Ù…Ø§Ù„ÙŠØ© Ù‚Ø¨Ù„ ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©. Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ù…Ù‚ÙÙ„Ø©
              Ø­ØªÙ‰ ØªØ¨Ø¯Ø£ ÙˆØ±Ø¯ÙŠØªÙƒ.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <span className="text-xs font-medium text-warning">Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ù…Ø­Ø¯Ø¯</span>
                <span className="text-sm font-medium text-foreground">
                  {branchName ?? 'â€”'}
                </span>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <span className="text-xs font-medium text-warning">Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ø§Ù„Ù…Ø³Ø¬Ù„</span>
                <span className="text-sm font-medium text-foreground">{session.name}</span>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <span className="text-xs font-medium text-warning">ÙˆÙ‚Øª Ø§Ù„ÙØªØ­ Ø§Ù„Ù…ØªÙˆÙ‚Ø¹</span>
                <span className="text-sm font-medium text-foreground">Ø¹Ù†Ø¯ Ø¨Ø¯Ø¡ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©</span>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ (Ù†Ù‚Ø¯ÙŠ Ø¨Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚)</span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„Ø§ÙØªØªØ§Ø­ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span>
                <Input
                  placeholder="Ù…Ø«Ø§Ù„: ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„ØªØ¬Ù‡ÙŠØ² Ø§Ù„ØµØ¨Ø§Ø­ÙŠ"
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                />
              </label>
              <Button variant="primary" size="lg" className="w-full sm:w-auto" onClick={openShift} disabled={busy}>
                {busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„ÙØªØ­â€¦' : 'ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ÙŠÙØ³Ø¬Ù‘Ù„ Ø§Ù„ÙƒØ§Ø´ÙŠØ± ÙˆØ§Ù„ÙØ±Ø¹ ÙˆØ±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ Ø§Ù„ÙØªØ­. Ù„Ø§ ÙŠÙ…ÙƒÙ† ÙØªØ­ Ø£ÙƒØ«Ø± Ù…Ù† ÙˆØ±Ø¯ÙŠØ© ÙˆØ§Ø­Ø¯Ø© Ù„Ù†ÙØ³ Ø§Ù„ÙØ±Ø¹.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- Active shift ---------- */}
      {hasActiveShift && current ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ù…ÙØªÙˆØ­Ø©</CardTitle>
                <Badge tone="primary">Ù…ÙØªÙˆØ­Ø©</Badge>
              </div>
              <CardDescription>
                ÙØªØ­Ù‡Ø§ {current.openBy} â€” {openedAtLabel(current.openedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­" value={formatCurrency(Number(current.openingCash))} icon="shifts" />
                <StatCard
                  label="Ù…Ø­ØµÙŽÙ‘Ù„ Ù†Ù‚Ø¯ÙŠ"
                  value={formatCurrency(Number(current.cashIn))}
                  icon="plus"
                  hint="Ø¯ÙØ¹Ø§Øª Ù†Ù‚Ø¯ÙŠØ© Ù…ÙƒØªÙ…Ù„Ø©"
                />
                <StatCard
                  label="Ù…Ø±Ø¯ÙˆØ¯ Ù†Ù‚Ø¯ÙŠ"
                  value={formatCurrency(Number(current.cashOut))}
                  icon="minus"
                  hint="Ø§Ø³ØªØ±Ø¯Ø§Ø¯Ø§Øª Ù†Ù‚Ø¯ÙŠØ©"
                />
                <StatCard
                  label="Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ ÙÙŠ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚"
                  value={formatCurrency(Number(current.expectedCash))}
                  icon="clock"
                  hint="Ø§ÙØªØªØ§Ø­ + Ù…Ø­ØµÙŽÙ‘Ù„ âˆ’ Ù…Ø±Ø¯ÙˆØ¯"
                />
                <StatCard label="Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙˆØ±Ø¯ÙŠØ©" value={formatNumber(current.ordersCount)} icon="orders" />
                <StatCard label="Ø¯ÙØ¹Ø§Øª Ø§Ù„ÙˆØ±Ø¯ÙŠØ©" value={formatNumber(current.paymentsCount)} icon="pos" />
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-end sm:gap-4">
                <label className="flex flex-1 flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Ø¬Ø±Ø¯ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„ÙØ¹Ù„ÙŠ (Ø§Ù„Ù†Ù‚Ø¯ÙŠ Ø§Ù„Ù…Ø¹Ø¯ÙˆØ¯)</span>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„ØªØ³Ù„ÙŠÙ… (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span>
                  <Input
                    placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø­ÙˆÙ„ ØªØ³Ù„ÙŠÙ… Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚"
                    value={handoverNotes}
                    onChange={(e) => setHandoverNotes(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ø§Ù„Ù…Ø³ØªÙ„Ù… (Ù‚Ø¨Ù„ Ù…Ù†ØªØµÙ Ø§Ù„Ù„ÙŠÙ„)</span>
                  <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={handoverRecipientId} onChange={(e) => setHandoverRecipientId(e.target.value)}>
                    <option value="">Ø§Ø®ØªØ± ÙƒØ§Ø´ÙŠØ±Ø§Ù‹</option>
                    {data.cashiers.filter((cashier) => cashier.id !== session.id).map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
                  </select>
                </label>
                <Button variant="destructive" size="lg" className="w-full sm:w-auto" onClick={closeShift} disabled={busy}>
                  {busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥ØºÙ„Ø§Ù‚â€¦' : 'Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© ÙˆØªØ³Ù„ÙŠÙ… Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚'}
                </Button>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-end">
                <p className="text-sm text-muted-foreground sm:max-w-xs">Ø³Ø­Ø¨ ØªØ´ØºÙŠÙ„ÙŠ Ù…Ù† Ø¯Ø±Ø¬ Ø§Ù„ÙƒØ§Ø´ÙŠØ±ØŒ ÙˆÙ„ÙŠØ³ Ù…Ù† Ø§Ù„Ø¹Ù‡Ø¯Ø© Ø§Ù„Ø«Ø§Ø¨ØªØ©. ÙŠÙØ®ØµÙ… Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© Ù…Ù† Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ Ø¹Ù†Ø¯ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚.</p>
                <Input className="sm:w-28" inputMode="decimal" placeholder="Ø§Ù„Ù…Ø¨Ù„Øº" value={withdrawalAmount} onChange={(e) => setWithdrawalAmount(e.target.value)} />
                <Input className="sm:flex-1" placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ø³Ø­Ø¨" value={withdrawalReason} onChange={(e) => setWithdrawalReason(e.target.value)} />
                <Button variant="outline" disabled={busy} onClick={recordOperationalWithdrawal}>ØªØ³Ø¬ÙŠÙ„ Ø³Ø­Ø¨ ØªØ´ØºÙŠÙ„ÙŠ</Button>
              </div>

              {!compact && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-xs font-medium text-muted-foreground">Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ø³Ø±ÙŠØ¹Ø©</span>
                  <p className="text-sm text-muted-foreground">
                    Ø£Ù†Ø´Ø¦ Ø·Ù„Ø¨Ø§Ù‹ Ø¬Ø¯ÙŠØ¯Ø§Ù‹ Ø£Ùˆ ØªØ­Ù‚Ù‘Ù‚ Ù…Ù† Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©. Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø·Ù„Ø¨Ø§Øª ÙˆØ§Ù„Ø¯ÙØ¹Ø§Øª ØªÙØ±Ø¨Ø· Ø¨Ù‡Ø°Ù‡ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹.
                  </p>
                </div>
                <div className="flex gap-2 sm:flex-wrap">
                  <a
                    href="/pos"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>POS â€” Ø·Ù„Ø¨ Ø¬Ø¯ÙŠØ¯</span>
                  </a>
                  <a
                    href="/orders"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>Ø§Ù„Ø·Ù„Ø¨Ø§Øª</span>
                  </a>
                  <a
                    href="/shifts"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>Ø§Ù„ØªØ§Ø±ÙŠØ®</span>
                  </a>
                </div>
              </div>}
            </CardContent>
          </Card>

          {/* Closed / previous shift history on same page for context */}
          {!compact && <Card>
            <CardHeader>
              <CardTitle>Ø¢Ø®Ø± Ø§Ù„ÙˆØ±Ø¯ÙŠØ§Øª</CardTitle>
              <CardDescription>Ø§Ù„Ø­Ø§Ù„Ø© ÙˆØ§Ù„Ù…ØªÙˆÙ‚Ø¹ ÙˆØ§Ù„Ø¬Ø±Ø¯ ÙˆØ§Ù„ÙØ±Ù‚ (Ø²ÙŠØ§Ø¯Ø© Ø£Ùˆ Ù†Ù‚Øµ)</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recent.length === 0 ? (
                <EmptyState icon="shifts" title="Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ§Øª Ø³Ø§Ø¨Ù‚Ø©" description="Ø£fter ÙØªØ­ Ø£ÙˆÙ„ ÙˆØ±Ø¯ÙŠØ© Ø³ØªØ¸Ù‡Ø± Ù‡Ù†Ø§." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                        <th className="px-2 py-2 text-start font-medium">ØªÙ… Ø§Ù„ÙØªØ­</th>
                        <th className="px-2 py-2 text-start font-medium">ÙØªØ­Ù‡Ø§</th>
                        <th className="px-2 py-2 text-end font-medium">Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­</th>
                        <th className="px-2 py-2 text-end font-medium">Ø§Ù„Ù…ØªÙˆÙ‚Ø¹</th>
                        <th className="px-2 py-2 text-end font-medium">Ø§Ù„Ø¬Ø±Ø¯</th>
                        <th className="px-2 py-2 text-end font-medium">Ø§Ù„ÙØ±Ù‚</th>
                        <th className="px-2 py-2 text-end font-medium">Ø·Ù„Ø¨Ø§Øª</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((s) => {
                        const info = diffTone(s)
                        const diff = Number(s.cashDifference)
                        return (
                          <tr key={s.id} className="border-b border-border/50 last:border-0">
                            <td className="px-2 py-2">
                              <Badge tone={info.tone}>{info.label}</Badge>
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {openedAtLabel(s.openedAt)}
                              {s.closedAt ? ` â†’ ${formatTime(new Date(s.closedAt))}` : ''}
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">{s.openBy}</td>
                            <td className="px-2 py-2 text-end">{formatCurrency(Number(s.openingCash))}</td>
                            <td className="px-2 py-2 text-end">{formatCurrency(Number(s.expectedCash))}</td>
                            <td className="px-2 py-2 text-end">
                              {s.status === 'closed' ? formatCurrency(Number(s.closingCash)) : 'â€”'}
                            </td>
                            <td className="px-2 py-2 text-end font-medium">
                              {s.status !== 'closed'
                                ? 'â€”'
                                : diff > 0
                                  ? `+${formatCurrency(diff)}`
                                  : formatCurrency(diff)}
                            </td>
                            <td className="px-2 py-2 text-end">{formatNumber(s.ordersCount)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>}
        </>
      ) : null}

      {/* ---------- Closed shift state ---------- */}
      {current && current.status === 'closed' ? (
        <Card>
          <CardHeader>
            <CardTitle>Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ù…ØºÙ„Ù‚Ø© â€” Ù…Ù„Ø®Øµ Ø§Ù„ØªØ³Ù„ÙŠÙ…</CardTitle>
            <CardDescription>Ù…Ù„Ø®Øµ Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø· Ù„Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ©. Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø£Ø±Ù‚Ø§Ù… Ø¨Ø¹Ø¯ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­" value={formatCurrency(Number(current.openingCash))} icon="shifts" />
            <StatCard label="Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ ÙÙŠ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚" value={formatCurrency(Number(current.expectedCash))} icon="clock" />
            <StatCard label="Ø§Ù„Ø¬Ø±Ø¯ Ø§Ù„ÙØ¹Ù„ÙŠ" value={formatCurrency(Number(current.closingCash))} icon="pos" />
            <StatCard
              label="Ø§Ù„ÙØ±Ù‚ (Ø²Ø§Ø¦Ø¯ / Ù†Ø§Ù‚Øµ)"
              value={formatCurrency(Math.abs(Number(current.cashDifference)))}
              icon={Number(current.cashDifference) >= 0 ? 'trendingUp' : 'trendingDown'}
            />
            <StatCard label="Ø§Ù„Ø­Ø§Ù„Ø©" value="Ù…ØºÙ„Ù‚Ø©" icon="check" />
            <StatCard
              label="ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¥ØºÙ„Ø§Ù‚"
              value={current.closedAt ? formatDateShort(new Date(current.closedAt)) : 'â€”'}
              icon="clock"
            />
            {current.handoverTo && (
              <StatCard label="ØªÙ… Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¥Ù„Ù‰" value={current.handoverTo} icon="staff" />
            )}
          </CardContent>
          {current.handoverNotes ? (
            <div className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm">
              <span className="text-xs font-medium text-muted-foreground block mb-1">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„ØªØ³Ù„ÙŠÙ…</span>
              <p className="text-foreground">{current.handoverNotes}</p>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}


