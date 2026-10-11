import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'

/**
 * Staff reports — revenue + orders aggregates from the DB.
 * Same business definitions as the dashboard: cancelled orders excluded
 * from revenue; Africa/Cairo day boundaries. Branch-scoped. Server-only.
 */

const TZ = 'Africa/Cairo'

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
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  daily: { label: string; revenue: number; orders: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
  byStatus: { key: string; label: string; value: number }[]
}

const STATUS_LABEL: Record<string, string> = {
  new: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', served: 'تم التقديم', cancelled: 'ملغي',
}

export async function getReportsSummary(session: StaffSession, daysRaw?: string): Promise<ReportsSummary> {
  const days = daysRaw === '30' ? 30 : daysRaw === '90' ? 90 : 7
  const now = new Date()
  const startToday = startOfDay(now, TZ)
  const start = new Date(startToday.getTime() - (days - 1) * 24 * 60 * 60 * 1000)

  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [orders, topRows, statusRows] = await Promise.all([
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
  ])

  const paid = orders.filter((o) => o.status !== 'cancelled')
  const totalRevenue = paid.reduce((s, o) => s + Number(o.total), 0)

  const daily: ReportsSummary['daily'] = []
  const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit' })
  for (let i = days - 1; i >= 0; i--) {
    const dStart = new Date(startToday.getTime() - i * 24 * 60 * 60 * 1000)
    const dEnd = new Date(dStart.getTime() + 24 * 60 * 60 * 1000)
    const slice = orders.filter((o) => o.createdAt >= dStart && o.createdAt < dEnd)
    daily.push({
      label: dayFmt.format(dStart),
      revenue: slice.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total), 0),
      orders: slice.length,
    })
  }

  return {
    days,
    totalRevenue,
    totalOrders: orders.length,
    avgOrderValue: paid.length ? totalRevenue / paid.length : 0,
    daily,
    topProducts: topRows.map((r) => ({
      name: r.productName, qty: r._sum.quantity ?? 0, revenue: Number(r._sum.lineTotal ?? 0),
    })),
    byStatus: statusRows.map((r) => ({
      key: r.status, label: STATUS_LABEL[r.status] ?? r.status, value: r._count._all,
    })),
  }
}
