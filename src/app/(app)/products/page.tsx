import { requirePageAccess } from '@/lib/require-page-access'
import { getStaffCatalog } from '@/lib/staff-catalog'
import { ROLE } from '@/lib/authz'
import { canManageProducts } from '@/lib/staff-catalog-write'
import { ProductsBoard } from '@/components/products/products-board'
import { ProductConfigurationBoard } from '@/components/products/product-configuration-board'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Products â€” server component. Real branch catalog from the DB.
 * Toggle = owner/manager/cashier; create/edit gated to owner/manager.
 */
export default async function ProductsPage() {
  const session = await requirePageAccess('/products')

  const catalog = await getStaffCatalog(session)
  const canEdit = canManageProducts(session.role)
  const branches = session.role === ROLE.OWNER
    ? await prisma.cafeBranch.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    : []
  return <div className="space-y-5">
    <ProductsBoard
      catalog={catalog}
      canEdit={canEdit}
      canToggle={canEdit}
      canCreateCategories={canEdit}
      canManageCategories={session.role === ROLE.OWNER || session.role === ROLE.MANAGER}
      branches={branches.map((branch) => ({ id: branch.id.toString(), name: branch.name }))}
    />
    {session.role === ROLE.OWNER ? <ProductConfigurationBoard branches={branches.map((branch) => ({ id: branch.id.toString(), name: branch.name }))} /> : null}
  </div>
}


