import { requirePageAccess } from '@/lib/require-page-access'
import { BaselineBoard } from '@/components/fixed-float/baseline-board'
export const dynamic = 'force-dynamic'
export default async function BaselinePage(){const session=await requirePageAccess('/fixed-float/baseline'); if(!session.branchId) return <p>اختر فرعاً لتسوية العهدة.</p>; return <BaselineBoard branchId={session.branchId}/>}
