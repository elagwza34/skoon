'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { ORDER_STATUS_META, ORDER_STATUSES, type OrderStatusKey } from '@/lib/demo/orders'
import { sourceLabel } from '@/lib/demo/orders'
import { formatCurrency, formatRelative } from '@/lib/format'
import type { StaffOrderRow } from '@/lib/staff-orders'

/**
 * Staff orders board — real orders from the DB (branch-scoped on the server).
 * Search + status filter run client-side over the fetched snapshot; advancing an
 * order is done from the Kitchen board (same status API).
 */

type Filter = 'all' | OrderStatusKey
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  ...ORDER_STATUSES.map((s) => ({ value: s as Filter, label: ORDER_STATUS_META[s].label })),
]

export function OrdersBoard({ orders }: { orders: StaffOrderRow[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter(
      (o) =>
        (filter === 'all' || o.status === filter) &&
        (!q ||
          o.number.toLowerCase().includes(q) ||
          o.tableNumber.includes(q) ||
          (o.customerName ?? '').includes(q)),
    )
  }, [orders, filter, query])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث برقم الطلب أو الطاولة…"
          aria-label="بحث الطلبات"
          className="max-w-xs"
        />
        <Segmented options={FILTERS} value={filter} onChange={setFilter} ariaLabel="تصفية حسب الحالة" />
      </div>

      <Card>
        <CardContent className="pt-5">
          {rows.length === 0 ? (
            <EmptyState icon="orders" title="لا توجد طلبات مطابقة" description="جرّب بحثاً أو تصفية أخرى." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">رقم الطلب</th>
                    <th className="px-2 py-2 text-start font-medium">الطاولة</th>
                    <th className="px-2 py-2 text-start font-medium">العميل</th>
                    <th className="px-2 py-2 text-start font-medium">المصدر</th>
                    <th className="px-2 py-2 text-start font-medium">الأصناف</th>
                    <th className="px-2 py-2 text-start font-medium">الإجمالي</th>
                    <th className="px-2 py-2 text-start font-medium">الوقت</th>
                    <th className="px-2 py-2 text-start font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const meta = ORDER_STATUS_META[o.status as OrderStatusKey]
                    return (
                      <tr key={o.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                        <td className="px-2 py-2.5 font-medium text-foreground">{o.number}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">طاولة {o.tableNumber}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{o.customerName ?? '—'}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{sourceLabel(o.source as 'qr' | 'waiter' | 'pos')}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{o.itemsCount}</td>
                        <td className="px-2 py-2.5 font-medium text-foreground">{formatCurrency(o.total)}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{formatRelative(new Date(o.createdAt))}</td>
                        <td className="px-2 py-2.5">
                          <Badge tone={(meta?.tone ?? 'muted') as BadgeTone}>{meta?.label ?? o.status}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
