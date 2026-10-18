import { redirect } from 'next/navigation'
import { requirePageAccess } from '@/lib/require-page-access'
import { getOpenShift } from '@/lib/staff-shifts'
import { listKitchenOrders } from '@/lib/staff-orders'
import { KitchenBoard } from '@/components/kitchen/kitchen-board'

export const dynamic = 'force-dynamic'

/**
 * Kitchen board — server component. Resolves the branch-scoped live orders for
 * the signed-in staff member and hands them to the interactive board. Kitchen
 * sees active work (new/preparing/ready); the board advances status via the API.
 * Requires an open shift for the kitchen employee before rendering the board.
 */
export default async function KitchenPage() {
  const session = await requirePageAccess('/kitchen')

  // Kitchen employee must have an open shift before performing kitchen duties.
  if (session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }

  const orders = await listKitchenOrders(session, 100);
  return <KitchenBoard orders={orders} />;
}
