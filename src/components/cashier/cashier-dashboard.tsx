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
 * CashierDashboard — renders the shift-aware cashier workstation.
 *
 * No active shift → prominent "Open Shift" action + lock message.
 * Active shift   → live reconciliation + end-of-shift handover action.
 * Closed shift   → read-only closing summary.
 */
export function CashierDashboard({
  session,
  board,
  branchName,
}: {
  session: StaffSession
  board: ShiftBoardData
  branchName: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [data, setData] = useState(board)
  const [openingCash, setOpeningCash] = useState('')
  const [openingNotes, setOpeningNotes] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [handoverNotes, setHandoverNotes] = useState('')
  const [handoverTo, setHandoverTo] = useState('')
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
      setOpeningNotes('')
      setSuccess('تم فتح الوردية — يمكنك الآن إنشاء الطلبات وتحصيل الدفع')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر فتح الوردية')
    } finally {
      setBusy(false)
    }
  }

  // ---------- Close shift (cash handover) ----------
  async function closeShift() {
    if (busy || !current) return
    const cash = Number(closingCash)
    if (!Number.isFinite(cash) || cash < 0) {
      setError('أدخل قيمة جرد الصندوق الصحيحة')
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
          handoverTo: handoverTo.trim() || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error ?? 'تعذر إغلاق الوردية')
      const diff = Number(payload?.cashDifference ?? 0)
      setClosingCash('')
      setHandoverNotes('')
      setHandoverTo('')
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

  const openedAtLabel = (iso: string): string => {
    const d = new Date(iso)
    return `${formatDateShort(d)} — ${formatTime(d)}`
  }

  const diffTone = (shift: ShiftView): { tone: 'success' | 'warning' | 'destructive' | 'primary'; label: string } => {
    if (shift.status === 'open') return { tone: 'primary', label: 'مفتوحة' }
    const diff = Number(shift.cashDifference)
    if (diff > 0) return { tone: 'warning', label: `زيادة ${formatCurrency(diff)}` }
    if (diff < 0) return { tone: 'destructive', label: `نقص ${formatCurrency(Math.abs(diff))}` }
    return { tone: 'success', label: 'مطابق' }
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">لوحة الكاشير</h1>
          <p className="text-sm text-muted-foreground">
            الفرع: {branchName ?? '—'} · الكاشير: {session.name}
          </p>
        </div>
        <form action="/login?next=/cashier">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-xs">تسجيل الخروج</span>
          </button>
        </form>
      </div>

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
            <CardTitle>لا توجد وردية مفتوحة</CardTitle>
            <CardDescription>
              لا يمكن إنشاء طلب أو تحصيل دفع أو إجراء أي عملية مالية قبل فتح الوردية. جميع العمليات مقفلة
              حتى تبدأ ورديتك.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <span className="text-xs font-medium text-warning">الفرع المحدد</span>
                <span className="text-sm font-medium text-foreground">
                  {branchName ?? '—'}
                </span>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <span className="text-xs font-medium text-warning">الكاشير المسجل</span>
                <span className="text-sm font-medium text-foreground">{session.name}</span>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <span className="text-xs font-medium text-warning">وقت الفتح المتوقع</span>
                <span className="text-sm font-medium text-foreground">عند بدء الوردية</span>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">رصيد الافتتاح (نقدي بالصندوق)</span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">ملاحظات الافتتاح (اختياري)</span>
                <Input
                  placeholder="مثال: صندوق التجهيز الصباحي"
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                />
              </label>
              <Button variant="primary" size="lg" className="w-full sm:w-auto" onClick={openShift} disabled={busy}>
                {busy ? 'جارٍ الفتح…' : 'فتح الوردية'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              يُسجّل الكاشير والفرع ورصيد الافتتاح تلقائياً عند الفتح. لا يمكن فتح أكثر من وردية واحدة لنفس الفرع.
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
                <CardTitle>الوردية المفتوحة</CardTitle>
                <Badge tone="primary">مفتوحة</Badge>
              </div>
              <CardDescription>
                فتحها {current.openBy} — {openedAtLabel(current.openedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="رصيد الافتتاح" value={formatCurrency(Number(current.openingCash))} icon="shifts" />
                <StatCard
                  label="محصَّل نقدي"
                  value={formatCurrency(Number(current.cashIn))}
                  icon="plus"
                  hint="دفعات نقدية مكتملة"
                />
                <StatCard
                  label="مردود نقدي"
                  value={formatCurrency(Number(current.cashOut))}
                  icon="minus"
                  hint="استردادات نقدية"
                />
                <StatCard
                  label="المتوقع في الصندوق"
                  value={formatCurrency(Number(current.expectedCash))}
                  icon="clock"
                  hint="افتتاح + محصَّل − مردود"
                />
                <StatCard label="طلبات الوردية" value={formatNumber(current.ordersCount)} icon="orders" />
                <StatCard label="دفعات الوردية" value={formatNumber(current.paymentsCount)} icon="pos" />
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
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">ملاحظات التسليم (اختياري)</span>
                  <Input
                    placeholder="ملاحظات حول تسليم الصندوق"
                    value={handoverNotes}
                    onChange={(e) => setHandoverNotes(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">المستلم (اختياري)</span>
                  <Input
                    placeholder="اسم المدير أو الموظف المستلم"
                    value={handoverTo}
                    onChange={(e) => setHandoverTo(e.target.value)}
                  />
                </label>
                <Button variant="destructive" size="lg" className="w-full sm:w-auto" onClick={closeShift} disabled={busy}>
                  {busy ? 'جارٍ الإغلاق…' : 'إغلاق الوردية وتسليم الصندوق'}
                </Button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-xs font-medium text-muted-foreground">العمليات السريعة</span>
                  <p className="text-sm text-muted-foreground">
                    أنشئ طلباً جديداً أو تحقّق من الطلبات الحالية. جميع الطلبات والدفعات تُربط بهذه الوردية تلقائياً.
                  </p>
                </div>
                <div className="flex gap-2 sm:flex-wrap">
                  <a
                    href="/pos"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>POS — طلب جديد</span>
                  </a>
                  <a
                    href="/orders"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>الطلبات</span>
                  </a>
                  <a
                    href="/shifts"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>التاريخ</span>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Closed / previous shift history on same page for context */}
          <Card>
            <CardHeader>
              <CardTitle>آخر الورديات</CardTitle>
              <CardDescription>الحالة والمتوقع والجرد والفرق (زيادة أو نقص)</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recent.length === 0 ? (
                <EmptyState icon="shifts" title="لا توجد ورديات سابقة" description="أfter فتح أول وردية ستظهر هنا." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="px-2 py-2 text-start font-medium">الحالة</th>
                        <th className="px-2 py-2 text-start font-medium">تم الفتح</th>
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
                        const info = diffTone(s)
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
                            <td className="px-2 py-2 text-end font-medium">
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
        </>
      ) : null}

      {/* ---------- Closed shift state ---------- */}
      {current && current.status === 'closed' ? (
        <Card>
          <CardHeader>
            <CardTitle>الوردية مغلقة — ملخص التسليم</CardTitle>
            <CardDescription>ملخص قراءة فقط للوردية المنتهية. لا يمكن تعديل الأرقام بعد الإغلاق.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <StatCard label="رصيد الافتتاح" value={formatCurrency(Number(current.openingCash))} icon="shifts" />
            <StatCard label="المتوقع في الصندوق" value={formatCurrency(Number(current.expectedCash))} icon="clock" />
            <StatCard label="الجرد الفعلي" value={formatCurrency(Number(current.closingCash))} icon="pos" />
            <StatCard
              label="الفرق (زائد / ناقص)"
              value={formatCurrency(Math.abs(Number(current.cashDifference)))}
              icon={Number(current.cashDifference) >= 0 ? 'trendingUp' : 'trendingDown'}
            />
            <StatCard label="الحالة" value="مغلقة" icon="check" />
            <StatCard
              label="تاريخ الإغلاق"
              value={current.closedAt ? formatDateShort(new Date(current.closedAt)) : '—'}
              icon="clock"
            />
            {current.handoverTo && (
              <StatCard label="تم التسليم إلى" value={current.handoverTo} icon="staff" />
            )}
          </CardContent>
          {current.handoverNotes ? (
            <div className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm">
              <span className="text-xs font-medium text-muted-foreground block mb-1">ملاحظات التسليم</span>
              <p className="text-foreground">{current.handoverNotes}</p>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
