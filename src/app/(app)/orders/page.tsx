import { redirect } from 'next/navigation'
import { requirePageAccess } from '@/lib/require-page-access'
import { listStaffOrders } from '@/lib/staff-orders'
import { hasAtLeast, ROLE, requiresOperationalShift } from '@/lib/authz'
import { getOpenShift } from '@/lib/staff-shifts'
import { OrdersBoard } from '@/components/orders/orders-board'

export const dynamic = 'force-dynamic'

/**
 * Orders — server component. Branch-scoped orders from the real DB.
 * Payment actions are permission-gated here AND re-checked on the server.
 */
export default async function OrdersPage() {
  const session = await requirePageAccess('/orders')

  // Operational staff must have an open shift before working orders.
  if (requiresOperationalShift(session.role) && session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }

  const orders = await listStaffOrders(session, { limit: 100 });
  return (
    <OrdersBoard
      orders={orders}
      canPay={hasAtLeast(session.role, ROLE.CASHIER)}
      canRefund={hasAtLeast(session.role, ROLE.MANAGER)}
      canManage={hasAtLeast(session.role, ROLE.MANAGER)}
    />
  );
}
