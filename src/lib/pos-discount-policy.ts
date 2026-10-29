export type PosInterfaceMode = 'cashier' | 'waiter'

export function canRenderPosDiscountControls(mode: PosInterfaceMode): boolean {
  return mode === 'cashier'
}

export function submittedDiscountFields(
  mode: PosInterfaceMode,
  discountType?: 'percentage' | 'amount',
  discountValue?: number,
) {
  return canRenderPosDiscountControls(mode) && discountType
    ? { discountType, discountValue: discountValue ?? 0 }
    : {}
}

export function containsDiscountSubmission(input: {
  discountType?: unknown
  discountValue?: unknown
  items?: { discountType?: unknown; discountValue?: unknown }[]
}): boolean {
  return input.discountType !== undefined
    || input.discountValue !== undefined
    || (input.items ?? []).some((item) => item.discountType !== undefined || item.discountValue !== undefined)
}
