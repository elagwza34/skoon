import { Prisma } from '@prisma/client'
import { ROLE } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import { classifyUnassignedWaiterOrder, type WaiterResponsibilityBucket } from '@/lib/waiter-readiness-policy'

export type WaiterResponsibilityReviewRow = {
  id: string
  branchId: string
  orderNumber: string
  table: string
  status: string
  paymentStatus: string
  source: string
  shiftStatus: string | null
  creatorRecorded: boolean
  createdAt: string
  updatedAt: string
  kitchenState: string
  eligibleWaiters: Array<{ id: string; name: string }>
  bucket: WaiterResponsibilityBucket
  proposal: string
}

export type WaiterOperationalReadiness = {
  totalUnassigned: number
  operational: number
  ambiguous: number
  historical: number
  cases: WaiterResponsibilityReviewRow[]
}

/**
 * Owner/Manager-only read model for migration-era responsibility review.
 * It intentionally returns no customer fields, user IDs, or mutation controls.
 */
export async function getWaiterOperationalReadiness(session: StaffSession): Promise<WaiterOperationalReadiness | null> {
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER) return null
  const branchScope = session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId ?? '0') }

  try {
    const orders = await prisma.order.findMany({
      where: { ...branchScope, responsibleWaiterId: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, orderNumber: true, status: true, paymentStatus: true, source: true,
        createdById: true, createdAt: true, updatedAt: true, branchId: true,
        cafeTable: { select: { number: true, name: true } },
        shift: { select: { status: true } },
        items: { select: { quantity: true, preparedQuantity: true, servedQuantity: true, preparationStartedAt: true, isVoided: true } },
      },
    })
    const branchIds = [...new Set(orders.map((order) => order.branchId.toString()))].map((id) => BigInt(id))
    const waiters = branchIds.length === 0 ? [] : await prisma.user.findMany({
      where: {
        branchId: { in: branchIds },
        isActive: true,
        deletedAt: null,
        role: { slug: ROLE.WAITER },
      },
      select: {
        id: true,
        name: true,
        branchId: true,
        cashierShifts: { where: { status: 'open' }, select: { branchId: true } },
      },
    })
    const eligibleForBranch = (branchId: bigint) => waiters
      .filter((waiter) => waiter.branchId === branchId && waiter.cashierShifts.some((shift) => shift.branchId === branchId))
      .map((waiter) => ({ id: waiter.id, name: waiter.name }))

    const rows = orders.map((order) => {
      const review = classifyUnassignedWaiterOrder(order)
      const activeItems = order.items.filter((item) => !item.isVoided)
      const kitchenState = activeItems.length === 0 ? 'none'
        : activeItems.every((item) => item.servedQuantity >= item.quantity) ? 'served'
          : activeItems.every((item) => item.preparedQuantity >= item.quantity) ? 'ready'
            : activeItems.some((item) => item.preparationStartedAt !== null || item.preparedQuantity > 0) ? 'preparing'
              : 'new'
      return {
        id: order.id.toString(),
        branchId: order.branchId.toString(),
        orderNumber: order.orderNumber,
        table: order.cafeTable.name || order.cafeTable.number,
        status: order.status,
        paymentStatus: order.paymentStatus,
        source: order.source,
        shiftStatus: order.shift?.status ?? null,
        creatorRecorded: order.createdById !== null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        kitchenState,
        eligibleWaiters: eligibleForBranch(order.branchId),
        ...review,
      }
    })
    return {
      totalUnassigned: rows.length,
      operational: rows.filter((row) => row.bucket === 'operational').length,
      ambiguous: rows.filter((row) => row.bucket === 'ambiguous').length,
      historical: rows.filter((row) => row.bucket === 'historical').length,
      cases: rows,
    }
  } catch (error) {
    // A database that has not received the Waiter schema must show no false
    // readiness panel. This remains read-only and preserves the dashboard.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') return null
    throw error
  }
}
