export type PosDraftLine = { id: string; qty: number; note?: string }
export type PosDraft = { cart: PosDraftLine[]; tableId: string; customerName: string }

export function posDraftKey(userId: string, branchId: string | null) {
  return `skoon.pos.draft:${userId}:${branchId ?? 'owner'}`
}

/** Parses untrusted browser storage and retains only current catalog items. */
export function restorePosDraft(raw: string | null, productIds: ReadonlySet<string>, tableIds: ReadonlySet<string>): PosDraft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { cart?: unknown; tableId?: unknown; customerName?: unknown }
    if (!Array.isArray(value.cart)) return null
    const cart = value.cart
      .filter((line): line is { id: string; qty: number; note?: string } => Boolean(line) && typeof line === 'object' && typeof (line as { id?: unknown }).id === 'string' && productIds.has((line as { id: string }).id) && Number.isInteger((line as { qty?: unknown }).qty) && (line as { qty: number }).qty > 0 && (line as { qty: number }).qty <= 20)
      .map((line) => ({ id: line.id, qty: line.qty, ...(typeof line.note === 'string' ? { note: line.note.slice(0, 255) } : {}) }))
    return {
      cart,
      tableId: typeof value.tableId === 'string' && tableIds.has(value.tableId) ? value.tableId : '',
      customerName: typeof value.customerName === 'string' ? value.customerName.slice(0, 120) : '',
    }
  } catch {
    return null
  }
}
