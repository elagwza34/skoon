'use client'

import { useState, useTransition, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'
import { formatCurrency as formatMoney, formatDateShort } from '@/lib/format'
import type { InvoiceRow } from '@/lib/staff-invoices'

const money = (value: number | string) => formatMoney(Number(value))
const dateTime = (value: string) => {
  const date = new Date(value)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
  return `${formatDateShort(date)} ${time}`
}
const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

type InvoiceTab = 'open' | 'paid' | 'cancelled'

type RangePreset = 'day' | 'week' | 'month' | 'custom'

export function OwnerInvoiceBoard({ invoices, session }: { invoices: InvoiceRow[]; session: { role: string; name: string; branchId: string | null } }) {
  const [tab, setTab] = useState<InvoiceTab>('open')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteModal, setDeleteModal] = useState<string[]>([])
  const [releaseStock, setReleaseStock] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Date range export controls (paid invoices only)
  const [rangePreset, setRangePreset] = useState<RangePreset>('day')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const clearNotice = () => setTimeout(() => setNotice(null), 5000)
  function setNotice_(message: string | null) { setNotice(message); if (message) clearNotice() }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices.filter((invoice) => {
      const match = !q || invoice.number.toLowerCase().includes(q) || (invoice.creator ?? '').toLowerCase().includes(q)
      if (!match) return false
      if (tab === 'cancelled') return invoice.status === 'cancelled'
      if (tab === 'paid') return invoice.status !== 'cancelled' && Number(invoice.remaining) <= 0
      return invoice.status !== 'cancelled' && Number(invoice.remaining) > 0
    })
  }, [invoices, query, tab])

  const isSelected = (id: string) => selectedIds.has(id)
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)))
    }
  }, [rows, selectedIds.size])
  const selectedInvoices = rows.filter((r) => selectedIds.has(r.id))

  async function confirmDeleteBulk(ids: string[]) {
    if (pending || ids.length === 0) return
    setDeleteModal(ids)
  }

  async function executeDeleteBulk() {
    if (pending || deleteModal.length === 0) return
    startTransition(async () => {
      let failed = 0
      for (const id of deleteModal) {
        const response = await fetch(`/api/staff/invoices/${id}`, { method: 'DELETE' })
        if (!response.ok) failed++
      }
      setDeleteModal([])
      setSelectedIds(new Set())
      if (failed === 0) setNotice_(`تم حذف ${deleteModal.length} فاتورة بنجاح.`)
      else setNotice_(`تم حذف ${deleteModal.length - failed} فاتورة، وفشل ${failed} فاتورة.`)
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
    const params = new URLSearchParams({ format: 'csv' })
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    window.location.assign(`/api/staff/invoices?${params.toString()}`)
  }

  const rangeEnd = () => {
    const now = new Date()
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
    return end.toISOString().slice(0, 10)
  }
  const rangeStart = () => {
    const now = new Date()
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    if (rangePreset === 'week') d.setUTCDate(d.getUTCDate() - 6)
    if (rangePreset === 'month') d.setUTCMonth(d.getUTCMonth() - 1, 1)
    if (rangePreset === 'day') return d.toISOString().slice(0, 10)
    return fromDate || d.toISOString().slice(0, 10)
  }

  const tabs: { value: InvoiceTab; label: string }[] = [
    { value: 'open', label: 'مفتوحة' },
    { value: 'paid', label: 'مدفوعة' },
    { value: 'cancelled', label: 'ملغاة' },
  ]

  return (
    <Card className="w-full p-4" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">الفواتير</h2>
          <p className="text-sm text-muted-foreground">عرض الفواتير والفرع — للاطلاع من شاشة المالك.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Button key={t.value} size="sm" variant={tab === t.value ? 'secondary' : 'outline'} onClick={() => setTab(t.value)}>
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {tab === 'paid' && (
        <div className="mb-4 rounded-lg border border-border p-3 bg-muted/50 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-sm w-full">
          <span className="font-medium text-foreground">نطاق التصدير:</span>
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {'الكل'}
            {['day', 'week', 'month'].map((p) => (
              <Button key={p} size="sm" variant={rangePreset === p ? 'secondary' : 'outline'} onClick={() => { setRangePreset(p as RangePreset); setFromDate(''); setToDate('') }} className="flex-shrink-0">
                {p === 'day' ? 'يوم' : p === 'week' ? 'أسبوع' : 'شهر'}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <label className="text-[11px] text-muted-foreground whitespace-nowrap">من</label>
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setRangePreset('custom') }} className="w-full sm:w-32" />
            <label className="text-[11px] text-muted-foreground whitespace-nowrap sm:ml-1">إلى</label>
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setRangePreset('custom') }} className="w-full sm:w-32" />
          </div>
          <Button size="sm" variant="outline" onClick={exportPaidToExcel} className="w-full sm:w-auto">تصدير إكسيل (مدفوعة)</Button>
        </div>
      )}

      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم الفاتورة أو المنشئ" className="mb-4" />
      {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}

      {selectedIds.size > 0 && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-900/20 p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-rose-300">تم تحديد {selectedIds.size} فاتورة</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>إلغاء تحديد الكل</Button>
            <Button variant="destructive" size="sm" disabled={pending} onClick={() => confirmDeleteBulk([...selectedIds])}>حذف المحدد</Button>
          </div>
        </div>
      )}

      {!rows.length ? (
        <EmptyState title="لا توجد فواتير" description="لا توجد سجلات مطابقة لهذا القسم." />
      ) : (
        <div className="space-y-2">
{tab === 'paid' && rows.length > 0 && (
  <div className="flex items-center gap-2 mb-1">
    <input
      type="checkbox"
      checked={selectedIds.size === rows.length && rows.length > 0}
      onChange={toggleSelectAll}
      className="rounded border-border bg-background shrink-0"
    />
    <span className="text-xs text-foreground">تحديد الكل ({rows.length})</span>
  </div>
)}
{rows.map((invoice) => {
            const isOpen = expandedId === invoice.id
            const paid = Number(invoice.paid)
            const remaining = Number(invoice.remaining)
            const isPaid = tab === 'paid'
            return (
              <div key={invoice.id} className="overflow-hidden rounded-xl border border-border bg-card transition-all">
                <button
                  onClick={(event) => { event.stopPropagation(); toggleExpand(invoice.id) }}
                  className={`w-full border-b border-border/50 p-3 text-right transition-colors hover:bg-muted/50 ${isOpen ? 'bg-muted/40 border-primary/50' : ''} flex items-center justify-between`}
                >
                  <div className="flex items-center gap-2">
                    {tab === 'paid' && (
                      <input
                        type="checkbox"
                        checked={isSelected(invoice.id)}
                        onChange={() => toggleSelection(invoice.id)}
                        className="rounded border-border bg-text shrink-0"
                      />
                    )}
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
                      <Icon name={invoice.status === 'cancelled' ? 'trash' : invoice.status === 'paid' ? 'check' : 'clock'} size={12} />
                      {invoice.status === 'cancelled' ? 'ملغاة' : invoice.status === 'paid' ? 'مدفوعة' : 'مفتوحة'}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <CardContent className="border-t border-border p-3 text-right bg-card">
                    <div className="grid gap-2 sm:grid-cols-4 text-sm">
                      <div><span className="text-[11px] text-muted-foreground block">الطاولة</span><span className="text-foreground">{invoice.table ? `طاولة ${invoice.table}` : 'تيك أواي'}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">المنشئ</span><span className="text-foreground">{invoice.creator ?? '—'}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">الإجمالي</span><span className="text-foreground font-medium">{money(invoice.total)}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">المدفوع</span><span className="text-foreground">{money(invoice.paid)}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">المتبقي</span><span className="text-foreground font-bold">{money(invoice.remaining)}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">الأصناف</span><span className="text-foreground">{invoice.items.length}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">التفاصيل</span><span className="text-foreground truncate">{invoice.items.map((i) => `${i.name} × ${i.quantity}`).join(' ، ')}</span></div>
                      <div><span className="text-[11px] text-muted-foreground block">الحالة</span><span className="text-foreground">{invoice.paymentStatus}</span></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!isPaid && remaining <= 0 && invoice.status !== 'cancelled' && (
                        <Button size="sm" variant="outline" onClick={() => printInvoice(invoice)}>طباعة</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setDeleteModal([invoice.id]); setExpandedId(null) }}>
                        حذف الفاتورة
                      </Button>
                    </div>
                  </CardContent>
                )}
              </div>
            )}
          )}
        </div>
      )}

      {deleteModal.length > 0 && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-invoice-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-5" dir="rtl">
            <CardHeader>
              <CardTitle id="delete-invoice-title">تأكيد حذف الفاتورة{deleteModal.length > 1 ? ` (${deleteModal.length} فواتير)` : ` ${deleteModal[0]}`}</CardTitle>
            </CardHeader>
            <CardContent className="mt-4">
              <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذه {deleteModal.length > 1 ? 'الفواتير المحددة نهائياً' : 'الفاتورة نهائياً'}؟</p>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs text-amber-800">ملاحظة: الحذف الدائم للفواتير غير متاح حفاظاً على السجلات المالية. إذا لم يكن الحذف متاحاً، استخدم الإلغاء أو الاسترداد المعتمد.</p>
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
        </div>
      )}
    </Card>
  )
}
