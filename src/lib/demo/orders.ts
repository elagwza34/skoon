/**
 * Demo order domain — LOCAL MOCK ONLY (not connected to any database).
 *
 * Shared by the Dashboard, Orders and Kitchen preview screens so the same
 * status vocabulary and sample records are reused consistently. Replace with a
 * real data layer later without touching the UI.
 */

export const ORDER_STATUSES = ['new', 'preparing', 'ready', 'served', 'cancelled'] as const
export type OrderStatusKey = (typeof ORDER_STATUSES)[number]

export type StatusTone =
  | 'success'
  | 'warning'
  | 'info'
  | 'destructive'
  | 'muted'
  | 'primary'

export const ORDER_STATUS_META: Record<OrderStatusKey, { label: string; tone: StatusTone }> = {
  new: { label: 'جديد', tone: 'info' },
  preparing: { label: 'قيد التحضير', tone: 'warning' },
  ready: { label: 'جاهز', tone: 'primary' },
  served: { label: 'تم التقديم', tone: 'success' },
  cancelled: { label: 'ملغي', tone: 'destructive' },
}

/** A compact order row used in "recent orders" tables. */
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

export const recentOrders: RecentOrder[] = [
  { id: 'o1', number: 'ORD-1042', table: 'الطاولة 5', status: 'preparing', itemsCount: 3, total: 195, minutesAgo: 6, source: 'qr' },
  { id: 'o2', number: 'ORD-1041', table: 'الطاولة 12', status: 'ready', itemsCount: 2, total: 120, minutesAgo: 11, source: 'waiter' },
  { id: 'o3', number: 'ORD-1040', table: 'الطاولة 3', status: 'new', itemsCount: 4, total: 260, minutesAgo: 2, source: 'pos' },
  { id: 'o4', number: 'ORD-1039', table: 'الطاولة 8', status: 'served', itemsCount: 1, total: 55, minutesAgo: 24, customerName: 'منى', source: 'qr' },
  { id: 'o5', number: 'ORD-1038', table: 'الطاولة 1', status: 'preparing', itemsCount: 5, total: 340, minutesAgo: 15, source: 'waiter' },
  { id: 'o6', number: 'ORD-1037', table: 'الطاولة 9', status: 'cancelled', itemsCount: 2, total: 90, minutesAgo: 33, source: 'qr' },
]

/** Kitchen order card: items with quantities and a per-item note. */
export interface KitchenOrderItem {
  productId: string
  name: string
  qty: number
  note?: string
}

export interface KitchenOrder {
  id: string
  number: string
  table: string
  status: OrderStatusKey
  minutesAgo: number
  items: KitchenOrderItem[]
}

export const kitchenOrders: KitchenOrder[] = [
  {
    id: 'k1',
    number: 'ORD-1042',
    table: 'الطاولة 5',
    status: 'new',
    minutesAgo: 2,
    items: [
      { productId: 'p3', name: 'لاتيه', qty: 2 },
      { productId: 'p9', name: 'كرواسون زبدة', qty: 1, note: 'ساخن' },
    ],
  },
  {
    id: 'k2',
    number: 'ORD-1040',
    table: 'الطاولة 3',
    status: 'new',
    minutesAgo: 2,
    items: [
      { productId: 'p1', name: 'إسبريسو', qty: 1 },
      { productId: 'p14', name: 'ساندويتش دجاج', qty: 2, note: 'بدون بصل' },
      { productId: 'p11', name: 'تشيز كيك', qty: 1 },
    ],
  },
  {
    id: 'k3',
    number: 'ORD-1041',
    table: 'الطاولة 12',
    status: 'preparing',
    minutesAgo: 11,
    items: [
      { productId: 'p5', name: 'موكا', qty: 1 },
      { productId: 'p12', name: 'براوني', qty: 1 },
    ],
  },
  {
    id: 'k4',
    number: 'ORD-1038',
    table: 'الطاولة 1',
    status: 'preparing',
    minutesAgo: 15,
    items: [
      { productId: 'p6', name: 'فرابتشينو كاراميل', qty: 2 },
      { productId: 'p15', name: 'كلوب ساندويتش', qty: 2 },
      { productId: 'p8', name: 'ليمون بالنعناع', qty: 1 },
    ],
  },
]
