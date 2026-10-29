export type PosDraftLine = { id: string; variantId?: string; qty: number; note?: string }
export type PosDraft = { cart: PosDraftLine[]; tableId: string; customerName: string; customerPhone: string }

export function posDraftKey(userId: string, branchId: string | null) {
  return `skoon.pos.draft:${userId}:${branchId ?? 'owner'}`
}

/** Parses untrusted browser storage and retains only current catalog items. */
export function restorePosDraft(raw: string | null, productIds: ReadonlySet<string>, tableIds: ReadonlySet<string>, productVariantIds: ReadonlySet<string> = new Set()): PosDraft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { cart?: unknown; tableId?: unknown; customerName?: unknown; customerPhone?: unknown }
    if (!Array.isArray(value.cart)) return null
    const cart = value.cart
      .filter((line): line is { id: string; variantId?: string; qty: number; note?: string } => {
        if (!line || typeof line !== 'object') return false
        const candidate = line as { id?: unknown; variantId?: unknown; qty?: unknown }
        if (typeof candidate.id !== 'string' || !productIds.has(candidate.id) || !Number.isInteger(candidate.qty) || Number(candidate.qty) <= 0 || Number(candidate.qty) > 20) return false
        return candidate.variantId === undefined || (typeof candidate.variantId === 'string' && productVariantIds.has(`${candidate.id}:${candidate.variantId}`))
      })
      .map((line) => ({ id: line.id, ...(line.variantId ? { variantId: line.variantId } : {}), qty: line.qty, ...(typeof line.note === 'string' ? { note: line.note.slice(0, 255) } : {}) }))
    return {
      cart,
      tableId: typeof value.tableId === 'string' && tableIds.has(value.tableId) ? value.tableId : '',
      customerName: typeof value.customerName === 'string' ? value.customerName.slice(0, 120) : '',
      customerPhone: typeof value.customerPhone === 'string' ? value.customerPhone.slice(0, 30) : '',
    }
  } catch {
    return null
  }
}
