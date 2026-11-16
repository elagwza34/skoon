'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/format'
import { selectOwnerOpenOrders } from '@/lib/owner-open-orders'
import type { InvoiceRow } from '@/lib/staff-invoices'

const money = (value: string) => formatCurrency(Number(value))
const dateTime = (value: string) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const tableLabel = (invoice: InvoiceRow) => invoice.orderType === 'takeaway' ? 'تيك أواي' : `طاولة ${invoice.table}`

export function OwnerOpenOrdersBoard({ invoices, initialQuery = '', initialSelectedId }: { invoices: InvoiceRow[]; initialQuery?: string; initialSelectedId?: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null)
  useEffect(() => setQuery(initialQuery), [initialQuery])
  useEffect(() => setSelectedId(initialSelectedId ?? null), [initialSelectedId])
  const openInvoices = useMemo(() => selectOwnerOpenOrders(invoices), [invoices])
  const rows = useMemo(() => selectOwnerOpenOrders(openInvoices, query), [openInvoices, query])
  const selected = openInvoices.find(invoice => invoice.id === selectedId)

  return <section dir="rtl" className="space-y-4" aria-labelledby="owner-open-orders-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 id="owner-open-orders-title" className="text-xl font-bold">الطلبات المفتوحة</h1><p className="mt-1 text-sm text-muted-foreground">الطلبات التي لم تُحصّل فواتيرها بالكامل. تفاصيل الطلبات للعرض فقط.</p></div>
      <Badge tone="warning">{openInvoices.length} طلب مفتوح</Badge>
    </div>
    <Input aria-label="بحث الطلبات المفتوحة" placeholder="ابحث برقم الطلب أو الطاولة أو الفرع أو المنشئ" value={query} onChange={event => setQuery(event.target.value)} className="max-w-lg" />
    {!rows.length ? <EmptyState title="لا توجد طلبات مفتوحة مطابقة" description="تظهر هنا الطلبات غير المحصّلة فقط، بما فيها المدفوعة جزئياً." /> : <div className="grid gap-3 lg:grid-cols-2">
      {rows.map(invoice => <Card key={invoice.id}>
        <CardHeader className="pb-2"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{invoice.number}</CardTitle><Badge tone="warning">{Number(invoice.paid) > 0 ? 'مدفوع جزئياً' : 'غير محصّل'}</Badge></div></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{tableLabel(invoice)} · {invoice.branch}</p>
          <p className="text-xs text-muted-foreground">{dateTime(invoice.createdAt)} · {invoice.creator ?? '—'}</p>
          <div className="flex flex-wrap items-end justify-between gap-3"><div><span className="block text-xs text-muted-foreground">المتبقي للتحصيل</span><span className="text-lg font-bold">{money(invoice.remaining)}</span><p className="text-xs text-muted-foreground">إجمالي الطلب {money(invoice.total)}</p></div><Button variant="outline" onClick={() => setSelectedId(invoice.id)} aria-label={`عرض تفاصيل الطلب ${invoice.number}`}>عرض التفاصيل</Button></div>
        </CardContent>
      </Card>)}
    </div>}
    {selected ? <Modal onClose={() => setSelectedId(null)} aria-labelledby="owner-order-details-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6">
      <Card className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden">
        <CardHeader className="shrink-0 border-b"><div className="flex items-start justify-between gap-3"><div><CardTitle id="owner-order-details-title">تفاصيل الطلب {selected.number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">للعرض فقط · {tableLabel(selected)} · {selected.branch}</p></div><Button variant="outline" size="sm" onClick={() => setSelectedId(null)} aria-label="إغلاق تفاصيل الطلب">إغلاق</Button></div></CardHeader>
        <CardContent className="space-y-4 overflow-y-auto p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">تاريخ الطلب</dt><dd>{dateTime(selected.createdAt)}</dd></div><div><dt className="text-muted-foreground">المنشئ</dt><dd>{selected.creator ?? '—'}</dd></div></dl>
          {selected.notes ? <div className="rounded-lg bg-muted p-3 text-sm"><h3 className="font-medium">ملاحظات الطلب</h3><p className="mt-1 whitespace-pre-wrap">{selected.notes}</p></div> : null}
          <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="mb-2 text-start font-semibold">أصناف الطلب</caption><thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">الصنف</th><th className="p-2 text-end">الكمية</th><th className="p-2 text-end">سعر الوحدة</th><th className="p-2 text-end">الإجمالي</th></tr></thead><tbody>{selected.items.map(item => <tr key={item.id} className="border-b last:border-0"><td className="p-2"><p className="font-medium">{item.name}</p>{item.variantLabel ? <p className="text-xs text-muted-foreground">{item.variantLabel}</p> : null}{item.details?.map((detail, index) => <p key={index} className="text-xs text-muted-foreground">{detail}</p>)}{item.notes ? <p className="mt-1 whitespace-pre-wrap text-xs">{item.notes}</p> : null}</td><td className="p-2 text-end">{item.quantity}</td><td className="p-2 text-end whitespace-nowrap">{money(item.unitPrice)}</td><td className="p-2 text-end whitespace-nowrap">{money(item.lineTotal)}</td></tr>)}</tbody></table></div>
          <dl className="space-y-2 rounded-lg border p-3 text-sm">{[
            ['قيمة الأصناف', selected.subtotal], ['الخصم', selected.discount], ['الضريبة', selected.tax], ['إجمالي الفاتورة', selected.total], ['المحصّل', selected.paid], ['المتبقي للتحصيل', selected.remaining],
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold whitespace-nowrap">{money(value)}</dd></div>)}</dl>
        </CardContent>
      </Card>
    </Modal> : null}
  </section>
}
