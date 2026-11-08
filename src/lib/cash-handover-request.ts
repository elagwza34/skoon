/** Browser-safe validation: an empty field must never become a zero cash count. */
export function cashHandoverRequest(action: 'accept' | 'dispute' | 'resolve', handoverId: string, branchId: string, count: string, confirmed: boolean, reason: string) {
  if (!confirmed) throw new Error('أكد عدّ المبلغ أولًا')
  if (!/^\d+(?:\.\d{1,2})?$/.test(count.trim())) throw new Error('أدخل مبلغًا صريحًا بحد أقصى منزلتين عشريتين')
  const amount = Number(count)
  if (!Number.isFinite(amount) || amount < 0 || amount > 9_999_999) throw new Error('المبلغ غير صالح')
  const base = { action, handoverId, branchId, confirmed: true as const }
  if (action === 'accept') return { ...base, action, countedAmount: amount }
  if (reason.trim().length < 3 || reason.trim().length > (action === 'resolve' ? 500 : 1000)) throw new Error('أدخل سببًا صالحًا للعملية')
  return action === 'resolve'
    ? { ...base, action, resolvedAmount: amount, resolutionNote: reason.trim() }
    : { ...base, action, countedAmount: amount, disputeReason: reason.trim() }
}
