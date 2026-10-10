'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { ORDER_STATUS_META, type OrderStatusKey } from '@/lib/demo/orders'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/lib/format'
import type { StaffOrderRow } from '@/lib/staff-orders'

/**
 * Kitchen board — real orders from the DB, advanced through the staff status API.
 * Each successful transition revalidates the server data via router.refresh().
 */
export function KitchenBoard({ orders }: { orders: StaffOrderRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<string>('all')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function advance(id: string, to: string) {
    setPendingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/staff/orders/${id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'فشل تحديث الحالة')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحديث الحالة')
    } finally {
      setPendingId(null)
    }
  }

  const NEXT: Partial<Record<OrderStatusKey, { to: string; label: string }>> = {
    new: { to: 'preparing', label: 'بدء التحضير' },
    preparing: { to: 'ready', label: 'جاهز للتقديم' },
    ready: { to: 'served', label: 'تم التقديم' },
  }

  const visible = orders.filter((o) => filter === 'all' || o.status === filter)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">انقل الطلبات بين الحالات — التحديث يُحفظ مباشرةً في قاعدة البيانات.</p>
        <Segmented
          options={[
            { value: 'all', label: 'الكل' },
            { value: 'new', label: 'جديد' },
            { value: 'preparing', label: 'قيد التحضير' },
            { value: 'ready', label: 'جاهز' },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="تصفية الحالات"
        />
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState icon="kitchen" title="لا توجد طلبات في هذه الحالة" description="اختر حالة أخرى أو انتظر طلبات جديدة." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => {
            const meta = ORDER_STATUS_META[o.status as OrderStatusKey]
            const next = NEXT[o.status as OrderStatusKey]
            return (
              <Card key={o.id} className={cn('flex flex-col', o.status === 'ready' && 'border-primary/40')}>
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col leading-tight">
                      <span className="text-base font-bold text-foreground">{o.number}</span>
                      <span className="text-xs text-muted-foreground">طاولة {o.tableNumber}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={(meta?.tone ?? 'muted') as BadgeTone}>{meta?.label ?? o.status}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Icon name="clock" size={13} /> {formatRelative(new Date(o.createdAt))}
                      </span>
                    </div>
                  </div>

                  <ul className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
                    {o.items.map((it, idx) => (
                      <li key={idx} className="flex items-start justify-between gap-2">
                        <span className="text-foreground">
                          <span className="font-semibold">{it.qty}×</span> {it.name}
                          {it.note ? <span className="block text-xs text-warning">ملاحظة: {it.note}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {next ? (
                    <Button
                      className="mt-auto w-full"
                      onClick={() => advance(o.id, next.to)}
                      disabled={pendingId === o.id}
                    >
                      <Icon name={next.to === 'ready' ? 'check' : next.to === 'served' ? 'utensils' : 'flame'} size={16} />
                      {pendingId === o.id ? 'جاري الحفظ…' : next.label}
                    </Button>
                  ) : (
                    <div className="mt-auto flex items-center justify-center gap-2 rounded-md bg-success/15 py-2 text-sm font-medium text-success">
                      <Icon name="check" size={16} /> تم التقديم
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
