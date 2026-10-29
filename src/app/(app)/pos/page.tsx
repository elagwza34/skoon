import { redirect } from 'next/navigation'
import { requirePageAccess } from '@/lib/require-page-access'
import { getPosCatalog, PosError } from '@/lib/staff-pos'
import { PosCheckout } from '@/components/pos/pos-checkout'
import { getOpenShift } from '@/lib/staff-shifts'
import { requiresOperationalShift } from '@/lib/authz'
import { homeForRole } from '@/lib/route-access'
import { listStaffOrders } from '@/lib/staff-orders'

export const dynamic = 'force-dynamic'

/** POS screen — real branch catalog + tables, server-side pricing on submit. */
export default async function PosPage() {
  const session = await requirePageAccess('/pos')

  // Operational staff must have an open shift before using the POS.
  if (requiresOperationalShift(session.role) && session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }

  try {
    const [catalog, orders] = await Promise.all([getPosCatalog(session), listStaffOrders(session, { limit: 100 })])
    const takeawayOrders = orders.filter((order) => order.orderType === 'takeaway' && order.paymentStatus === 'paid' && order.status !== 'cancelled')
    return <PosCheckout catalog={catalog} takeawayOrders={takeawayOrders} />
  } catch (e) {
    if (e instanceof PosError) redirect(homeForRole(session.role))
    throw e
  }
}
