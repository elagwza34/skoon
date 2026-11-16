export const GUEST_DRAFT_TTL = 4 * 60 * 60 * 1000
export const guestDraftKey = (token: string) => `skoon-guest-cart:${token}`
export interface GuestCartLine { productId: string; qty: number }

/** Never trust browser storage for prices, product availability, or quantities. */
export function restoreGuestCart(raw: string | null, token: string, products: readonly { id: string; price: string }[], now = Date.now()): { cart: GuestCartLine[]; changed: boolean } {
  if (!raw) return { cart: [], changed: false }
  try {
    const draft = JSON.parse(raw)
    if (draft.version !== 1 || draft.token !== token || !Number.isFinite(draft.savedAt) || draft.savedAt > now || now - draft.savedAt > GUEST_DRAFT_TTL || !Array.isArray(draft.cart)) return { cart: [], changed: true }
    const catalog = new Map(products.map(p => [p.id, p.price]))
    const cart: GuestCartLine[] = []
    const seen = new Set<string>()
    let changed = false
    for (const line of draft.cart) {
      if (!line || !catalog.has(line.productId) || !Number.isInteger(line.qty) || line.qty < 1 || seen.has(line.productId)) { changed = true; continue }
      const qty = Math.min(20, line.qty)
      seen.add(line.productId)
      if (qty !== line.qty || Number(draft.prices?.[line.productId]) !== Number(catalog.get(line.productId))) changed = true
      cart.push({ productId: line.productId, qty })
    }
    return { cart, changed }
  } catch { return { cart: [], changed: true } }
}
