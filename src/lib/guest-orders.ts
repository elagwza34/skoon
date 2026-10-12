/**
 * Guest order resume — lets a customer get back to their order tracking page
 * after leaving the site.
 *
 * How it works:
 *  1. After a successful order submit, the menu view saves `{ id, orderNumber }`
 *     to localStorage (same device + browser only).
 *  2. The landing page shows a "continue my order" button when a saved ref exists.
 *  3. The tracking URL itself (`/order/[id]?n=<orderNumber>`) is self-contained —
 *     it also works bookmarked / shared on any device, and a copy-link button on
 *     the confirmation page makes that easy.
 *
 * Server-safe: every helper no-ops outside the browser (no `window`), so the
 * module can be imported from server components without crashing.
 */

export interface GuestOrderRef {
  id: string
  orderNumber: string
  savedAt: number
}

const STORAGE_KEY = 'skoon-guest-orders'
const MAX_SAVED = 5

function isValidRef(value: unknown): value is GuestOrderRef {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return typeof r.id === 'string' && typeof r.orderNumber === 'string'
}

/** Most-recent-first list of saved order refs (empty on the server). */
export function getGuestOrders(): GuestOrderRef[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidRef).slice(0, MAX_SAVED)
  } catch {
    return []
  }
}

/** Persist an order ref (dedupe by id+orderNumber, cap the list). No-op on server. */
export function saveGuestOrder(ref: { id: string; orderNumber: string }): void {
  if (typeof window === 'undefined') return
  try {
    const rest = getGuestOrders().filter((o) => o.id !== ref.id || o.orderNumber !== ref.orderNumber)
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: ref.id, orderNumber: ref.orderNumber, savedAt: Date.now() }, ...rest].slice(0, MAX_SAVED)),
    )
  } catch {
    // Private mode / quota — resuming is best-effort, never fatal.
  }
}
