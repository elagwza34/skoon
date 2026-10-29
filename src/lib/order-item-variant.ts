export type OrderItemVariantSnapshot = {
  version: 1
  combinationKey: string
  values: { attribute: string | null; label: string }[]
}

type VariantValue = { label: string; attribute?: { name?: string; sortOrder?: number } }

export function orderedVariantLabels(values: readonly VariantValue[], combinationKey?: string): string[] {
  const labels = [...values]
    .sort((left, right) => (left.attribute?.sortOrder ?? 0) - (right.attribute?.sortOrder ?? 0))
    .map((entry) => entry.label.trim())
    .filter(Boolean)
  if (labels.length) return [...new Set(labels)]
  const fallback = combinationKey?.trim()
  return fallback ? [fallback] : []
}

export function createOrderItemVariantSnapshot(combinationKey: string, values: readonly VariantValue[]): OrderItemVariantSnapshot {
  return {
    version: 1,
    combinationKey,
    values: [...values]
      .sort((left, right) => (left.attribute?.sortOrder ?? 0) - (right.attribute?.sortOrder ?? 0))
      .map((entry) => ({ attribute: entry.attribute?.name?.trim() || null, label: entry.label.trim() }))
      .filter((entry) => entry.label.length > 0),
  }
}

function snapshotLabels(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== 'object') return []
  const record = snapshot as Record<string, unknown>
  if (Array.isArray(record.values)) {
    const labels = record.values.flatMap((entry) => {
      if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : []
      if (!entry || typeof entry !== 'object') return []
      const label = (entry as Record<string, unknown>).label
      return typeof label === 'string' && label.trim() ? [label.trim()] : []
    })
    if (labels.length) return [...new Set(labels)]
  }
  for (const key of ['label', 'name', 'value', 'title', 'combinationKey']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return [value.trim()]
  }
  return []
}

/** Stored snapshots are immutable invoice history; live catalog labels are only
 * a fallback for legacy rows that predate snapshot persistence. */
export function resolveOrderItemVariantLabels(snapshot: unknown, relationLabels: readonly string[]): string[] {
  const persisted = snapshotLabels(snapshot)
  if (persisted.length) return persisted
  return [...new Set(relationLabels.map((value) => value.trim()).filter(Boolean))]
}
