'use client'

import { Modal } from '@/components/ui/modal'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'
import { formatCurrency as formatMoney } from '@/lib/format'
import type { InvoiceRow } from '@/lib/staff-invoices'
import { invoiceBucket, invoiceView, resolveInvoiceRange, type InvoiceTab, type RangePreset } from '@/lib/owner-invoice-view'

const money = (value: number | string) => formatMoney(Number(value))
const dateTime = (value: string) => {
  const date = new Date(value)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Cairo' }).format(date)
  return `${new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' }).format(date)} ${time}`
}
const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export function OwnerInvoiceBoard({ invoices, session }: { invoices: InvoiceRow[]; session: { role: string; name: string; branchId: string | null } }) {
  const [tab, setTab] = useState<InvoiceTab>('open')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<string[]>([])
  const [releaseStock, setReleaseStock] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [localInvoices, setLocalInvoices] = useState<InvoiceRow[]>(invoices)

  // All summaries, rows, and paid exports use invoice creation dates in Cairo.
  const [rangePreset, setRangePreset] = useState<RangePreset>('day')
  const [fromDate, setFromDate] = useState(() => resolveInvoiceRange('day', '', '').from)
  const [toDate, setToDate] = useState(() => resolveInvoiceRange('day', '', '').to)

  useEffect(() => { setLocalInvoices(invoices) }, [invoices])
  const range = useMemo(() => resolveInvoiceRange(rangePreset, fromDate, toDate), [rangePreset, fromDate, toDate])
  function selectRange(preset: RangePreset) {
    const next = resolveInvoiceRange(preset, fromDate, toDate)
    setRangePreset(preset)
    setFromDate(next.from)
    setToDate(next.to)
  }

  const clearNotice = () => setTimeout(() => setNotice(null), 5000)
  function setNotice_(message: string | null) { setNotice(message); if (message) clearNotice() }

  const { rows, cards } = useMemo(() => invoiceView(localInvoices, range, tab, query), [localInvoices, range, tab, query])

  async function executeDeleteBulk() {
    if (pending || deleteModal.length === 0) return
    startTransition(async () => {
      let failed = 0
      const archived: string[] = []
      for (const id of deleteModal) {
        const response = await fetch(`/api/staff/invoices/${id}`, { method: 'DELETE' })
        if (!response.ok) failed++
        else archived.push(id)
      }
      if (archived.length > 0) {
        setLocalInvoices((prev) => prev.map((inv) => (archived.includes(inv.id) ? { ...inv, isArchived: true } : inv)))
      }
      setDeleteModal([])
      if (failed === 0) setNotice_(`تم أرشفة ${archived.length} فاتورة بنجاح.`)
      else setNotice_(`تم أرشفة ${archived.length} فاتورة، وفشل ${failed} فاتورة.`)
    })
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
    // Keep selection independent of expansion
  }

  function printInvoice(invoice: InvoiceRow) {
    if (Number(invoice.paid) <= 0) return setNotice_('لا يمكن طباعة فاتورة غير محصلة.')
    window.location.assign(`/api/staff/invoices?format=csv`)
  }

  function exportPaidToExcel() {
    if (range.error) return setNotice_(range.error)
    const params = new URLSearchParams({ format: 'csv' })
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    window.location.assign(`/api/staff/invoices?${params.toString()}`)
  }

  const tabs: { value: InvoiceTab; label: string }[] = [
    { value: 'open', label: 'مفتوحة' },
    { value: 'paid', label: 'مدفوعة' },
    { value: 'cancelled', label: 'ملغاة' },
    { value: 'deleted', label: 'محذوفة' },
  ]

  return (
    <Card className="w-full p-4" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">الفواتير</h2>
          <p className="text-sm text-muted-foreground">عرض الفواتير والفرع — للاطلاع من شاشة المالك.</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          {tabs.map((t) => (
            <Button key={t.value} size="sm" variant={tab === t.value ? 'secondary' : 'outline'} onClick={() => setTab(t.value)} className="shrink-0 whitespace-nowrap">
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3 text-sm">
        <p className="mb-2 font-medium">النطاق حسب تاريخ إنشاء الفاتورة — بتوقيت القاهرة</p>
        <div className="flex flex-wrap items-center gap-2">
          {(['day', 'week', 'month', 'all'] as RangePreset[]).map((preset) => (
            <Button key={preset} size="sm" variant={rangePreset === preset ? 'secondary' : 'outline'} aria-pressed={rangePreset === preset} onClick={() => selectRange(preset)}>
              {preset === 'day' ? 'اليوم' : preset === 'week' ? 'آخر ٧ أيام' : preset === 'month' ? 'الشهر الحالي' : 'كل التاريخ'}
            </Button>
          ))}
          <label className="flex items-center gap-2">من
            <Input type="date" aria-label="من تاريخ إنشاء الفاتورة" aria-invalid={!!range.error} aria-describedby={range.error ? 'invoice-range-error' : undefined} value={fromDate} onChange={(e) => { setFromDate(e.target.value); setRangePreset('custom') }} className="w-36" />
          </label>
          <label className="flex items-center gap-2">إلى
            <Input type="date" aria-label="إلى تاريخ إنشاء الفاتورة" aria-invalid={!!range.error} aria-describedby={range.error ? 'invoice-range-error' : undefined} value={toDate} onChange={(e) => { setToDate(e.target.value); setRangePreset('custom') }} className="w-36" />
          </label>
          {tab === 'paid' && <Button size="sm" variant="outline" disabled={!!range.error} onClick={exportPaidToExcel}>تصدير إكسيل (مدفوعة)</Button>}
        </div>
        {range.error && <p id="invoice-range-error" role="alert" className="mt-2 text-destructive">{range.error}</p>}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          { value: 'paid', label: 'قيمة الفواتير المدفوعة' },
          { value: 'cancelled', label: 'القيمة الاسمية للفواتير الملغاة' },
          { value: 'open', label: 'المتبقي على الفواتير المفتوحة' },
          { value: 'deleted', label: 'القيمة الاسمية للفواتير المؤرشفة' },
        ] as { value: InvoiceTab; label: string }[]).map(({ value, label }) => (
          <div key={value} className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-xl font-bold tabular-nums">{range.error ? '—' : money(cards[value].amount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{range.error ? '—' : cards[value].count} فاتورة</p>
          </div>
        ))}
      </div>

      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم الفاتورة أو المنشئ" className="mb-4" />
      {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}

      {!rows.length ? (
        <EmptyState title="لا توجد فواتير" description="لا توجد سجلات مطابقة لهذا القسم." />
      ) : (
        <div className="space-y-2">
{rows.map((invoice) => {
            const isOpen = expandedId === invoice.id
            const remaining = Number(invoice.remaining)
            const isPaid = invoiceBucket(invoice) === 'paid'
            return (
              <div key={invoice.id} className="overflow-hidden rounded-xl border border-border bg-card transition-all">
                <button
                  onClick={(event) => { event.stopPropagation(); toggleExpand(invoice.id) }}
                  className={`w-full border-b border-border/50 p-3 text-right transition-colors hover:bg-muted/50 ${isOpen ? 'bg-muted/40 border-primary/50' : ''} flex items-center justify-between`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex justify-between gap-3 w-full min-w-0">
                      <strong className="truncate">{invoice.number}</strong>
                      <span className="font-bold">{money(invoice.total)}</span>
                      <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} className="shrink-0 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{invoice.creator ?? '—'} · {dateTime(invoice.createdAt)}</span>
                    <span>{invoice.table ? `طاولة ${invoice.table}` : 'تيك أواي'} · المتبقي {money(invoice.remaining)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 border border-border/50">
                      <Icon name={invoice.isArchived ? 'trash' : invoice.status === 'cancelled' ? 'trash' : isPaid ? 'check' : 'clock'} size={12} />
                      {invoice.isArchived ? 'محذوفة' : invoice.status === 'cancelled' ? 'ملغاة' : isPaid ? 'مدفوعة' : 'مفتوحة'}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <CardContent className="border-t border-border p-3 text-right bg-card">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                      <div><span className="text-[11px] text-muted-foreground block">الطاولة</span><span className="text-foreground">{invoice.table ? `طاولة ${invoice.table}` : 'تيك أواي'}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">المنشئ</span><span className="text-foreground">{invoice.creator ?? '—'}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">الإجمالي</span><span className="text-foreground font-medium">{money(invoice.total)}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">المدفوع</span><span className="text-foreground">{money(invoice.paid)}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">المتبقي</span><span className="text-foreground font-bold">{money(invoice.remaining)}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">الأصناف</span><span className="text-foreground">{invoice.items.length}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">التفاصيل</span><span className="text-foreground truncate">{invoice.items.map((i) => `${i.name} × ${i.quantity}`).join(' ، ')}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">الحالة</span><span className="text-foreground">{invoice.isArchived ? 'مؤرشفة' : invoice.status === 'cancelled' ? 'ملغاة' : isPaid ? 'مدفوعة' : 'مفتوحة'}</span></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!isPaid && remaining <= 0 && invoice.status !== 'cancelled' && (
                        <Button size="sm" variant="outline" onClick={() => printInvoice(invoice)}>طباعة</Button>
                      )}
                      {tab === 'cancelled' && (
                        <Button size="sm" variant="destructive" onClick={(event) => { event.stopPropagation(); setDeleteModal([invoice.id]); setExpandedId(null) }}>
                          أرشفة كاملة
                        </Button>
                      )}
                    </div>
                  </CardContent>
                )}
              </div>
            )}
          )}
        </div>
      )}

      {deleteModal.length > 0 && (
        <Modal aria-labelledby="delete-invoice-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClose={() => setDeleteModal([])} dismissible={!pending}>
          <Card className="w-full max-w-md p-5" dir="rtl">
            <CardHeader>
              <CardTitle id="delete-invoice-title">تأكيد الأرشفة{deleteModal.length > 1 ? ` (${deleteModal.length} فواتير)` : ` ${deleteModal[0]}`}</CardTitle>
            </CardHeader>
            <CardContent className="mt-4">
              <p className="text-sm text-muted-foreground">هل أنت متأكد من أرشفة هذه {deleteModal.length > 1 ? 'الفواتير كاملة' : 'الفاتورة كاملة'}؟</p>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs text-amber-800">ملاحظة: الأرشفة لا تحذف السجلات المالية. إذا لم يكن الأرشفة متاحاً (دفعات، مخزون، تدقيق نشط)، استخدم الإلغاء أو الاسترداد المعتمد.</p>
              </div>
              <label className="mt-3 block flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={releaseStock} onChange={(event) => setReleaseStock(event.target.checked)} />
                <span>خصم من المخزون — إرجاع الكمية المحجوزة للمخزون عند الإزالة</span>
              </label>
            </CardContent>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteModal([])}>إلغاء</Button>
              <Button variant="destructive" size="sm" disabled={pending} onClick={executeDeleteBulk}>تأكيد الحذف</Button>
            </div>
          </Card>
        </Modal>
      )}
    </Card>
  )
}
