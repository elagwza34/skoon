import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import {
  avgPerPaidOrder,
  centsToAmount,
  financeBranchScope,
  getCollectedStats,
  resolveSessionTimezone,
  toCents,
} from '@/lib/finance-metrics'

/**
 * Staff reports — order value + collected cash from the DB.
 *
 * Two distinct money concepts (never mixed, labelled separately in the UI):
 * - totalOrderValue — sum of Order.total for NON-CANCELLED orders created in
 *   range. This is customer INTENT: unpaid and later-refunded orders are in it.
 * - collectedRevenue — sum of Payment.amount WHERE status='completed' for
 *   payments CREATED in range. This is retained CASH: refunded payments
 *   (completed → refunded flip in refundOrderPayment) are excluded, and
 *   pending/failed payments never count. Attributed to the payment date,
 *   so pay-later orders count when the cash lands, not when ordered.
 * - refundedTotal — completed→refunded payments in range, reported separately.
 *   Never subtracted from collected again (no double-subtract).
 * - byMethod — retained completed cash per payment method; sums to collected.
 *
 * Counts: totalOrders = all orders created in range (incl. cancelled, for
 * visibility); billedOrders = non-cancelled orders (denominator of avg order
 * value); paidOrders = distinct orders with a completed payment in range
 * (denominator of avg collected per paid order).
 *
 * Branch-scoped. Server-only. Branch timezone when available (Cairo default).
 */

const TZ = 'Africa/Cairo' // default; per-branch override resolved in getReportsSummary

function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

function startOfDay(date: Date, timeZone: string): Date {
  const local = new Date(date.getTime() + tzOffsetMs(timeZone, date))
  local.setUTCHours(0, 0, 0, 0)
  return new Date(local.getTime() - tzOffsetMs(timeZone, local))
}

export interface ReportsSummary {
  days: number
  /**
   * Retained cash collected in range (completed payments only). Replaces the
   * old order-total-based figure under the same key so existing consumers
   * (chart, totals) now show cash truth. Kept numeric for compat.
   */
  totalRevenue: number
  /** Customer intent in range (non-cancelled order totals, incl. unpaid). */
  totalOrderValue: number
  /** Retained cash by payment method — sums exactly to totalRevenue. */
  byMethod: { method: string; label: string; value: number }[]
  /** Refunded cash in range (separate line — never subtracted again). */
  refundedTotal: number
  /** All orders created in range (incl. cancelled). */
  totalOrders: number
  /** Non-cancelled orders created in range. */
  billedOrders: number
  /** Distinct orders with a completed payment in range. */
  paidOrders: number
  /** Mean order value over billed (non-cancelled) orders. */
  avgOrderValue: number
  /** Mean collected cash per paid order (0 when none). */
  avgCollectedPerPaidOrder: number
  daily: { label: string; revenue: number; orders: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
  byStatus: { key: string; label: string; value: number }[]
}

const STATUS_LABEL: Record<string, string> = {
  new: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', served: 'تم التقديم', cancelled: 'ملغي',
}

/** Display labels for payment methods — mirrors PAYMENT_METHOD_LABELS (kept local: reports must not import the write module's zod schemas). */
const METHOD_LABEL: Record<string, string> = {
  cash: 'نقدي', card: 'بطاقة', online: 'أونلاين',
}

export async function getReportsSummary(session: StaffSession, daysRaw?: string): Promise<ReportsSummary> {
  const days = daysRaw === '30' ? 30 : daysRaw === '90' ? 90 : 7
  const now = new Date()
  const tz = await resolveSessionTimezone(session)
  const startToday = startOfDay(now, tz)
  const start = new Date(startToday.getTime() - (days - 1) * 24 * 60 * 60 * 1000)

  const branchScope = financeBranchScope(session)

  const [orders, topRows, statusRows, collected] = await Promise.all([
    prisma.order.findMany({
      where: { ...branchScope, createdAt: { gte: start } },
      select: { createdAt: true, total: true, status: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productName'],
      where: {
        isVoided: false,
        order: { ...branchScope, createdAt: { gte: start }, status: { not: 'cancelled' } },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 8,
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { ...branchScope, createdAt: { gte: start } },
      _count: { _all: true },
    }),
    // Cash truth: completed payments created in [start, now), branch-scoped.
    getCollectedStats(session, start, now),
  ])

  // Order value (intent): exact cents math over non-cancelled orders.
  const billed = orders.filter((o) => o.status !== 'cancelled')
  const orderValueCents = billed.reduce((s, o) => s + toCents(o.total.toString()), 0)
  const totalOrderValue = centsToAmount(orderValueCents)

  const totalRevenue = centsToAmount(collected.collectedCents)
  const refundedTotal = centsToAmount(collected.refundedCents)
  const paidOrders = collected.paidOrders

  const daily: ReportsSummary['daily'] = []
  const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit' })
  for (let i = days - 1; i >= 0; i--) {
    const dStart = new Date(startToday.getTime() - i * 24 * 60 * 60 * 1000)
    const dEnd = new Date(dStart.getTime() + 24 * 60 * 60 * 1000)
    const slice = orders.filter((o) => o.createdAt >= dStart && o.createdAt < dEnd)
    daily.push({
      label: dayFmt.format(dStart),
      // Daily chart keeps ORDER VALUE by order date (intent per day); the cash
      // totals above are payment-date based. Labelled as such in the UI.
      revenue: centsToAmount(
        slice.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + toCents(o.total.toString()), 0),
      ),
      orders: slice.length,
    })
  }

  return {
    days,
    totalRevenue,
    totalOrderValue,
    byMethod: Object.entries(collected.byMethodCents)
      .map(([method, cents]) => ({
        method,
        label: METHOD_LABEL[method] ?? method,
        value: centsToAmount(cents),
      }))
      .sort((a, b) => b.value - a.value),
    refundedTotal,
    totalOrders: orders.length,
    billedOrders: billed.length,
    paidOrders,
    avgOrderValue: avgPerPaidOrder(orderValueCents, billed.length),
    avgCollectedPerPaidOrder: avgPerPaidOrder(collected.collectedCents, paidOrders),
    daily,
    topProducts: topRows.map((r) => ({
      name: r.productName, qty: r._sum.quantity ?? 0, revenue: centsToAmount(toCents(r._sum.lineTotal ?? '0')),
    })),
    byStatus: statusRows.map((r) => ({
      key: r.status, label: STATUS_LABEL[r.status] ?? r.status, value: r._count._all,
    })),
  }
}
