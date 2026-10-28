import { requirePageAccess } from '@/lib/require-page-access'
import { BaselineBoard } from '@/components/fixed-float/baseline-board'
export const dynamic = 'force-dynamic'
export default async function BaselinePage(){const session=await requirePageAccess('/fixed-float/baseline'); if(!session.branchId) return <p>Ø§Ø®ØªØ± ÙØ±Ø¹Ø§Ù‹ Ù„ØªØ³ÙˆÙŠØ© Ø§Ù„Ø¹Ù‡Ø¯Ø©.</p>; return <BaselineBoard branchId={session.branchId}/>}


