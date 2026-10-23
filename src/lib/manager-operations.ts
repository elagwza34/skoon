import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { StaffSession } from '@/lib/session'
import { ROLE } from '@/lib/authz'
import { getCollectedStats, resolveSessionTimezone, financeBranchScope } from '@/lib/finance-metrics'

export type ManagerOperations = {
  activeOrders: number; delayedOrders: number; awaitingKitchen: number; readyForService: number
  activeTables: number; employeesOnShift: number; collectedToday: number
  kitchen: number; waiter: number; cashier: number; urgent: Array<{ type: string; title: string; detail: string }>
  serviceRequests: { pending: number; complaints: number; escalated: number; overdue: number } | null
}

/** Current branch operations only. This is a read-only supervisor view, never a financial ledger writer. */
export async function getManagerOperations(session: StaffSession): Promise<ManagerOperations | null> {
  if (session.role !== ROLE.MANAGER && session.role !== ROLE.OWNER) return null
  const branchScope = financeBranchScope(session)
  const now = new Date(); const delayedBefore = new Date(now.getTime() - 20 * 60_000)
  const tz = await resolveSessionTimezone(session)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const numeric = (kind: string) => Number(parts.find((part) => part.type === kind)?.value ?? '0')
  const year = numeric('year'), month = numeric('month'), date = numeric('day')
  const today = new Date(Date.UTC(year, month - 1, date))
  const tomorrow = new Date(today.getTime() + 86_400_000)
  const [status, occupied, openShifts, collected] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], where: { ...branchScope, status: { in: ['new', 'preparing', 'ready'] } }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['cafeTableId'], where: { ...branchScope, status: { in: ['new', 'preparing', 'ready'] } } }),
    prisma.shift.findMany({ where: { ...branchScope, status: 'open' }, select: { cashierId: true, openBy: true } }),
    getCollectedStats(session, today, tomorrow),
  ])
  const delayed = await prisma.order.findMany({ where: { ...branchScope, status: { in: ['new', 'preparing'] }, createdAt: { lte: delayedBefore } }, orderBy: { createdAt: 'asc' }, take: 12, select: { orderNumber: true, status: true, createdAt: true } })
  const serviceRequests = await prisma.serviceRequest.groupBy({ by: ['status'], where: { ...branchScope }, _count: { _all: true } }).then(async (groups) => {
    const complaints = await prisma.serviceRequest.count({ where: { ...branchScope, type: 'complaint', status: { in: ['pending', 'accepted', 'in_progress'] } } })
    const [escalated, overdue] = await Promise.all([
      prisma.serviceRequest.count({ where: { ...branchScope, priority: { gt: 0 }, status: { in: ['pending', 'accepted', 'in_progress'] } } }),
      prisma.serviceRequest.count({ where: { ...branchScope, createdAt: { lte: delayedBefore }, status: { in: ['pending', 'accepted', 'in_progress'] } } }),
    ])
    return { pending: groups.find((row) => row.status === 'pending')?._count._all ?? 0, complaints, escalated, overdue }
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') return null
    throw error
  })
  const count = (key: string) => status.find((row) => row.status === key)?._count._all ?? 0
  const urgent = delayed.map((order) => ({ type: 'kitchen-delay', title: `طلب متأخر: ${order.orderNumber}`, detail: `منذ ${Math.floor((now.getTime() - order.createdAt.getTime()) / 60_000)} دقيقة (${order.status === 'new' ? 'بانتظار المطبخ' : 'قيد التحضير'})` }))
  return { activeOrders: count('new') + count('preparing') + count('ready'), delayedOrders: delayed.length, awaitingKitchen: count('new'), readyForService: count('ready'), activeTables: occupied.length, employeesOnShift: openShifts.length, collectedToday: collected.collectedCents / 100, kitchen: count('preparing'), waiter: count('ready'), cashier: openShifts.length, urgent, serviceRequests }
}
