import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'

/**
 * Customers — derived from real order history (no registered-customers
 * table in v1; QR orders carry customerName only). Branch-scoped.
 * Server-only.
 */
export interface CustomerRow {
  name: string
  ordersCount: number
  totalSpent: number
  lastOrderAt: string
}

export async function getStaffCustomers(session: StaffSession): Promise<CustomerRow[]> {
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const groups = await prisma.order.groupBy({
    by: ['customerName'],
    where: { ...branchScope, customerName: { not: null } },
    _count: { customerName: true },
    _sum: { total: true },
    _max: { createdAt: true },
  })

  const rows = groups
    .filter((g) => g.customerName && g.customerName.trim().length > 0)
    .map((g) => ({
      name: g.customerName!.trim(),
      ordersCount: g._count.customerName ?? 0,
      totalSpent: Number(g._sum.total ?? 0),
      lastOrderAt: g._max.createdAt!.toISOString(),
    }))

  rows.sort((a, b) => b.ordersCount - a.ordersCount)
  return rows.slice(0, 100)
}
