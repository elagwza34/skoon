import { requirePageAccess } from '@/lib/require-page-access'
import { listStaffOrders } from '@/lib/staff-orders'
import { hasAtLeast, ROLE } from '@/lib/authz'
import { OrdersBoard } from '@/components/orders/orders-board'

/**
 * Orders — server component. Branch-scoped orders from the real DB.
 * Payment actions are permission-gated here AND re-checked on the server.
 */
export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const session = await requirePageAccess('/orders')

  const orders = await listStaffOrders(session, { limit: 100 });
  return (
    <OrdersBoard
      orders={orders}
      canPay={hasAtLeast(session.role, ROLE.CASHIER)}
      canRefund={hasAtLeast(session.role, ROLE.MANAGER)}
    />
  );
}
