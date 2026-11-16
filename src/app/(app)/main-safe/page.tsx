import { requirePageAccess } from '@/lib/require-page-access'
import { getMainSafeSummary } from '@/lib/staff-float'
import { MainSafeBoard } from '@/components/main-safe/main-safe-board'

export const dynamic = 'force-dynamic'

export default async function MainSafePage() {
  const session = await requirePageAccess('/main-safe')
  return <MainSafeBoard summary={await getMainSafeSummary(session)} isOwner={session.role === 'owner'} />
}
