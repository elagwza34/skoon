/** Server-side discount math in integer cents.
 *
 * Calculation order (canonical):
 * 1. Gross subtotal = sum(item.unitPrice * item.quantity)
 * 2. Apply individual item discounts
 * 3. Subtotal after item discounts = gross subtotal - item discounts
 * 4. Split post-item-discount amounts into eligible and excluded bases
 * 5. General invoice discount applied to the eligible base only
 * 6. Final payable = subtotal after item discounts - general discount
 *
 * Item-level discounts are applied first; the general invoice discount is
 * then calculated only on eligible remaining amounts. Excluded lines always
 * remain payable, including under a 100% invoice discount.
 * Historical/settled invoices are never touched by this function.
 */

export type DiscountKind = 'none' | 'percentage' | 'amount'
export type DiscountLine = { unitCents: bigint; quantity: number; discountType: DiscountKind; discountValue: bigint; eligibleForInvoiceDiscount: boolean }
export type DiscountTotals = { subtotalCents: bigint; itemDiscountCents: bigint; afterItemDiscountCents: bigint; eligibleBaseCents: bigint; excludedCents: bigint; invoiceDiscountCents: bigint; finalCents: bigint; lineTotals: Array<{ subtotalCents: bigint; itemDiscountCents: bigint; afterDiscountCents: bigint }> }

function fail(message: string): never { throw new Error(message) }
function percentage(base: bigint, value: bigint) { return (base * value + 50n) / 100n }

export function calculateInvoiceDiscounts(lines: readonly DiscountLine[], invoiceType: DiscountKind, invoiceValue: bigint): DiscountTotals {
  if (invoiceValue < 0n || !['none', 'percentage', 'amount'].includes(invoiceType)) fail('Invalid invoice discount')
  if (invoiceType === 'percentage' && invoiceValue > 100n) fail('Invoice percentage cannot exceed 100')
  const lineTotals = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.unitCents < 0n || line.discountValue < 0n) fail('Invalid invoice line')
    if (line.discountType === 'percentage' && line.discountValue > 100n) fail('Line percentage cannot exceed 100')
    const subtotalCents = line.unitCents * BigInt(line.quantity)
    const itemDiscountCents = line.discountType === 'none' ? 0n : line.discountType === 'percentage' ? percentage(subtotalCents, line.discountValue) : line.discountValue
    if (itemDiscountCents > subtotalCents) fail('Line fixed discount exceeds its subtotal')
    return { subtotalCents, itemDiscountCents, afterDiscountCents: subtotalCents - itemDiscountCents }
  })
  const subtotalCents = lineTotals.reduce((sum, line) => sum + line.subtotalCents, 0n)
  const itemDiscountCents = lineTotals.reduce((sum, line) => sum + line.itemDiscountCents, 0n)
  const afterItemDiscountCents = subtotalCents - itemDiscountCents
  const eligibleBaseCents = lineTotals.reduce(
    (sum, line, index) => sum + (lines[index].eligibleForInvoiceDiscount ? line.afterDiscountCents : 0n),
    0n,
  )
  const excludedCents = afterItemDiscountCents - eligibleBaseCents
  const invoiceDiscountCents = invoiceType === 'none' ? 0n : invoiceType === 'percentage' ? percentage(eligibleBaseCents, invoiceValue) : invoiceValue
  if (invoiceDiscountCents > eligibleBaseCents) fail('Invoice discount exceeds eligible subtotal after item discounts')
  const finalCents = afterItemDiscountCents - invoiceDiscountCents
  if (finalCents < 0n) fail('Invoice total cannot be negative')
  return { subtotalCents, itemDiscountCents, afterItemDiscountCents, eligibleBaseCents, excludedCents, invoiceDiscountCents, finalCents, lineTotals }
}
