import { requirePageAccess } from '@/lib/require-page-access'
import { getFixedFloatBoard } from '@/lib/staff-float'
import { FixedFloatBoard } from '@/components/fixed-float/fixed-float-board'
export const dynamic = 'force-dynamic'
export default async function FixedFloatPage() { const session = await requirePageAccess('/fixed-float'); return <FixedFloatBoard board={await getFixedFloatBoard(session)} /> }
