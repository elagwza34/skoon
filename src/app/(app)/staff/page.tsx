import { requirePageAccess } from '@/lib/require-page-access'
import { getStaffDirectory } from '@/lib/staff-directory'
import { StaffBoard } from '@/components/staff/staff-board'

export const dynamic = 'force-dynamic'

/**
 * Staff â€” server component. Real directory from the DB.
 * Owner sees all branches; manager sees own branch.
 */
export default async function StaffPage() {
  const session = await requirePageAccess('/staff')

  const directory = await getStaffDirectory(session)
  return <StaffBoard directory={directory} />
}

