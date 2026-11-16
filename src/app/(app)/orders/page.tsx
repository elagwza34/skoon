import { redirect } from 'next/navigation'
import { requirePageAccess } from '@/lib/require-page-access'
import { listStaffOrders } from '@/lib/staff-orders'
import { hasAtLeast, ROLE, requiresOperationalShift } from '@/lib/authz'
import { getOpenShift } from '@/lib/staff-shifts'
import { OrdersBoard } from '@/components/orders/orders-board'
import { OwnerOpenOrdersBoard } from '@/components/owner/owner-open-orders-board'
import { getCashierInvoices } from '@/lib/staff-invoices'
import { selectOwnerOpenOrders } from '@/lib/owner-open-orders'

export const dynamic = 'force-dynamic'

/**
 * Orders — server component. Branch-scoped orders from the real DB.
 * Payment actions are permission-gated here AND re-checked on the server.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; selected?: string }> }) {
  const params = await searchParams
  const initialQuery = typeof params.q === 'string' ? params.q.slice(0, 60) : ''
  const selected = typeof params.selected === 'string' && /^\d+$/.test(params.selected) ? params.selected : undefined
  const session = await requirePageAccess('/orders')

  if (session.role === ROLE.OWNER) {
    const invoices = selectOwnerOpenOrders(await getCashierInvoices(session))
    return <OwnerOpenOrdersBoard invoices={invoices} initialQuery={initialQuery} initialSelectedId={selected} />
  }

  // Operational staff must have an open shift before working orders.
  if (requiresOperationalShift(session.role) && session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }

  const orders = await listStaffOrders(session, { limit: 100, orderId: selected });
  return (
    <>
    {selected && <a href="/orders" className="mb-3 inline-flex min-h-11 items-center underline">عرض كل الطلبات</a>}
    <OrdersBoard
      orders={orders}
      initialQuery={initialQuery}
      canPay={session.role === ROLE.CASHIER}
      canRefund={hasAtLeast(session.role, ROLE.MANAGER)}
      canManage={hasAtLeast(session.role, ROLE.MANAGER)}
    />
    </>
  );
}
