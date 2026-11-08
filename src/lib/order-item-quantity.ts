/** Browser-safe quantity contract shared with the table workspace. */
export function parseOrderItemQuantity(raw: string): { quantity: number; error?: never } | { error: string; quantity?: never } {
  const value = raw.trim()
  if (!/^\d+$/.test(value)) return { error: 'أدخل كمية صحيحة من 1 إلى 99 دون كسور أو رموز.' }
  const quantity = Number(value)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) return { error: 'الكمية المسموح بها من 1 إلى 99.' }
  return { quantity }
}
