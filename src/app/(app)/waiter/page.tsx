import { redirect } from 'next/navigation'
import { requirePageAccess } from '@/lib/require-page-access'
import { getOpenShift } from '@/lib/staff-shifts'
import { isOwner, requiresOperationalShift } from '@/lib/authz'
import { getOwnerWaiterMonitor, getWaiterWorkspace, WaiterSchemaError } from '@/lib/staff-waiter'
import { WaiterBoard } from '@/components/waiter/waiter-board'
import { OwnerWaiterMonitor } from '@/components/waiter/owner-waiter-monitor'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'الويتر | Skoon',
}

/**
 * Waiter — server component. Real branch tables + open orders from the DB.
 * Requires an open shift for the waiter before rendering the board.
 */
export default async function WaiterPage() {
  const session = await requirePageAccess('/waiter')

  if (isOwner(session.role)) {
    const monitor = await getOwnerWaiterMonitor(session)
    return <OwnerWaiterMonitor monitor={monitor} />
  }

  // Waiter must have an open shift before performing waiter duties.
  if (requiresOperationalShift(session.role) && session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }

  try {
    const workspace = await getWaiterWorkspace(session)
    return <WaiterBoard workspace={workspace} />
  } catch (error) {
    if (error instanceof WaiterSchemaError) {
      return <main className="mx-auto max-w-xl p-6" dir="rtl"><h1 className="text-xl font-bold">لوحة النادل غير متاحة مؤقتًا</h1><p className="mt-3 text-muted-foreground">مخطط قاعدة البيانات لا يحتوي جداول تسليم مسؤوليات النادل المطلوبة. لم تُعرض أي بيانات جزئية أو أدوات تشغيلية. يجب تطبيق migration المعتمدة ثم إعادة المحاولة.</p></main>
    }
    throw error
  }
}
