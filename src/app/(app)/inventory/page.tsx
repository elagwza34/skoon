import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { getStaffInventory } from '@/lib/staff-inventory'
import { hasAtLeast, ROLE } from '@/lib/authz'
import { InventoryBoard } from '@/components/inventory/inventory-board'

export const dynamic = 'force-dynamic'

/**
 * Inventory — server component. Real stock levels + movement history.
 * Manager+ may record movements (server-side branch-scoped). Branch-scoped read.
 */
export default async function InventoryPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  const { items, movements } = await getStaffInventory(session)
  return <InventoryBoard items={items} movements={movements} canManage={hasAtLeast(session.role, ROLE.MANAGER)} />
}