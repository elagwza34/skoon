import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StaffSession } from '@/lib/session'
import type { PosCatalog } from '@/lib/staff-pos'

import { Input } from '@/components/ui/input'

interface TablesSidebarProps {
  catalog: PosCatalog
  sharedFloat: any
}

/** Sidebar showing table status - fixed on north, scrollable product list */
export function TablesSidebar({ catalog }: TablesSidebarProps) {
  const tables: any[] = [] // TODO: fetch staff tables via getStaffTables with session
  const [openModal, setOpenModal] = useState(false)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableNumber, setTableNumber] = useState('')

  return (
    <div className="fixed top-0 left-0 right-0 h-full bg-background/80 backdrop-blur flex flex-col z-40 overflow-y-auto p-4">
      <Card className="h-full">
        <CardHeader className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <CardTitle>إدارة الطاولات</CardTitle>
          <Badge tone="default" onClick={() => setOpenModal(true)}>جديدة</Badge>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          <div className="space-y-2">
            {tables.map((table) => {
              const hasActiveOrders = table.openOrders > 0
              return (
                <Button
                  key={table.id}
                  type="button"
                  className={cn(
                    'w-full rounded-lg border p-3 text-right transition-colors hover:bg-accent',
                    hasActiveOrders ? 'border-warning/40' : 'border-success/40',
                    selectedTable === table.id ? 'border-primary/40 ring-2 ring-primary' : ''
                  )}
                  onClick={() => setSelectedTable(table.id)}
                >
                  <span className="text-sm font-medium text-right">
                   {table.number}{table.name ? ` · ${table.name}` : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {hasActiveOrders ? 'مشغولة' : 'متاحة'}
                  </span>
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>
      
      {/* Modal for adding/editing table */}
      {openModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <Card className="w-full max-w-md sm:max-w-xl">
            <CardHeader><CardTitle>{selectedTable ? ' تعديل الطاولة' : ' إضافة طاولة جديدة'}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Input
                autoFocus
                placeholder={selectedTable ? 'رقم الطاولة' : 'ادخل رقم الطاولة'}
                onChange={(e) => setTableNumber(e.target.value)}
                defaultValue={selectedTable ? tables.find(t => t.id === selectedTable)?.number || '' : ''}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setSelectedTable(null)}>إلغاء</Button>
                <Button onClick={() => setOpenModal(false)}>حفظ</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}