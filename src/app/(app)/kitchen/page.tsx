import { requirePageAccess } from '@/lib/require-page-access'
import { listStaffOrders } from '@/lib/staff-orders'
import { KitchenBoard } from '@/components/kitchen/kitchen-board'

/**
 * Kitchen board — server component. Resolves the branch-scoped live orders for
 * the signed-in staff member and hands them to the interactive board. Kitchen
 * sees active work (new/preparing/ready); the board advances status via the API.
 */
export const dynamic = 'force-dynamic'

export default async function KitchenPage() {
  const session = await requirePageAccess('/kitchen')

  const orders = await listStaffOrders(session, { limit: 100 });
  return <KitchenBoard orders={orders} />;
}
