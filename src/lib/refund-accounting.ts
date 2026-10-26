import { toCents } from '@/lib/finance-metrics'

/** Immutable refund-event contract. Rows in this state affect net revenue. */
export const RECOGNIZED_REFUND_STATUSES = ['recorded', 'externally_confirmed'] as const
/** Pending requests reserve the original payment balance but do not affect revenue. */
export const RESERVING_REFUND_STATUSES = ['requested', ...RECOGNIZED_REFUND_STATUSES] as const
export type RefundStatus = 'requested' | 'recorded' | 'externally_confirmed' | 'failed' | 'reversed'
export type RefundFundingSource = 'cashier_till' | 'main_safe' | 'external'

export function isRecognizedRefund(status: string): boolean {
  return (RECOGNIZED_REFUND_STATUSES as readonly string[]).includes(status)
}

export function remainingRefundableCents(collectedAmount: unknown, refunds: readonly { amount: unknown; status: string }[]): number {
  return toCents(collectedAmount) - refunds
    .filter((refund) => isRecognizedRefund(refund.status))
    .reduce((total, refund) => total + toCents(refund.amount), 0)
}

export function remainingReservableRefundCents(collectedAmount: unknown, refunds: readonly { amount: unknown; status: string }[]): number {
  return toCents(collectedAmount) - refunds
    .filter((refund) => (RESERVING_REFUND_STATUSES as readonly string[]).includes(refund.status))
    .reduce((total, refund) => total + toCents(refund.amount), 0)
}

export function assertRefundAmount(collectedAmount: unknown, refunds: readonly { amount: unknown; status: string }[], requestedAmount: unknown): number {
  const requested = toCents(requestedAmount)
  const remaining = remainingRefundableCents(collectedAmount, refunds)
  if (requested <= 0) throw new Error('Refund amount must be positive')
  if (requested > remaining) throw new Error('Refund amount exceeds the unrefunded payment balance')
  return requested
}

/** Use for creating a request, so concurrent pending requests cannot over-reserve. */
export function assertRefundReservation(collectedAmount: unknown, refunds: readonly { amount: unknown; status: string }[], requestedAmount: unknown): number {
  const requested = toCents(requestedAmount)
  const remaining = remainingReservableRefundCents(collectedAmount, refunds)
  if (requested <= 0) throw new Error('Refund amount must be positive')
  if (requested > remaining) throw new Error('Refund amount exceeds the unrefunded payment balance')
  return requested
}

/** Only a current till-funded cash refund changes that till's expected cash. */
export function refundAffectsTill(source: RefundFundingSource, status: string): boolean {
  return source === 'cashier_till' && isRecognizedRefund(status)
}
