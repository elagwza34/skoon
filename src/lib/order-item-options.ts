export type OrderItemOptionsSnapshot = { version: 1; groups: { groupId: string; groupName: string; optionId: string; optionLabel: string; priceAdjustment: string }[] }

export function modifierSnapshotLabels(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== 'object') return []
  const groups = (snapshot as { groups?: unknown }).groups
  if (!Array.isArray(groups)) return []
  return groups.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const label = (entry as { optionLabel?: unknown }).optionLabel
    return typeof label === 'string' && label.trim() ? [label.trim()] : []
  })
}
