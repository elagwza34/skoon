type TaxLine = { baseCents: bigint; eligible: boolean; snapshot?: unknown }

export function snapshotTaxRate(snapshot: unknown, fallback: unknown = '0'): string {
  const record = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : null
  return String(record?.taxRate ?? fallback ?? '0')
}

function rateBasisPoints(rate: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(rate)
  if (!match) throw new Error('Invalid tax rate')
  const value = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
  if (value > 10000n) throw new Error('Invalid tax rate')
  return value
}

/** Allocate invoice discount by cumulative eligible base; no cents disappear. */
export function calculateSnapshotTax(lines: readonly TaxLine[], invoiceDiscountCents: bigint, legacyRate: unknown = '0') {
  const eligibleBase = lines.reduce((sum, line) => sum + (line.eligible ? line.baseCents : 0n), 0n)
  if (invoiceDiscountCents < 0n || invoiceDiscountCents > eligibleBase) throw new Error('Invalid tax discount allocation')
  let cumulative = 0n, allocated = 0n
  const taxableCents = lines.map(line => {
    if (!line.eligible || eligibleBase === 0n) return line.baseCents
    cumulative += line.baseCents
    const next = invoiceDiscountCents * cumulative / eligibleBase
    const discount = next - allocated
    allocated = next
    return line.baseCents - discount
  })
  const lineTaxCents = lines.map((line, index) => (taxableCents[index] * rateBasisPoints(snapshotTaxRate(line.snapshot, legacyRate)) + 5000n) / 10000n)
  return { taxableCents, lineTaxCents, taxCents: lineTaxCents.reduce((sum, value) => sum + value, 0n) }
}
