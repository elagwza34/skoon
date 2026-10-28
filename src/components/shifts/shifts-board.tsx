'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort, formatTime, formatNumber } from '@/lib/format'
import { Icon } from '@/components/ui/icon'
import { homeForRole } from '@/lib/route-access'
import { logoutAction } from '@/app/login/actions'
import type { ShiftBoardData, ShiftView } from '@/lib/staff-shifts'

const CASH_HANDLING_ROLES = ['cashier', 'manager']

function openedAtLabel(iso: string): string {
  const d = new Date(iso)
  return `${formatDateShort(d)} â€” ${formatTime(d)}`
}

function diffInfo(shift: ShiftView): { tone: BadgeTone; label: string } {
  if (shift.status === 'open') return { tone: 'primary', label: 'Ù…ÙØªÙˆØ­Ø©' }
  const diff = Number(shift.cashDifference)
  if (diff > 0) return { tone: 'warning', label: `Ø²ÙŠØ§Ø¯Ø© ${formatCurrency(diff)}` }
  if (diff < 0) return { tone: 'destructive', label: `Ù†Ù‚Øµ ${formatCurrency(Math.abs(diff))}` }
  return { tone: 'success', label: 'Ù…Ø·Ø§Ø¨Ù‚' }
}

function paymentBadge(paymentStatus: string): { tone: BadgeTone; label: string } {
  if (paymentStatus === 'paid') return { tone: 'success', label: 'Ù…Ø¯ÙÙˆØ¹' }
  if (paymentStatus === 'refunded') return { tone: 'warning', label: 'Ù…Ø³ØªØ±Ø¯' }
  return { tone: 'muted', label: 'ØºÙŠØ± Ù…Ø¯ÙÙˆØ¹' }
}

