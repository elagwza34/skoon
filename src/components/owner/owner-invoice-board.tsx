'use client'

import { useState, useTransition, useMemo } from 'react'
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

export function OwnerInvoiceBoard({ invoices, session }: { invoices: InvoiceRow[]; session: { role: string; name: string; branchId: string | null } }) {
  const [tab, setTab] = useState<InvoiceTab>('open')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ id: string; number: string } | null>(null)
  const [removeModal, setRemoveModal] = useState<{ id: string; number: string; items: InvoiceRow['items'] } | null>(null)
  const [releaseStock, setReleaseStock] = useState(true)
  const [removeReason, setRemoveReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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

  const selected = rows.find((invoice) => invoice.id === selectedId) ?? null

  const clearNotice = () => setTimeout(() => setNotice(null), 5000)
  function setNotice_(message: string | null) { setNotice(message); if (message) clearNotice() }

  function openDelete(invoice: InvoiceRow) { setDeleteModal({ id: invoice.id, number: invoice.number }) }
  function openRemove(invoice: InvoiceRow) {
    setRemoveModal({ id: invoice.id, number: invoice.number, items: invoice.items })
    setReleaseStock(true)
    setRemoveReason('')
  }

  async function confirmDelete() {
    if (!deleteModal || pending) return
    startTransition(async () => {
      const response = await fetch(`/api/staff/invoices/${deleteModal.id}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      setDeleteModal(null)
      setSelectedId(null)
      if (response.ok) setNotice_(`تم حذف الفاتورة ${deleteModal.number}.`)
      else setNotice_(body.error ?? `تعذر حذف الفاتورة ${deleteModal.number}.`)
    })
  }

  async function confirmRemove() {
    if (!removeModal || pending) return
    const item = removeModal.items[0]
    if (!item) return
    if (!removeReason || removeReason.trim().length < 3) return setNotice_('سبب الإزالة مطلوب (3 أحرف على الأقل).')
    startTransition(async () => {
      const response = await fetch(`/api/staff/orders/${removeModal.id}/items/${item.id}/void`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': key() },
        body: JSON.stringify({ reason: removeReason.trim(), idempotencyKey: key(), releaseStock }),
      })
      const body = await response.json().catch(() => ({}))
      setRemoveModal(null)
      if (response.ok) setNotice_(`تم إزالة الصنف ${item.name}. ${releaseStock ? 'تم إرجاع الكمية للمخزون.' : 'بقيت الكمية محجوزة (لم تُخصم من المخزون).'}`)
      else setNotice_(body.error ?? 'تعذر إزالة الصنف.')
    })
  }

  function printInvoice(invoice: InvoiceRow) {
    if (Number(invoice.paid) <= 0) return setNotice_('لا يمكن طباعة فاتورة غير محصلة.')
    window.location.assign(`/api/staff/invoices?format=csv`)
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
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم الفاتورة أو المنشئ" className="mb-4" />
      {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
      {selectedId && selected && (
        <div className="mb-4 rounded-xl border p-3 bg-card text-right">
          <div className="flex justify-between gap-2 mb-2"><strong>{selected.number}</strong><span className="text-xs text-muted-foreground">{dateTime(selected.createdAt)}</span></div>
          <div className="flex justify-between text-sm mb-1"><span>الطاولة:</span><span>{selected.table ? `طاولة ${selected.table}` : 'تيك أواي'}</span></div>
          <div className="flex justify-between text-sm mb-1"><span>المنشئ:</span><span>{selected.creator ?? '—'}</span></div>
          <div className="flex justify-between text-sm font-medium mb-2"><span>الإجمالي:</span><span>{money(selected.total)}</span></div>
          <div className="flex justify-between text-sm mb-2"><span>المدفوع:</span><span>{money(selected.paid)}</span></div>
          <div className="flex justify-between text-sm font-bold mb-3"><span>المتبقي:</span><span>{money(selected.remaining)}</span></div>
          <div className="text-xs text-muted-foreground mb-2">الأصناف: {selected.items.length} · {selected.items.map((i) => `${i.name} × ${i.quantity}`).join(' ، ')}</div>
          <div className="flex flex-wrap gap-2">
            {Number(selected.remaining) <= 0 && selected.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => printInvoice(selected)}>طباعة</Button>}
            <Button size="sm" variant="outline" onClick={() => openDelete(selected)}>حذف الفاتورة</Button>
            {selected.status !== 'cancelled' && selected.items.length > 0 && <Button size="sm" variant="outline" onClick={() => openRemove(selected)}>إزالة صنف</Button>}
          </div>
        </div>
      )}
      {!rows.length ? (
        <EmptyState title="لا توجد فواتير" description="لا توجد سجلات مطابقة لهذا القسم." />
      ) : (
        <div className="space-y-2">
          {rows.map((invoice) => (
            <button
              key={invoice.id}
              onClick={() => setSelectedId(selectedId === invoice.id ? null : invoice.id)}
              className={`w-full rounded-xl border p-3 text-right transition-colors ${selectedId === invoice.id ? 'border-primary bg-accent/40' : 'border-border bg-card'}`}
            >
              <div className="flex justify-between gap-3 mb-1"><strong>{invoice.number}</strong><span className="font-bold">{money(invoice.total)}</span></div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{invoice.creator ?? '—'} · {dateTime(invoice.createdAt)}</span>
                <span>{invoice.table ? `طاولة ${invoice.table}` : 'تيك أواي'} · المتبقي {money(invoice.remaining)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border border-border/50">
                  <Icon name={invoice.status === 'cancelled' ? 'trash' : invoice.status === 'paid' ? 'check' : 'clock'} size={12} />
                  {invoice.status === 'cancelled' ? 'ملغاة' : invoice.status === 'paid' ? 'مدفوعة' : 'مفتوحة'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {deleteModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-invoice-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-5" dir="rtl">
            <CardHeader>
              <CardTitle id="delete-invoice-title">تأكيد حذف الفاتورة {deleteModal.number}</CardTitle>
            </CardHeader>
            <CardContent className="mt-4">
              <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذه الفاتورة نهائياً؟</p>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs text-amber-800">ملاحظة: الحذف الدائم للفواتير غير متاح حفاظاً على السجلات المالية. إذا لم يكن الحذف متاحاً، استخدم الإلغاء أو الاسترداد المعتمد.</p>
              </div>
              <label className="mt-3 block flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={releaseStock} onChange={(event) => setReleaseStock(event.target.checked)} />
                <span>خصم من المخزون — إرجاع الكمية المحجوزة للمخزون عند الإزالة</span>
              </label>
            </CardContent>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteModal(null)}>إلغاء</Button>
              <Button variant="destructive" size="sm" disabled={pending} onClick={confirmDelete}>تأكيد الحذف</Button>
            </div>
          </Card>
        </div>
      )}
      {removeModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="remove-item-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-5" dir="rtl">
            <CardHeader>
              <CardTitle id="remove-item-title">إزالة صنف من الفاتورة {removeModal.number}</CardTitle>
            </CardHeader>
            <CardContent className="mt-4">
              <div className="mb-3"><label className="block text-xs text-muted-foreground mb-1">الصنف</label>
                <select value={removeModal.items[0]?.id ?? ''} disabled className="rounded-lg border bg-background p-2 text-sm w-full">
                  {removeModal.items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.variantLabel ? ` — ${i.variantLabel}` : ''} × {i.quantity}</option>)}
                </select>
              </div>
              <div className="mb-3"><label className="block text-xs text-muted-foreground mb-1">سبب الإزالة</label>
                <Input value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} placeholder="أضف سبب الإزالة…" />
              </div>
              <label className="block flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={releaseStock} onChange={(event) => setReleaseStock(event.target.checked)} />
                <span>خصم من المخزون — {releaseStock ? 'نعم: إرجاع الكمية للمخزون' : 'لا: تبقى الكمية محجوزة'}</span>
              </label>
            </CardContent>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRemoveModal(null)}>إلغاء</Button>
              <Button variant="destructive" size="sm" disabled={pending || !removeReason.trim()} onClick={confirmRemove}>تأكيد الإزالة</Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  )
}
