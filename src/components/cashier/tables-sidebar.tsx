'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { PosCatalog } from '@/lib/staff-pos'
import type { InvoiceRow } from '@/lib/staff-invoices'

interface TablesSidebarProps {
  catalog: PosCatalog
  invoices?: InvoiceRow[]
}

export function TablesSidebar({ catalog, invoices = [] }: TablesSidebarProps) {
  const router = useRouter()
  const tables = useMemo(
    () =>
      (catalog?.tables ?? [])
        .map((table) => {
          const openCount = Number((table as any).openOrders ?? 0)
          const hasInvoice = invoices.some(
            (invoice) => invoice.table === table.number && invoice.status !== 'cancelled' && Number(invoice.remaining) > 0,
          )
          const hasActiveOrders = openCount > 0 || hasInvoice
          return { ...table, hasActiveOrders, openOrders: openCount }
        })
        .sort((a: any, b: any) => {
          const na = parseInt(a.number) || 0
          const nb = parseInt(b.number) || 0
          if (na !== nb) return na - nb
          return String(a.number).localeCompare(String(b.number), 'ar')
        }),
    [catalog?.tables, invoices],
  )

  if (tables.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد طاولات مسجلة لهذا الفرع.</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">اختر الطاولة لعرض وإدارة طلباتها وإضافة أو إزالة المنتجات</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {tables.map((table) => (
          <button
            key={table.id}
            type="button"
            onClick={() => router.push(`/cashier/tables/${table.id}`)}
            className={cn(
              'rounded-lg border bg-card p-4 text-right transition-colors hover:bg-accent',
              table.hasActiveOrders ? 'border-warning/40' : 'border-success/40',
            )}
          >
            <span className="block text-xl font-bold">الطاولة {table.number}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {table.name ? `${table.name} · ` : ''}
              {table.hasActiveOrders ? 'مشغولة' : 'متاحة'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}