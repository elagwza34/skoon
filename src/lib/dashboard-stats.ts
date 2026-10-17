import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import type { RecentOrder } from '@/lib/order-status'
import {
  avgPerPaidOrder,
  centsToAmount,
  financeBranchScope,
  getCollectedStats,
  resolveSessionTimezone,
  toCents,
} from '@/lib/finance-metrics'

/**
 * Dashboard statistics — REAL data from the database, server-only.
 *
 * Two money concepts (labelled separately in the UI):
 * - "قيمة الطلبات" (order value): sum of Order.total for non-cancelled orders
 *   created today — customer INTENT, includes unpaid orders.
 * - "المحصّل" (collected): sum of completed Payment.amount created today —
 *   retained CASH. Refunded payments are excluded by status; pending/failed
 *   never count. Attributed to the payment date.
 *
 * Every figure is scoped to the caller's branch (Owner sees all branches) and
 * computed in the branch timezone (branch row `timezone`, Cairo default).
 */

const DEFAULT_TZ = 'Africa/Cairo'

/** Offset (ms) of `timeZone` from UTC at instant `date` — DST-correct. */
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

/** UTC instant for local midnight of the day containing `date` in `timeZone`. */
function startOfDay(date: Date, timeZone: string): Date {
  const local = new Date(date.getTime() + tzOffsetMs(timeZone, date))
  local.setUTCHours(0, 0, 0, 0)
  return new Date(local.getTime() - tzOffsetMs(timeZone, local))
}

export interface DashboardStats {
  /** Retained cash collected today (completed payments). Was order-total based. */
  totalSalesToday: number
  /** Retained cash collected yesterday. */
  totalSalesYesterday: number
  /** Customer intent today: non-cancelled order totals (incl. unpaid). */
  orderValueToday: number
  /** All orders created today (incl. cancelled). */
  ordersToday: number
  /** All orders created yesterday (incl. cancelled). */
  ordersYesterday: number
  /** Distinct orders with a completed payment today. */
  paidOrdersToday: number
  /** Mean collected cash per paid order today (0 when none). */
  avgOrderValue: number
  ordersInPreparation: number
  statusDistribution: { key: string; label: string; value: number; color: string }[]
  salesSeriesByRange: Record<'day' | 'week' | 'month', { label: string; value: number }[]>
  recentOrders: RecentOrder[]
  topProducts: { name: string; emoji: string; qty: number; revenue: number }[]
  tables: { number: string; status: 'available' | 'occupied'; capacity: number }[]
  tableCounts: { available: number; occupied: number; cleaning: number }
}

const STATUS_LABEL: Record<string, string> = {
  new: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', served: 'تم التقديم', cancelled: 'ملغي',
}
const STATUS_COLOR: Record<string, string> = {
  new: 'hsl(var(--accent-foreground))', preparing: 'hsl(var(--warning))',
  ready: 'hsl(var(--primary))', served: 'hsl(var(--success))', cancelled: 'hsl(var(--destructive))',
}

/** Pick a small emoji for a product name (purely cosmetic). */
function productEmoji(name: string): string {
  const n = name.toLowerCase()
  if (/شاي|tea/.test(n)) return '🍵'
  if (/عصير|ليمون|juice|lemon/.test(n)) return '🧃'
  if (/كيك|تشيز|براوني|تيراميسو|cake|dessert/.test(n)) return '🍰'
  if (/ساندويتش|كرواسون|بان كيك|مُفن|معجن|sandwich|croissant/.test(n)) return '🥐'
  if (/قهوة|إسبريسو|أمريكانو|كابتشينو|لاتيه|موكا|espresso|latte|coffee/.test(n)) return '☕'
  return '🥤'
}

