/**
 * Read-only policy for reviewing legacy orders that predate current waiter
 * responsibility. It deliberately proposes a human decision; it never selects
 * a waiter, changes the creator, or performs a database mutation.
 */
export type WaiterResponsibilityBucket = 'operational' | 'ambiguous' | 'historical'

export type UnassignedOrderFacts = {
  status: string
  paymentStatus: string
  source: string
}

export type WaiterResponsibilityProposal = {
  bucket: WaiterResponsibilityBucket
  proposal: string
}

export function classifyUnassignedWaiterOrder({ status, paymentStatus, source }: UnassignedOrderFacts): WaiterResponsibilityProposal {
  const normalizedStatus = status.toLowerCase()
  const normalizedPayment = paymentStatus.toLowerCase()
  const normalizedSource = source.toLowerCase()

  if (normalizedPayment === 'paid' || normalizedStatus === 'cancelled' || normalizedStatus === 'completed') {
    return { bucket: 'historical', proposal: 'سجل تاريخي أو مسدد — لا يُسند تلقائيًا.' }
  }

  if (['preparing', 'ready', 'served'].includes(normalizedStatus)) {
    return { bucket: 'operational', proposal: 'مراجعة تشغيلية فورية: حدّد مسؤولًا حاليًا أو أغلق الطلب عبر الإجراء المعتمد.' }
  }

  if (normalizedStatus === 'new' && normalizedSource === 'qr') {
    return { bucket: 'ambiguous', proposal: 'طلب QR غير محسوم: يقرر المدير/المالك الإسناد ثم الاعتماد أو الرفض.' }
  }

  return { bucket: 'ambiguous', proposal: 'يلزم قرار مدير/مالك: راجع المصدر والحالة قبل أي إسناد يدوي.' }
}
