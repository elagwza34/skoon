import { ROLE, isOwner, requiresOperationalShift } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'

export type LogoutBlockerKind =
  | 'active_shift'
  | 'unpaid_invoices'
  | 'waiter_responsibilities'
  | 'kitchen_responsibilities'
  | 'pending_handover'
  | 'cash_reconciliation'

export interface LogoutBlocker {
  kind: LogoutBlockerKind
  label: string
  count?: number
}

export interface LogoutEligibility {
  allowed: boolean
  activeShift: boolean
  pendingOrders: number
  unpaidInvoices: number
  cashReconciliationRequired: boolean
  handoverRequired: boolean
  blockers: LogoutBlocker[]
}

/**
 * Authoritative voluntary-logout decision. It uses only the server-resolved
 * staff session and database records; browser state cannot bypass it.
 *
 * Session expiry/revocation never calls this function, so this guard cannot
 * keep a compromised or expired Supabase session alive.
 */
export async function getLogoutEligibility(session: StaffSession): Promise<LogoutEligibility> {
  // Owners do not operate mandatory shifts and must never be blocked by staff
  // operations belonging to other employees.
  if (isOwner(session.role) || session.branchId === null) {
    return {
      allowed: true,
      activeShift: false,
      pendingOrders: 0,
      unpaidInvoices: 0,
      cashReconciliationRequired: false,
      handoverRequired: false,
      blockers: [],
    }
  }

  const branchId = BigInt(session.branchId)
  const shift = requiresOperationalShift(session.role)
    ? await getOpenShift(session.id, branchId)
    : null

  const [waiterOrders, cashierInvoices, pendingWaiterHandover, kitchenItems] = await Promise.all([
    session.role === ROLE.WAITER
      ? prisma.order.count({
          where: {
            branchId,
            responsibleWaiterId: session.id,
            status: { in: ['new', 'preparing', 'ready'] },
          },
        })
      : Promise.resolve(0),
    // This is deliberately limited to the actor's open till. Orders have no
    // current cashier-responsibility column yet, so unrelated cashiers' unpaid
    // invoices can never block the caller's logout.
    session.role === ROLE.CASHIER && shift
      ? prisma.order.count({
          where: { branchId, shiftId: shift.id, paymentStatus: 'unpaid', status: { not: 'cancelled' } },
        })
      : Promise.resolve(0),
    session.role === ROLE.WAITER && shift
      ? prisma.waiterShiftHandover.count({
          where: { senderShiftId: shift.id, requestedById: session.id, status: 'pending' },
        })
      : Promise.resolve(0),
    session.role === ROLE.KITCHEN
      ? prisma.orderItem.findMany({
          where: {
            preparationStartedById: session.id,
            isVoided: false,
            order: { branchId, status: { in: ['new', 'preparing', 'ready'] } },
          },
          select: { quantity: true, preparedQuantity: true },
        })
      : Promise.resolve([]),
  ])

  const unfinishedKitchenItems = kitchenItems.filter((item) => item.preparedQuantity < item.quantity).length
  const blockers: LogoutBlocker[] = []
  if (shift) blockers.push({ kind: 'active_shift', label: 'وردية مفتوحة' })
  if (cashierInvoices > 0) blockers.push({ kind: 'unpaid_invoices', label: 'فواتير غير محصلة', count: cashierInvoices })
  if (waiterOrders > 0) blockers.push({ kind: 'waiter_responsibilities', label: 'طلبات خدمة غير مكتملة', count: waiterOrders })
  if (unfinishedKitchenItems > 0) blockers.push({ kind: 'kitchen_responsibilities', label: 'مهام تحضير غير مكتملة', count: unfinishedKitchenItems })
  if (pendingWaiterHandover > 0) blockers.push({ kind: 'pending_handover', label: 'تسليم مسؤوليات غير مكتمل', count: pendingWaiterHandover })
  if (session.role === ROLE.CASHIER && shift) blockers.push({ kind: 'cash_reconciliation', label: 'تسوية نقدية مطلوبة' })

  return {
    allowed: blockers.length === 0,
    activeShift: Boolean(shift),
    pendingOrders: waiterOrders + unfinishedKitchenItems,
    unpaidInvoices: cashierInvoices,
    cashReconciliationRequired: session.role === ROLE.CASHIER && Boolean(shift),
    handoverRequired: pendingWaiterHandover > 0,
    blockers,
  }
}
