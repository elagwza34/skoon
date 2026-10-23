export type FifoLayer = { quantity: number; unitCost: number }
export type CountPlan = { variance: number; direction: 'positive' | 'negative' | 'zero'; cost: number; blocked?: string }

/** Pure posting gate. DB code must lock the item, re-read current stock and then
 * apply this result with inventory transaction/allocation rows atomically. */
export function planStockCount(input: { snapshot: number; current: number; counted: number; reserved: number; fifo: FifoLayer[]; positiveUnitCost?: number }): CountPlan {
  if (![input.snapshot, input.current, input.counted, input.reserved].every(Number.isFinite) || input.counted < 0 || input.reserved < 0) throw new Error('Invalid count quantities')
  if (Math.abs(input.current - input.snapshot) > 0.000001) return { variance: input.counted - input.snapshot, direction: input.counted === input.snapshot ? 'zero' : input.counted > input.snapshot ? 'positive' : 'negative', cost: 0, blocked: 'STALE_SNAPSHOT' }
  if (input.counted < input.reserved) return { variance: input.counted - input.current, direction: 'negative', cost: 0, blocked: 'BELOW_ACTIVE_RESERVATIONS' }
  const variance = round(input.counted - input.current)
  if (variance === 0) return { variance, direction: 'zero', cost: 0 }
  if (variance > 0) {
    if (!Number.isFinite(input.positiveUnitCost) || input.positiveUnitCost! < 0) return { variance, direction: 'positive', cost: 0, blocked: 'MISSING_POSITIVE_VALUATION' }
    return { variance, direction: 'positive', cost: round(variance * input.positiveUnitCost!) }
  }
  let left = -variance; let cost = 0
  for (const layer of input.fifo) { const take = Math.min(left, layer.quantity); cost += take * layer.unitCost; left = round(left - take); if (left <= 0) break }
  return left > 0 ? { variance, direction: 'negative', cost: round(cost), blocked: 'INSUFFICIENT_FIFO_LAYERS' } : { variance, direction: 'negative', cost: round(cost) }
}
function round(n: number) { return Math.round(n * 1000) / 1000 }
