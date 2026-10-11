'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StaffTable } from '@/lib/staff-tables'

/**
 * Tables board — real branch tables + live occupancy.
 * No local state mutation: occupancy derives from open orders in the DB.
 */
export function TablesBoard({ tables }: { tables: StaffTable[] }) {
  const available = tables.filter((t) => t.status === 'available').length
  const occupied = tables.filter((t) => t.status === 'occupied').length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
          <span className="text-lg font-bold text-foreground">{formatNumber(available)}</span>
          <span className="text-success">متاحة</span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
          <span className="text-lg font-bold text-foreground">{formatNumber(occupied)}</span>
          <span className="text-warning">مشغولة</span>
        </span>
        <Link href="/tables/print" className="ms-auto">
          <Button size="sm" variant="outline">
            <Icon name="orders" size={14} />
            طباعة QR
          </Button>
        </Link>
      </div>

      {tables.length === 0 ? (
        <EmptyState icon="tables" title="لا توجد طاولات" description="أضف طاولات الفرع من قاعدة البيانات أولاً." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {tables.map((t) => (
            <Card
              key={t.id}
              className={cn(
                'flex flex-col',
                t.status === 'available' ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10',
              )}
            >
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn('h-2.5 w-2.5 rounded-full', t.status === 'available' ? 'bg-success' : 'bg-warning')}
                      aria-hidden="true"
                    />
                    <span className="text-lg font-bold text-foreground">{t.number}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatNumber(t.capacity)} مقاعد</span>
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium text-foreground">
                    {t.status === 'available' ? 'متاحة' : `مشغولة · ${formatNumber(t.openOrders)} طلب`}
                  </span>
                  {t.name ? <span className="text-xs text-muted-foreground">{t.name}</span> : null}
                </div>
                <Link href={`/menu/${t.publicToken}`} className="mt-auto">
                  <Button size="sm" variant={t.status === 'available' ? 'primary' : 'outline'} className="w-full">
                    <Icon name="utensils" size={14} />
                    فتح المنيو
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
