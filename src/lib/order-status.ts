/**
 * Order status vocabulary — shared, UI-safe constants (no DB, no demo data).
 *
 * The labels/tones here are the single source of truth for every board
 * (Dashboard, Orders, Kitchen). Real order ROWS always come from the
 * database via staff-orders.ts / dashboard-stats.ts.
 */

export const ORDER_STATUSES = ['new', 'preparing', 'ready', 'served', 'cancelled'] as const
export type OrderStatusKey = (typeof ORDER_STATUSES)[number]

export type StatusTone = 'success' | 'warning' | 'info' | 'destructive' | 'muted' | 'primary'

export const ORDER_STATUS_META: Record<OrderStatusKey, { label: string; tone: StatusTone }> = {
  new: { label: 'جديد', tone: 'info' },
  preparing: { label: 'قيد التحضير', tone: 'warning' },
  ready: { label: 'جاهز', tone: 'primary' },
  served: { label: 'تم التقديم', tone: 'success' },
  cancelled: { label: 'ملغي', tone: 'destructive' },
}

/** Compact order row used in "recent orders" tables. */
export interface RecentOrder {
  id: string
  number: string
  table: string
  status: OrderStatusKey
  itemsCount: number
  total: number
  /** Minutes ago the order was placed. */
  minutesAgo: number
  customerName?: string
  source: 'qr' | 'waiter' | 'pos'
}

const SOURCE_LABEL: Record<RecentOrder['source'], string> = {
  qr: 'QR',
  waiter: 'ويتر',
  pos: 'كاشير',
}

export function sourceLabel(source: RecentOrder['source']): string {
  return SOURCE_LABEL[source]
}
