import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { getStaffCatalog } from '@/lib/staff-catalog'
import { hasAtLeast, ROLE } from '@/lib/authz'
import { ProductsBoard } from '@/components/products/products-board'

export const dynamic = 'force-dynamic'

/**
 * Products — server component. Real branch catalog from the DB.
 * Toggle = owner/manager/cashier; create/edit gated to owner/manager.
 */
export default async function ProductsPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  const catalog = await getStaffCatalog(session)
  const canEdit = hasAtLeast(session.role, ROLE.MANAGER)
  return <ProductsBoard catalog={catalog} canEdit={canEdit} canToggle={hasAtLeast(session.role, ROLE.CASHIER)} />
}