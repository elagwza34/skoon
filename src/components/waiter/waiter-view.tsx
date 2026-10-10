'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

// ============================================================================
// Waiter screen (Demo). Self-contained: inline data + inline SVG icons so it
// has no fragile cross-module imports. Tablet & mobile friendly. RTL ready.
// All data here is DEMO and clearly labeled; no DB / Supabase / auth wiring.
// ============================================================================

type TableStatus = 'available' | 'occupied' | 'cleaning' | 'needs_cleaning'

type OrderStage = 'new' | 'preparing' | 'ready' | 'served'

interface WaiterTable {
  id: string
  number: number
  seats: number
  status: TableStatus
  guests?: number
  area: string
}

interface MenuItem {
  id: string
  name: string
  price: number
  category: string
}

interface CartLine {
  item: MenuItem
  qty: number
  note?: string
}

interface OpenOrder {
  id: string
  tableNumber: number
  stage: OrderStage
  itemsCount: number
  total: number
  sinceMins: number
}

const TABLES: WaiterTable[] = [
  { id: 't1', number: 1, seats: 2, status: 'occupied', guests: 2, area: 'الصالة' },
  { id: 't2', number: 2, seats: 4, status: 'available', area: 'الصالة' },
  { id: 't3', number: 3, seats: 4, status: 'needs_cleaning', area: 'الصالة' },
  { id: 't4', number: 4, seats: 6, status: 'occupied', guests: 5, area: 'التراس' },
  { id: 't5', number: 5, seats: 2, status: 'available', area: 'التراس' },
  { id: 't6', number: 6, seats: 4, status: 'occupied', guests: 3, area: 'التراس' },
  { id: 't7', number: 7, seats: 8, status: 'available', area: 'VIP' },
  { id: 't8', number: 8, seats: 2, status: 'needs_cleaning', area: 'VIP' },
]

const MENU: MenuItem[] = [
  { id: 'm1', name: 'قهوة إسبريسو', price: 25, category: 'مشروبات ساخنة' },
  { id: 'm2', name: 'لاتيه', price: 40, category: 'مشروبات ساخنة' },
  { id: 'm3', name: 'كابتشينو', price: 42, category: 'مشروبات ساخنة' },
  { id: 'm4', name: 'شاي أخضر', price: 20, category: 'مشروبات ساخنة' },
  { id: 'm5', name: 'آيس لاتيه', price: 48, category: 'مشروبات باردة' },
  { id: 'm6', name: 'عصير برتقال', price: 35, category: 'مشروبات باردة' },
  { id: 'm7', name: 'ليموناضة', price: 30, category: 'مشروبات باردة' },
  { id: 'm8', name: 'كرواسون', price: 28, category: 'مخبوزات' },
  { id: 'm9', name: 'كيكة الشوكولاتة', price: 45, category: 'حلويات' },
  { id: 'm10', name: 'تشيز كيك', price: 50, category: 'حلويات' },
  { id: 'm11', name: 'ساندويتش جبنة', price: 38, category: 'مأكولات' },
  { id: 'm12', name: 'سلطة دجاج', price: 65, category: 'مأكولات' },
]

const CATEGORIES = ['الكل', 'مشروبات ساخنة', 'مشروبات باردة', 'مخبوزات', 'حلويات', 'مأكولات']

const OPEN_ORDERS: OpenOrder[] = [
  { id: 'o-1001', tableNumber: 1, stage: 'preparing', itemsCount: 3, total: 90, sinceMins: 8 },
  { id: 'o-1002', tableNumber: 4, stage: 'ready', itemsCount: 5, total: 245, sinceMins: 15 },
  { id: 'o-1003', tableNumber: 6, stage: 'new', itemsCount: 2, total: 65, sinceMins: 2 },
]

const STAGE_META: Record<OrderStage, { label: string; cls: string }> = {
  new: { label: 'جديد', cls: 'bg-primary/15 text-primary' },
  preparing: { label: 'قيد التحضير', cls: 'bg-warning/15 text-warning' },
  ready: { label: 'جاهز', cls: 'bg-success/15 text-success' },
  served: { label: 'تم التقديم', cls: 'bg-muted text-muted-foreground' },
}

const TABLE_STATUS_META: Record<TableStatus, { label: string; dot: string; card: string }> = {
  available: { label: 'متاحة', dot: 'bg-success', card: 'border-success/30 hover:border-success/60' },
  occupied: { label: 'مشغولة', dot: 'bg-primary', card: 'border-primary/30 hover:border-primary/60' },
  cleaning: { label: 'قيد التنظيف', dot: 'bg-muted', card: 'border-muted/30 hover:border-muted/60' },
  needs_cleaning: { label: 'تحتاج تنظيفا', dot: 'bg-warning', card: 'border-warning/30 hover:border-warning/60' },
}

const currency = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(n)

// ============================================================================
// WaiterView — Main waiter screen component
// ============================================================================

interface WaiterViewProps {
  selectedTable?: string
  onTableSelect?: (tableId: string) => void
}

export function WaiterView({ selectedTable, onTableSelect }: WaiterViewProps) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [showMenu, setShowMenu] = useState(false)

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id)
      if (existing) {
        return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...prev, { item, qty: 1 }]
    })
  }

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((l) => l.item.id !== itemId))
  }

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.item.price * l.qty, 0), [cart])

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">قائمة الانتظار</h1>
            <span className="text-sm text-muted-foreground">Skoon POS</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="btn btn-sm"
            >
              قائمة
            </button>
            <button className="btn btn-sm btn-ghost">خروج</button>
          </div>
        </div>
        {showMenu && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.slice(1).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setShowMenu((v) => !v)}
                  className="btn btn-sm btn-outline"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        {/* Tables Panel */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">مكتبة المطعم</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TABLES.map((table) => {
              const meta = TABLE_STATUS_META[table.status]
              return (
                <button
                  key={table.id}
                  onClick={() => onTableSelect?.(table.id)}
                  className={`${meta.card} rounded-xl p-4 text-center transition-colors border-2`}
                  style={{
                    borderColor: meta.dot.replace('bg-', 'var(--tw-color)'),
                  }}
                >
                  <div className="text-2xl font-bold mb-1">{table.number}</div>
                  <div className={`text-xs ${meta.dot} inline-block w-2 h-2 rounded-full mb-2`} />
                  <div className="text-xs text-muted-foreground">{meta.label}</div>
                  {table.guests && <div className="text-xs text-muted-foreground">{table.guests} ضيف</div>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Open Orders / Cart */}
        <div className="border-t lg:border-t-0 lg:border-l border-border bg-card">
          <div className="p-4">
            <h2 className="mb-3 text-lg font-semibold">الطلبات المفتوحة</h2>
            {OPEN_ORDERS.length === 0 ? (
              <div className="empty-state">لا توجد طلبات مفتوحة</div>
            ) : (
              <ul className="space-y-2">
                {OPEN_ORDERS.map((order) => (
                  <li key={order.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${STAGE_META[order.stage].cls}`} />
                      <span className="font-medium">طاولة {order.tableNumber}</span>
                      <span className="text-xs text-muted-foreground">{STAGE_META[order.stage].label}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{currency(order.total)}</div>
                      <div className="text-xs text-muted-foreground">{order.itemsCount} عناصر</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {cart.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm">الإجمالي:</span>
                  <span className="font-bold">{currency(total)}</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-primary flex-1">تأكيد الطلب</button>
                  <button className="btn btn-sm btn-ghost">مسح</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}