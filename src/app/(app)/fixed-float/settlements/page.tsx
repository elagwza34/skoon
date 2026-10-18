import { requirePageAccess } from '@/lib/require-page-access'
import { getSharedFloatSummary } from '@/lib/staff-float'
import { SettlementBoard } from '@/components/fixed-float/settlement-board'
export const dynamic = 'force-dynamic'
export default async function SettlementsPage() { const session = await requirePageAccess('/fixed-float/settlements'); return <SettlementBoard summary={await getSharedFloatSummary(session)} /> }
