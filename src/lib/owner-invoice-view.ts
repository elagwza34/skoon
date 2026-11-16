/** Client-safe creation-date filtering and invoice face-value summaries. */
export type InvoiceTab = 'open' | 'paid' | 'cancelled' | 'deleted'
export type RangePreset = 'day' | 'week' | 'month' | 'custom' | 'all'
export type InvoiceRange = { from: string; to: string; error: string | null }
type ViewInvoice = { number: string; creator: string | null; createdAt: string; status: string; isArchived: boolean; total: string; remaining: string }

export function cairoDateKey(value: Date | string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

export function resolveInvoiceRange(preset: RangePreset, from: string, to: string, now = new Date()): InvoiceRange {
  if (preset === 'all') return { from: '', to: '', error: null }
  if (preset === 'custom') {
    if (!validDate(from) || !validDate(to)) return { from, to, error: 'اختر تاريخ بداية ونهاية صالحين.' }
    if (from > to) return { from, to, error: 'تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.' }
    if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 365 * 86_400_000) return { from, to, error: 'النطاق المخصص لا يتجاوز 366 يوماً. اختر كل التاريخ لعرض السجل كاملاً.' }
    return { from, to, error: null }
  }
  const today = cairoDateKey(now)
  const start = new Date(`${today}T00:00:00Z`)
  if (preset === 'week') start.setUTCDate(start.getUTCDate() - 6)
  if (preset === 'month') start.setUTCDate(1)
  return { from: start.toISOString().slice(0, 10), to: today, error: null }
}

function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new Error('Invalid invoice money')
  return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0')))
}
function decimal(value: bigint): string {
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}
export function invoiceBucket(invoice: Pick<ViewInvoice, 'status' | 'isArchived' | 'remaining'>): InvoiceTab {
  if (invoice.isArchived) return 'deleted'
  if (invoice.status === 'cancelled') return 'cancelled'
  return cents(invoice.remaining) <= 0n ? 'paid' : 'open'
}
export function invoiceView<T extends ViewInvoice>(invoices: T[], range: InvoiceRange, tab: InvoiceTab, query: string) {
  const totals = { open: 0n, paid: 0n, cancelled: 0n, deleted: 0n }
  const cards = { open: { count: 0, amount: '0.00' }, paid: { count: 0, amount: '0.00' }, cancelled: { count: 0, amount: '0.00' }, deleted: { count: 0, amount: '0.00' } }
  const rows: T[] = []
  if (range.error) return { rows, cards }
  const search = query.trim().toLowerCase()
  for (const invoice of invoices) {
    const day = cairoDateKey(invoice.createdAt)
    if (!day || (range.from && day < range.from) || (range.to && day > range.to)) continue
    const bucket = invoiceBucket(invoice)
    cards[bucket].count++
    totals[bucket] += cents(bucket === 'open' ? invoice.remaining : invoice.total)
    if (bucket === tab && (!search || invoice.number.toLowerCase().includes(search) || (invoice.creator ?? '').toLowerCase().includes(search))) rows.push(invoice)
  }
  for (const bucket of Object.keys(cards) as InvoiceTab[]) cards[bucket].amount = decimal(totals[bucket])
  return { rows, cards }
}
