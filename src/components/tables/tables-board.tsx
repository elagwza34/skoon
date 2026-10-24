'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StaffTable } from '@/lib/staff-tables'

/**
 * Tables board — real branch tables + live occupancy.
 * No local state mutation: occupancy derives from open orders in the DB.
 */
export function TablesBoard({ tables, canEditLayout = false }: { tables: StaffTable[]; canEditLayout?: boolean }) {
  const available = tables.filter((t) => t.status === 'available').length
  const occupied = tables.filter((t) => t.status === 'occupied').length
  const [view, setView] = useState<'grid' | 'floor'>('grid')

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
        <div className="flex rounded-md border border-border p-0.5"><Button size="sm" variant={view === 'grid' ? 'primary' : 'ghost'} onClick={() => setView('grid')}>شبكة</Button><Button size="sm" variant={view === 'floor' ? 'primary' : 'ghost'} onClick={() => setView('floor')}>مخطط القاعة</Button></div>
      </div>

      {tables.length === 0 ? (
        <EmptyState icon="tables" title="لا توجد طاولات" description="أضف طاولات الفرع من قاعدة البيانات أولاً." />
      ) : (
        <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5', view !== 'grid' && 'hidden')}>
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
      {tables.length > 0 && view === 'floor' ? <FloorPlanPanel tables={tables} canEdit={canEditLayout} /> : null}
    </div>
  )
}

function FloorPlanPanel({ tables, canEdit }: { tables: StaffTable[]; canEdit: boolean }) {
  type Layout = { x: number; y: number; zone: string; rotation: number }
  const [draft, setDraft] = useState<Record<string, Layout>>(() => Object.fromEntries(
    tables.map((table, index) => [table.id, {
      x: table.floorPlanX ?? 10 + (index % 5) * 19,
      y: table.floorPlanY ?? 10 + Math.floor(index / 5) * 24,
      zone: table.floorPlanZone ?? '', rotation: table.floorPlanRotation,
    }]),
  ) as Record<string, Layout>)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  async function save() {
    if (!canEdit || saving) return
    setSaving(true); setMessage(null)
    try {
      const response = await fetch('/api/staff/tables/layout', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tables: tables.map((table) => ({ id: table.id, ...draft[table.id], zone: draft[table.id].zone || null })) }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error ?? 'تعذر حفظ المخطط')
      setMessage('تم حفظ مخطط القاعة.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر حفظ المخطط') } finally { setSaving(false) }
  }
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">المخطط يستخدم حالة الطاولات الفعلية نفسها في عرض الشبكة. على الهاتف يبدأ العرض بالشبكة افتراضيًا.</p>{canEdit ? <Button disabled={saving} onClick={() => void save()}>{saving ? 'جارٍ الحفظ…' : 'حفظ مواقع الطاولات'}</Button> : <Badge tone="muted">العرض فقط — التحرير للمالك</Badge>}</div>{message ? <p className="rounded border border-border px-3 py-2 text-sm">{message}</p> : null}<div className="relative min-h-[460px] overflow-hidden rounded-xl border bg-muted/30" aria-label="مخطط القاعة">{tables.map((table) => { const item = draft[table.id]; return <div key={table.id} className={cn('absolute w-28 rounded-lg border p-2 text-center shadow-sm', table.status === 'available' ? 'border-success/50 bg-success/10' : 'border-warning/50 bg-warning/10')} style={{ left: `${item.x}%`, top: `${item.y}%`, transform: `translate(-50%, -50%) rotate(${item.rotation}deg)` }}><p className="font-bold">طاولة {table.number}</p><p className="text-xs">{table.status === 'available' ? 'متاحة' : `مشغولة · ${table.openOrders}`}</p>{canEdit ? <div className="mt-2 grid grid-cols-2 gap-1" onPointerDown={(event) => event.stopPropagation()}><Input type="number" min="0" max="100" value={item.x} aria-label={`الموضع الأفقي للطاولة ${table.number}`} onChange={(event) => setDraft((value) => ({ ...value, [table.id]: { ...value[table.id], x: Number(event.target.value) } }))} /><Input type="number" min="0" max="100" value={item.y} aria-label={`الموضع الرأسي للطاولة ${table.number}`} onChange={(event) => setDraft((value) => ({ ...value, [table.id]: { ...value[table.id], y: Number(event.target.value) } }))} /></div> : null}</div> })}</div></section>
}