export async function getDashboardStats(session: StaffSession): Promise<DashboardStats> {
  const tz = await resolveSessionTimezone(session)
  const now = new Date()
  const startToday = startOfDay(now, tz)
  const startYesterday = new Date(startToday.getTime() - 24 * 60 * 60 * 1000)
  const startMonth = new Date(startToday.getTime() - 29 * 24 * 60 * 60 * 1000)

  const branchScope = financeBranchScope(session)

  // 1) Orders in the last ~30 days — feeds KPIs, donut, chart and recent list.
  const recent = await prisma.order.findMany({
    where: { ...branchScope, createdAt: { gte: startMonth } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, orderNumber: true, status: true, total: true, source: true,
      customerName: true, createdAt: true,
      cafeTable: { select: { number: true } },
      items: { where: { isVoided: false }, select: { quantity: true } },
    },
  })

  const inRange = (d: Date, from: Date, to: Date = now) => d >= from && d < to
  const salesOf = (rows: typeof recent) =>
    centsToAmount(
      rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + toCents(String(r.total)), 0),
    )

  const todayRows = recent.filter((r) => inRange(r.createdAt, startToday))
  const yesterdayRows = recent.filter((r) => inRange(r.createdAt, startYesterday, startToday))

  // Cash truth for today/yesterday: completed payments in the payment-date
  // window (refunded excluded by status; pending/failed never count).
  const [collectedToday, collectedYesterday] = await Promise.all([
    getCollectedStats(session, startToday, new Date(startToday.getTime() + 24 * 60 * 60 * 1000)),
    getCollectedStats(session, startYesterday, startToday),
  ])
  const totalSalesToday = centsToAmount(collectedToday.collectedCents)
  const totalSalesYesterday = centsToAmount(collectedYesterday.collectedCents)
  // Order value (intent) for today via exact cents math over non-cancelled rows.
  const orderValueToday = centsToAmount(
    todayRows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + toCents(String(r.total)), 0),
  )
  const ordersToday = todayRows.length
  const ordersYesterday = yesterdayRows.length
  // Average = collected cash per actually-paid order (intent average lives in reports).
  const avgOrderValue = avgPerPaidOrder(collectedToday.collectedCents, collectedToday.paidOrders)
  const ordersInPreparation = todayRows.filter((r) => r.status === 'preparing').length

  const statusCounts = new Map<string, number>()
  for (const r of todayRows) statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1)
  const statusDistribution = ['new', 'preparing', 'ready', 'served', 'cancelled']
    .map((key) => ({
      key, label: STATUS_LABEL[key] ?? key, value: statusCounts.get(key) ?? 0,
      color: STATUS_COLOR[key] ?? 'hsl(var(--muted-foreground))',
    }))
    .filter((s) => s.value > 0)

  const daySeries = buildHourly(todayRows, tz, now)
  const weekSeries = buildDaily(recent, startToday, 7)
  const monthSeries = buildDaily(recent, startToday, 30)

  const recentOrders: RecentOrder[] = recent.slice(0, 8).map((r) => ({
    id: r.id.toString(),
    number: r.orderNumber,
    table: `الطاولة ${r.cafeTable.number}`,
    status: r.status as RecentOrder['status'],
    itemsCount: r.items.reduce((n, i) => n + i.quantity, 0),
    total: Number(r.total),
    minutesAgo: Math.max(0, Math.round((now.getTime() - r.createdAt.getTime()) / 60000)),
    customerName: r.customerName ?? undefined,
    source: (r.source === 'qr' || r.source === 'waiter' || r.source === 'pos' ? r.source : 'qr'),
  }))

  const topRows = await prisma.orderItem.groupBy({
    by: ['productName'],
    where: {
      isVoided: false,
      order: { ...branchScope, createdAt: { gte: startToday }, status: { not: 'cancelled' } },
    },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { lineTotal: 'desc' } },
    take: 5,
  })
  const topProducts = topRows.map((r) => ({
    name: r.productName, emoji: productEmoji(r.productName),
    qty: r._sum.quantity ?? 0, revenue: centsToAmount(toCents(r._sum.lineTotal ?? '0')),
  }))

  const [allTables, activeByTable] = await Promise.all([
    prisma.cafeTable.findMany({
      where: { ...branchScope, isActive: true }, orderBy: { number: 'asc' },
      select: { id: true, number: true, capacity: true },
    }),
    prisma.order.groupBy({
      by: ['cafeTableId'],
      where: { ...branchScope, status: { in: ['new', 'preparing', 'ready'] } },
      _count: { _all: true },
    }),
  ])
  const occupiedIds = new Set(activeByTable.map((a) => a.cafeTableId.toString()))
  const tables = allTables.map((t) => ({
    number: t.number,
    status: occupiedIds.has(t.id.toString()) ? ('occupied' as const) : ('available' as const),
    capacity: t.capacity,
  }))
  const tableCounts = {
    available: tables.filter((t) => t.status === 'available').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    cleaning: 0,
  }

  return {
    totalSalesToday, totalSalesYesterday, orderValueToday,
    ordersToday, ordersYesterday, paidOrdersToday: collectedToday.paidOrders,
    avgOrderValue, ordersInPreparation, statusDistribution,
    salesSeriesByRange: { day: daySeries, week: weekSeries, month: monthSeries },
    recentOrders, topProducts, tables, tableCounts,
  }
}

type OrderLite = { createdAt: Date; total: unknown; status: string }

export function buildHourly(rows: OrderLite[], tz: string, now: Date): { label: string; value: number }[] {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
  const buckets = new Array(24).fill(0)
  for (const r of rows) {
    if (r.status === 'cancelled') continue
    buckets[Number(fmt.format(r.createdAt)) % 24] += toCents(String(r.total))
  }
  const currentHour = Number(fmt.format(now))
  return buckets
    .map((cents, hour) => ({ label: `${String(hour).padStart(2, '0')}:00`, value: centsToAmount(cents) }))
    .filter((_, hour) => hour <= currentHour)
}

const AR_DAY = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export function buildDaily(rows: OrderLite[], startToday: Date, days: number): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(startToday.getTime() - i * 24 * 60 * 60 * 1000)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const valueCents = rows
      .filter((r) => r.createdAt >= dayStart && r.createdAt < dayEnd && r.status !== 'cancelled')
      .reduce((s, r) => s + toCents(String(r.total)), 0)
    out.push({ label: AR_DAY[dayStart.getUTCDay()], value: centsToAmount(valueCents) })
  }
  return out
}
