'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { ORDER_STATUS_META, type OrderStatusKey } from '@/lib/order-status'
import { formatCurrency, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WaiterWorkspace } from '@/lib/staff-waiter'

/**
 * Waiter board — real branch tables + live open orders from the DB.
 * Creating orders happens in POS; serving (ready→served) happens here.
 */
export function WaiterBoard({ workspace }: { workspace: WaiterWorkspace }) {
  const [filter, setFilter] = useState('all')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneIds, setDoneIds] = useState<string[]>([])

  const visible = useMemo(
    () => workspace.openOrders.filter((o) => filter === 'all' || o.status === filter),
    [workspace.openOrders, filter],
  )

  async function serve(id: string) {
    setPendingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/staff/orders/${id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'served' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'فشل التحديث')
      setDoneIds((prev) => [...prev, id])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحديث')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {workspace.tables.map((t) => (
          <Card key={t.id} className={cn(t.openOrders > 0 ? 'border-warning/40' : 'border-success/40')}>
            <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
              <span className="text-2xl font-bold">{t.number}</span>
              <span className="text-xs text-muted-foreground">
                {t.openOrders > 0 ? `${t.openOrders} طلب مفتوح` : 'متاحة'}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">الطلبات المفتوحة — التقديم من هنا (جاهز → تم التقديم).</p>
        <Segmented
          options={[
            { value: 'all', label: 'الكل' },
            { value: 'new', label: 'جديد' },
            { value: 'preparing', label: 'قيد التحضير' },
            { value: 'ready', label: 'جاهز' },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="تصفية الطلبات"
        />
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState icon="orders" title="لا توجد طلبات مفتوحة" description="انتظر طلبات جديدة أو أنشئ طلباً من الكاشير." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => {
            const meta = ORDER_STATUS_META[o.status as OrderStatusKey]
            const done = doneIds.includes(o.id) || o.status === 'served'
            return (
              <Card key={o.id}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <CardTitle className="text-base">{o.number}</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      طاولة {o.tableNumber} · {formatRelative(new Date(o.createdAt))}
                    </span>
                  </div>
                  <Badge tone={(meta?.tone ?? 'muted') as BadgeTone}>{meta?.label ?? o.status}</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(o.total)}</span>
                  {o.status === 'ready' && !done ? (
                    <Button size="sm" onClick={() => serve(o.id)} disabled={pendingId === o.id}>
                      <Icon name="utensils" size={14} />
                      {pendingId === o.id ? 'جاري الحفظ…' : 'تم التقديم'}
                    </Button>
                  ) : done ? (
                    <span className="text-sm text-success">تم التقديم ✓</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">بانتظار المطبخ…</span>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Link href="/pos">
        <Button variant="outline" className="w-full">
          <Icon name="plus" size={16} />
          إنشاء طلب جديد من الكاشير
        </Button>
      </Link>
    </div>
  )
}
