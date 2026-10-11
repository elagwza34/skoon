import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { getStaffDirectory } from '@/lib/staff-directory'
import { StaffBoard } from '@/components/staff/staff-board'

export const dynamic = 'force-dynamic'

/**
 * Staff — server component. Real directory from the DB.
 * Owner sees all branches; manager sees own branch.
 */
export default async function StaffPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  const directory = await getStaffDirectory(session)
  return <StaffBoard directory={directory} />
}