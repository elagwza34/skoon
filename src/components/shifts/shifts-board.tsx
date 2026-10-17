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
import type { ShiftBoardData, ShiftView } from '@/lib/staff-shifts'

/**
 * Shifts board — open a till session, watch it live (expected cash, cash
 * in/out, linked orders), close it with a physical count and see the variance.
 * Mutations hit the shifts API, then `router.refresh()` re-renders the
 * server-fetched snapshot.
 */

function openedAtLabel(iso: string): string {
  const d = new Date(iso)
  return `${formatDateShort(d)} — ${formatTime(d)}`
}

function diffInfo(shift: ShiftView): { tone: BadgeTone; label: string } {
  if (shift.status === 'open') return { tone: 'primary', label: 'مفتوحة' }
  const diff = Number(shift.cashDifference)
  if (diff > 0) return { tone: 'warning', label: `زيادة ${formatCurrency(diff)}` }
  if (diff < 0) return { tone: 'destructive', label: `نقص ${formatCurrency(Math.abs(diff))}` }
  return { tone: 'success', label: 'مطابق' }
}

function paymentBadge(paymentStatus: string): { tone: BadgeTone; label: string } {
  if (paymentStatus === 'paid') return { tone: 'success', label: 'مدفوع' }
  if (paymentStatus === 'refunded') return { tone: 'warning', label: 'مسترد' }
  return { tone: 'muted', label: 'غير مدفوع' }
}

export function ShiftsBoard({ initial }: { initial: ShiftBoardData }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [data, setData] = useState(initial)
  // The page re-fetches after every mutation/branch switch (router.refresh);
  // sync the server snapshot into local state when it changes.
  useEffect(() => setData(initial), [initial])

  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refresh = () => startTransition(() => router.refresh())

  async function open() {
    if (busy) return
    const cash = Number(openingCash)
    if (!Number.isFinite(cash) || cash < 0) {
      setError('أدخل رصيد افتتاح صحيحًا')
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
      if (!res.ok) throw new Error(payload?.error ?? 'تعذر فتح الوردية')
      setOpeningCash('')
      setSuccess('تم فتح الوردية')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر فتح الوردية')
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (busy || !data.current) return
    const cash = Number(closingCash)
    if (!Number.isFinite(cash) || cash < 0) {
      setError('أدخل قيمة جرد الصندوق الصحيحة')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/shifts/${data.current.id}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ closingCash: cash }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error ?? 'تعذر إغلاق الوردية')
      const diff = Number(payload?.cashDifference ?? 0)
      setClosingCash('')
      setSuccess(
        diff === 0
          ? 'تم إغلاق الوردية — الصندوق مطابق'
          : diff > 0
            ? `تم إغلاق الوردية — زيادة ${formatCurrency(diff)}`
            : `تم إغلاق الوردية — نقص ${formatCurrency(Math.abs(diff))}`,
      )
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إغلاق الوردية')
    } finally {
      setBusy(false)
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

      {data.branches.length > 1 ? (
        <div className="flex items-center gap-2 self-end">
          <span className="text-sm text-muted-foreground">الفرع</span>
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
              <CardTitle>الوردية المفتوحة</CardTitle>
              <Badge tone="primary">مفتوحة</Badge>
            </div>
            <CardDescription>
              فتحها {data.current.openBy} — {openedAtLabel(data.current.openedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="رصيد الافتتاح"
                value={formatCurrency(Number(data.current.openingCash))}
                icon="shifts"
              />
              <StatCard
                label="محصَّل نقدي"
                value={formatCurrency(Number(data.current.cashIn))}
                icon="plus"
                hint="دفعات نقدية مكتملة"
              />
              <StatCard
                label="مردود نقدي"
                value={formatCurrency(Number(data.current.cashOut))}
                icon="minus"
                hint="استردادات نقدية"
              />
              <StatCard
                label="المتوقع في الصندوق"
                value={formatCurrency(Number(data.current.expectedCash))}
                icon="clock"
                hint="افتتاح + محصَّل − مردود"
              />
              <StatCard
                label="طلبات الوردية"
                value={formatNumber(data.current.ordersCount)}
                icon="orders"
              />
              <StatCard
                label="دفعات الوردية"
                value={formatNumber(data.current.paymentsCount)}
                icon="pos"
              />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-end sm:gap-4">
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">جرد الصندوق الفعلي (النقدي المعدود)</span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                />
              </label>
              <Button variant="destructive" onClick={close} disabled={busy}>
                {busy ? 'جارٍ الإغلاق…' : 'إغلاق الوردية وتسويتها'}
              </Button>
            </div>

            {data.currentOrders.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">أحدث طلبات الوردية</span>
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
            <CardTitle>فتح وردية</CardTitle>
            <CardDescription>
              سجّل رصيد الصندوق عند البدء — لا يمكن إنشاء طلب أو تحصيل دفع قبل فتح الوردية
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">رصيد الافتتاح (نقدي بالصندوق)</span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                />
              </label>
              <Button onClick={open} disabled={busy}>
                {busy ? 'جارٍ الفتح…' : 'فتح الوردية'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>آخر الورديات</CardTitle>
          <CardDescription>الحالة والمتوقع والجرد والفرق (زيادة أو نقص)</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <EmptyState
              icon="shifts"
              title="لا توجد ورديات بعد"
              description="افتح أول وردية لبدء تسجيل المبيعات النقدية."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">الحالة</th>
                    <th className="px-2 py-2 text-start font-medium">الافتتاح</th>
                    <th className="px-2 py-2 text-start font-medium">فتحها</th>
                    <th className="px-2 py-2 text-end font-medium">رصيد الافتتاح</th>
                    <th className="px-2 py-2 text-end font-medium">المتوقع</th>
                    <th className="px-2 py-2 text-end font-medium">الجرد</th>
                    <th className="px-2 py-2 text-end font-medium">الفرق</th>
                    <th className="px-2 py-2 text-end font-medium">طلبات</th>
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
                          {s.closedAt ? ` → ${formatTime(new Date(s.closedAt))}` : ''}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{s.openBy}</td>
                        <td className="px-2 py-2 text-end">{formatCurrency(Number(s.openingCash))}</td>
                        <td className="px-2 py-2 text-end">{formatCurrency(Number(s.expectedCash))}</td>
                        <td className="px-2 py-2 text-end">
                          {s.status === 'closed' ? formatCurrency(Number(s.closingCash)) : '—'}
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
                            ? '—'
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
