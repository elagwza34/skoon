'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { ORDER_STATUS_META, ORDER_STATUSES, type OrderStatusKey } from '@/lib/order-status'
import { sourceLabel } from '@/lib/order-status'
import { formatCurrency, formatRelative } from '@/lib/format'
import type { StaffOrderRow } from '@/lib/staff-orders'

/**
 * Staff orders board — real orders from the DB (branch-scoped on the server).
 * Search + status filter run client-side over the snapshot. Cashier+ can
 * finalize a payment (amount always computed server-side); manager+ can refund.
 */

type Filter = 'all' | OrderStatusKey
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  ...ORDER_STATUSES.map((s) => ({ value: s as Filter, label: ORDER_STATUS_META[s].label })),
]

const PAY_METHODS = [
  { value: 'cash', label: 'نقدي' },
  { value: 'card', label: 'بطاقة' },
  { value: 'online', label: 'أونلاين' },
] as const

const PAY_LABEL: Record<string, string> = {
  unpaid: 'غير مدفوع',
  paid: 'مدفوع',
  refunded: 'مسترد',
}
const PAY_TONE: Record<string, BadgeTone> = {
  unpaid: 'warning',
  paid: 'success',
  refunded: 'destructive',
}

export function OrdersBoard({
  orders,
  canPay = false,
  canRefund = false,
}: {
  orders: StaffOrderRow[]
  canPay?: boolean
  canRefund?: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  // Payment panel state
  const [payingId, setPayingId] = useState<string | null>(null)
  const [method, setMethod] = useState<(typeof PAY_METHODS)[number]['value']>('cash')
  const [received, setReceived] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter(
      (o) =>
        (filter === 'all' || o.status === filter) &&
        (!q ||
          o.number.toLowerCase().includes(q) ||
          o.tableNumber.includes(q) ||
          (o.customerName ?? '').includes(q)),
    )
  }, [orders, filter, query])

  function openPay(id: string) {
    setPayingId(id)
    setMethod('cash')
    setReceived('')
    setError(null)
    setSuccess(null)
  }

  async function pay(o: StaffOrderRow) {
    if (busy) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/orders/${o.id}/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'pay',
          method,
          received: method === 'cash' && received.trim() ? Number(received) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'تعذر تسجيل الدفع')
      const change = Number(data.changeAmount ?? 0)
      setSuccess(
        `تم تحصيل ${formatCurrency(Number(data.amount))} — رقم الطلب ${data.orderNumber}` +
          (change > 0 ? ` · الباقي: ${formatCurrency(change)}` : ''),
      )
      setPayingId(null)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تسجيل الدفع')
    } finally {
      setBusy(false)
    }
  }

  async function refund(o: StaffOrderRow) {
    if (busy) return
    const reason = window.prompt('سبب الاسترداد؟')
    if (!reason || reason.trim().length < 3) {
      setError('سبب الاسترداد مطلوب (3 أحرف على الأقل)')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/orders/${o.id}/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'refund', reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'تعذر الاسترداد')
      setSuccess(`تم استرداد دفعات الطلب ${data.orderNumber}`)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الاسترداد')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث برقم الطلب أو الطاولة…"
          aria-label="بحث الطلبات"
          className="max-w-xs"
        />
        <Segmented options={FILTERS} value={filter} onChange={setFilter} ariaLabel="تصفية حسب الحالة" />
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

      <Card>
        <CardContent className="pt-5">
          {rows.length === 0 ? (
            <EmptyState icon="orders" title="لا توجد طلبات مطابقة" description="جرّب بحثاً أو تصفية أخرى." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">رقم الطلب</th>
                    <th className="px-2 py-2 text-start font-medium">الطاولة</th>
                    <th className="px-2 py-2 text-start font-medium">العميل</th>
                    <th className="px-2 py-2 text-start font-medium">المصدر</th>
                    <th className="px-2 py-2 text-start font-medium">الأصناف</th>
                    <th className="px-2 py-2 text-start font-medium">الإجمالي</th>
                    <th className="px-2 py-2 text-start font-medium">الوقت</th>
                    <th className="px-2 py-2 text-start font-medium">الحالة</th>
                    <th className="px-2 py-2 text-start font-medium">الدفع</th>
                    {canPay || canRefund ? (
                      <th className="px-2 py-2 text-start font-medium">إجراء</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const meta = ORDER_STATUS_META[o.status as OrderStatusKey]
                    return (
                      <>
                      <tr key={o.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                        <td className="px-2 py-2.5 font-medium text-foreground">{o.number}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">طاولة {o.tableNumber}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{o.customerName ?? '—'}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{sourceLabel(o.source as 'qr' | 'waiter' | 'pos')}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{o.itemsCount}</td>
                        <td className="px-2 py-2.5 font-medium text-foreground">{formatCurrency(o.total)}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{formatRelative(new Date(o.createdAt))}</td>
                        <td className="px-2 py-2.5">
                          <Badge tone={(meta?.tone ?? 'muted') as BadgeTone}>{meta?.label ?? o.status}</Badge>
                        </td>
                        <td className="px-2 py-2.5">
                          <Badge tone={PAY_TONE[o.paymentStatus] ?? 'muted'}>
                            {PAY_LABEL[o.paymentStatus] ?? o.paymentStatus}
                          </Badge>
                        </td>
                        {canPay || canRefund ? (
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2">
                              {canPay && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' ? (
                                <Button size="sm" variant="outline" onClick={() => openPay(o.id)}>
                                  <Icon name="check" size={14} /> دفع
                                </Button>
                              ) : null}
                              {canRefund && o.paymentStatus === 'paid' ? (
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => refund(o)}>
                                  استرداد (تسجيل داخلي — حركة الأموال الخارجية يدوية)
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                      {payingId === o.id ? (
                        <tr className="bg-accent/30">
                          <td colSpan={8 + (canPay || canRefund ? 1 : 0)} className="px-4 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="text-muted-foreground">طريقة الدفع</span>
                                <select
                                  value={method}
                                  onChange={(e) => setMethod(e.target.value as typeof method)}
                                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                                >
                                  {PAY_METHODS.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                  ))}
                                </select>
                              </label>
                              {method === 'cash' ? (
                                <label className="flex flex-col gap-1 text-xs">
                                  <span className="text-muted-foreground">المبلغ المستلم</span>
                                  <Input
                                    value={received}
                                    onChange={(e) => setReceived(e.target.value)}
                                    inputMode="decimal"
                                    placeholder={String(o.total)}
                                    className="w-32"
                                    aria-label="المبلغ المستلم"
                                  />
                                </label>
                              ) : null}
                              <span className="text-xs text-muted-foreground">
                                المطلوب: {formatCurrency(o.total)} — يُحسب المبلغ على الخادم
                              </span>
                              <Button size="sm" disabled={busy} onClick={() => pay(o)}>
                                {busy ? 'جارٍ التحصيل…' : 'تأكيد التحصيل'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setPayingId(null)}>
                                إلغاء
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      </>
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
