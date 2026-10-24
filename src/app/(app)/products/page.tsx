import { requirePageAccess } from '@/lib/require-page-access'
import { getStaffCatalog } from '@/lib/staff-catalog'
import { hasAtLeast, ROLE } from '@/lib/authz'
import { ProductsBoard } from '@/components/products/products-board'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Products — server component. Real branch catalog from the DB.
 * Toggle = owner/manager/cashier; create/edit gated to owner/manager.
 */
export default async function ProductsPage() {
  const session = await requirePageAccess('/products')

  const catalog = await getStaffCatalog(session)
  const canEdit = hasAtLeast(session.role, ROLE.MANAGER)
  const branches = session.role === ROLE.OWNER
    ? await prisma.cafeBranch.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    : []
  return <ProductsBoard
    catalog={catalog}
    canEdit={canEdit}
    canToggle={hasAtLeast(session.role, ROLE.CASHIER)}
    branches={branches.map((branch) => ({ id: branch.id.toString(), name: branch.name }))}
  />
}
