import { requirePageAccess } from '@/lib/require-page-access'
import { getStaffInventory } from '@/lib/staff-inventory'
import { hasPermission, ROLE } from '@/lib/authz'
import { InventoryBoard } from '@/components/inventory/inventory-board'
import { StockCountBoard } from '@/components/inventory/stock-count-board'
import { AccountabilityBoard } from '@/components/inventory/accountability-board'
import { WasteBoard } from '@/components/inventory/waste-board'

export const dynamic = 'force-dynamic'

/**
 * Inventory — server component. Real stock levels + movement history.
 * Manager+ may record movements (server-side branch-scoped). Branch-scoped read.
 */
export default async function InventoryPage() {
  const session = await requirePageAccess('/inventory')

  const { items, movements, batches } = await getStaffInventory(session)
  const canManage = session.role === ROLE.OWNER || hasPermission(session.permissions, 'inventory.manage')
  return <><InventoryBoard items={items} movements={movements} batches={batches} canManage={canManage} /><WasteBoard items={items} canManage={canManage} /><StockCountBoard canManage={canManage} branchId={session.branchId} /><AccountabilityBoard canManage={canManage} /></>
}