export function ShiftsBoard({ initial }: { initial: ShiftBoardData }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [data, setData] = useState(initial)
  useEffect(() => setData(initial), [initial])

  const isCashHandling = CASH_HANDLING_ROLES.includes(data.userRole)

  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [handoverNotes, setHandoverNotes] = useState('')
  const [handoverRecipientId, setHandoverRecipientId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refresh = () => startTransition(() => router.refresh())

  async function open() {
    if (busy) return
    const cash = isCashHandling ? Number(openingCash) : 0
    if (isCashHandling && (!Number.isFinite(cash) || cash < 0)) {
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
      setSuccess('ØªÙ… ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©')
      // After opening, send the employee to their role workspace.
      router.push(homeForRole(data.userRole))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©')
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (busy || !data.current) return
    const cash = isCashHandling ? Number(closingCash) : 0
    if (isCashHandling && (!Number.isFinite(cash) || cash < 0)) {
      setError('Ø£Ø¯Ø®Ù„ Ù‚ÙŠÙ…Ø© Ø¬Ø±Ø¯ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„ØµØ­ÙŠØ­Ø©')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/shifts/${data.current.id}/close`, {
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
          ? 'ØªÙ… Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© â€” Ø§Ù„Ø±ØµÙŠØ¯ Ù…Ø·Ø§Ø¨Ù‚'
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

  return (
    <div className="flex flex-col gap-4" dir="rtl">
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

      {data.branches.length > 1 && data.userRole === 'owner' ? (
        <div className="flex items-center gap-2 self-end">
          <span className="text-sm text-muted-foreground">Ø§Ù„ÙØ±Ø¹</span>
          <select
            value={data.branchId}
            onChange={(e) => router.push(`/shifts?branchId=${e.target.value}`)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-foreground"
          >
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {data.current ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ù…ÙØªÙˆØ­Ø©</CardTitle>
              <Badge tone="primary">Ù…ÙØªÙˆØ­Ø©</Badge>
            </div>
            <CardDescription>
              ÙØªØ­Ù‡Ø§ {data.current.openBy} ({data.userRole}) â€” {openedAtLabel(data.current.openedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­" value={formatCurrency(Number(data.current.openingCash))} icon="shifts" />
              {isCashHandling ? (
                <>
                  <StatCard
                    label="Ù…Ø­ØµÙŽÙ‘Ù„ Ù†Ù‚Ø¯ÙŠ"
                    value={formatCurrency(Number(data.current.cashIn))}
                    icon="plus"
                    hint="Ø¯ÙØ¹Ø§Øª Ù†Ù‚Ø¯ÙŠØ© Ù…ÙƒØªÙ…Ù„Ø©"
                  />
                  <StatCard
                    label="Ù…Ø±Ø¯ÙˆØ¯ Ù†Ù‚Ø¯ÙŠ"
                    value={formatCurrency(Number(data.current.cashOut))}
                    icon="minus"
                    hint="Ø§Ø³ØªØ±Ø¯Ø§Ø¯Ø§Øª Ù†Ù‚Ø¯ÙŠØ©"
                  />
                </>
              ) : null}
              <StatCard
                label="Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ ÙÙŠ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚"
                value={formatCurrency(Number(data.current.expectedCash))}
                icon="clock"
                hint={isCashHandling ? 'Ø§ÙØªØªØ§Ø­ + Ù…Ø­ØµÙŽÙ‘Ù„ âˆ’ Ù…Ø±Ø¯ÙˆØ¯' : 'ØºÙŠØ± Ù…ØªØ§Ø­ Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¯ÙˆØ±'}
              />
              <StatCard label="Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙˆØ±Ø¯ÙŠØ©" value={formatNumber(data.current.ordersCount)} icon="orders" />
              <StatCard label="Ø¯ÙØ¹Ø§Øª Ø§Ù„ÙˆØ±Ø¯ÙŠØ©" value={formatNumber(data.current.paymentsCount)} icon="pos" />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-end sm:gap-4">
              {isCashHandling ? (
                <label className="flex flex-1 flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Ø¬Ø±Ø¯ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„ÙØ¹Ù„ÙŠ (Ø§Ù„Ù†Ù‚Ø¯ÙŠ Ø§Ù„Ù…Ø¹Ø¯ÙˆØ¯)</span>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„ØªØ³Ù„ÙŠÙ… (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span>
                <Input
                  placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø­ÙˆÙ„ ØªØ³Ù„ÙŠÙ… Ø§Ù„ÙˆØ±Ø¯ÙŠØ©"
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ø§Ù„Ù…Ø³ØªÙ„Ù… (Ù‚Ø¨Ù„ Ù…Ù†ØªØµÙ Ø§Ù„Ù„ÙŠÙ„)</span>
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={handoverRecipientId} onChange={(e) => setHandoverRecipientId(e.target.value)}>
                  <option value="">Ø§Ø®ØªØ± ÙƒØ§Ø´ÙŠØ±Ø§Ù‹</option>
                  {data.cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
                </select>
              </label>
              <Button variant="destructive" onClick={close} disabled={busy}>
                {busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥ØºÙ„Ø§Ù‚â€¦' : 'Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© ÙˆØªØ³Ø¬ÙŠÙ„ Ø§Ù„ØªØ³Ù„ÙŠÙ…'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                ÙŠØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¹Ù†Ø¯ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚. ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù… Ù…Ù† Ù‚Ø¨Ù„ Ø§Ù„Ù…ÙˆØ¸Ù Ø§Ù„Ù…Ø³ØªÙ„Ù… ØºÙŠØ± Ù…Ø¯Ø¹ÙˆÙ… Ø­Ø§Ù„ÙŠØ§Ù‹.
              </p>
            </div>

            {data.currentOrders.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">Ø£Ø­Ø¯Ø« Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙˆØ±Ø¯ÙŠØ©</span>
                <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {data.currentOrders.map((o) => {
                    const pay = paymentBadge(o.paymentStatus)
                    return (
                      <div
                        key={o.orderNumber}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-foreground">{o.orderNumber}</span>
                        <Badge tone={pay.tone}>{pay.label}</Badge>
                        <span className="text-muted-foreground">{formatTime(new Date(o.createdAt))}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(Number(o.total))}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>ÙØªØ­ ÙˆØ±Ø¯ÙŠØ©</CardTitle>
            <CardDescription>
              Ø³Ø¬Ù‘Ù„ Ø¨Ø¯Ø§ÙŠØ© ÙˆØ±Ø¯ÙŠØªÙƒ â€” Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªÙ†ÙÙŠØ° Ø£ÙŠ Ø¹Ù…Ù„ÙŠØ© ØªØ´ØºÙŠÙ„ÙŠØ© Ù‚Ø¨Ù„ ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Ø§Ù„Ù…ÙˆØ¸Ù</span>
                <span className="text-sm font-medium text-foreground">{data.userRole}</span>
              </div>
              {isCashHandling ? (
                <label className="flex flex-1 flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ (Ù†Ù‚Ø¯ÙŠ Ø¨Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚)</span>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                  />
                </label>
              ) : null}
              <Button onClick={open} disabled={busy}>
                {busy ? 'Ø¬Ø§Ø±Ù Ø§Ù„ÙØªØ­â€¦' : 'ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©'}
              </Button>
              <form action={logoutAction}>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full sm:w-auto items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon name="logout" size={16} />
                  ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬
                </button>
              </form>
            </div>
            {!isCashHandling ? (
              <p className="text-xs text-muted-foreground mt-2">
                Ø¯ÙˆØ±Ùƒ Ù„Ø§ ÙŠØªØ¹Ø§Ù…Ù„ Ù…Ø¹ Ø§Ù„Ù†Ù‚Ø¯ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± â€” ØªÙÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø¨Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ ØµÙØ±.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ø¢Ø®Ø± Ø§Ù„ÙˆØ±Ø¯ÙŠØ§Øª</CardTitle>
          <CardDescription>Ø§Ù„Ø­Ø§Ù„Ø© ÙˆØ§Ù„Ù…ØªÙˆÙ‚Ø¹ ÙˆØ§Ù„Ø¬Ø±Ø¯ ÙˆØ§Ù„ÙØ±Ù‚ (Ø²ÙŠØ§Ø¯Ø© Ø£Ùˆ Ù†Ù‚Øµ)</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <EmptyState
              icon="shifts"
              title="Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ±Ø¯ÙŠØ§Øª Ø¨Ø¹Ø¯"
              description="Ø§ÙØªØ­ Ø£ÙˆÙ„ ÙˆØ±Ø¯ÙŠØ© Ù„Ø¨Ø¯Ø¡ ØªØ³Ø¬ÙŠÙ„ Ù†Ø´Ø§Ø·Ùƒ Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠ."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                    <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø§ÙØªØªØ§Ø­</th>
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
                    const info = diffInfo(s)
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
                        <td
                          className={`px-2 py-2 text-end font-medium ${
                            s.status !== 'closed'
                              ? 'text-muted-foreground'
                              : diff > 0
                                ? 'text-warning'
                                : diff < 0
                                  ? 'text-destructive'
                                  : 'text-success'
                          }`}
                        >
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
      </Card>
    </div>
  )
}


