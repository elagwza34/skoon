'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatCurrency, formatDateShort } from '@/lib/format'
import type { InvoiceRow } from '@/lib/staff-invoices'

export type ThermalPaymentResult = {
  paid: string
  change: string
  method: string
}

type PaperWidth = '80mm' | '58mm'

const money = (value: number | string) => formatCurrency(Number(value))
const orderTypeLabel = (value: string) => value.toLowerCase() === 'takeaway' ? 'سفري' : 'داخل الكافيه'
const invoiceTime = (date: Date) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date)

export function ThermalReceiptPreview({ invoice, payment, autoPrint = false, onClose }: {
  invoice: InvoiceRow
  payment?: ThermalPaymentResult
  autoPrint?: boolean
  onClose: () => void
}) {
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('80mm')
  const printedAutomatically = useRef(false)
  const printing = useRef(false)
  const logo = useRef<HTMLImageElement>(null)
  const [isPrinting, setIsPrinting] = useState(false)

  function printReceipt() {
    // Do not queue another browser print dialog while one is already pending.
    // This is particularly important on kiosk workstations where repeated clicks
    // would otherwise produce duplicate physical receipts.
    if (printing.current) return
    printing.current = true
    setIsPrinting(true)
    document.body.classList.add('skoon-thermal-printing')

    let started = false
    const startPrint = () => {
      if (started) return
      started = true
      requestAnimationFrame(() => window.print())
    }
    const image = logo.current
    if (image?.complete && image.naturalWidth > 0) startPrint()
    else {
      image?.addEventListener('load', startPrint, { once: true })
      image?.addEventListener('error', startPrint, { once: true })
      window.setTimeout(startPrint, 1500)
    }
  }

  useEffect(() => {
    const clearPrintTarget = () => {
      document.body.classList.remove('skoon-thermal-printing')
      printing.current = false
      setIsPrinting(false)
    }
    window.addEventListener('afterprint', clearPrintTarget)
    return () => {
      window.removeEventListener('afterprint', clearPrintTarget)
      clearPrintTarget()
    }
  }, [])

  useEffect(() => {
    if (autoPrint && !printedAutomatically.current) {
      printedAutomatically.current = true
      printReceipt()
    }
  }, [autoPrint])

  const paid = payment?.paid ?? invoice.paid
  const method = payment?.method ?? invoice.payments.map((item) => item.method).join(' / ')
  const createdAt = new Date(invoice.createdAt)
  const notes = invoice.notes?.trim()
  const orderType = invoice.orderType ?? 'dine_in'
  const isDineIn = orderType.toLowerCase() === 'dine_in'

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="thermal-receipt-title">
    <style>{`@media print {
      @page { margin: 0; }
      [data-thermal-receipt-shell] { width: 100% !important; max-width: 100% !important; overflow: visible !important; }
      .no-print { display: none !important; }
    }`}</style>
    <Card data-thermal-receipt-shell className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div><h2 id="thermal-receipt-title" className="font-bold">معاينة الإيصال الحراري</h2><p className="text-xs text-muted-foreground">لن يتغير التحصيل أو حالة الفاتورة بالطباعة.</p></div>
        <Button variant="ghost" onClick={onClose} className="no-print">إغلاق</Button>
      </header>
      <div data-thermal-receipt-scroll className="overflow-y-auto bg-muted/30 p-4">
        <section
          data-thermal-receipt
          style={{
            '--thermal-content-width': paperWidth === '80mm' ? '71.5mm' : '50mm',
          } as CSSProperties}
          className="thermal-receipt mx-auto w-full bg-white p-3 text-right text-black shadow-sm"
          dir="rtl"
        >
          <header className="receipt-brand border-b border-black pb-2 text-center">
            <Image ref={logo} src="/receipt-logo.png" alt="شعار سكون" width={1311} height={1200} priority className="receipt-logo mx-auto h-auto w-[30mm] max-w-full object-contain" />
            <p className="mt-1 text-sm font-bold">سكون - 01500379339</p>
          </header>
          <div className="py-2 text-xs">
            {invoice.items.map((item) => <div key={item.id} className="receipt-item grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-dashed border-black/40 py-1.5">
              <div className="min-w-0"><p className="break-words text-[13px] font-bold leading-5">{item.name}</p><p className="text-[11px]" dir="ltr">{item.quantity} × {money(item.unitPrice)}</p>{item.details?.length ? <p className="mt-0.5 break-words text-[11px] leading-4">{item.details.join(' · ')}</p> : null}{item.notes?.trim() ? <p className="mt-0.5 break-words text-[11px] leading-4">{item.notes.trim()}</p> : null}</div>
              <div className="self-start whitespace-nowrap pt-0.5 text-left" dir="ltr"><strong className="text-[12px]">{money(item.lineTotal)}</strong>{Number(item.discountAmount) > 0 ? <p className="mt-0.5 text-[10px] font-medium text-black">خصم -{money(item.discountAmount)}</p> : null}</div>
            </div>)}
          </div>
          <div className="receipt-summary space-y-1 border-t border-black pt-2 text-xs">
            {Number(invoice.itemDiscount ?? 0) > 0 ? <div className="flex justify-between gap-3"><span>خصم الأصناف</span><span dir="ltr">-{money(invoice.itemDiscount ?? 0)}</span></div> : null}
            {Number(invoice.discountEligibleBase ?? invoice.subtotal) !== Number(invoice.subtotal) ? <div className="flex justify-between gap-3"><span>قاعدة خصم الفاتورة</span><span dir="ltr">{money(invoice.discountEligibleBase ?? invoice.subtotal)}</span></div> : null}
            {Number(invoice.discount) > Number(invoice.itemDiscount ?? 0) ? <div className="flex justify-between gap-3"><span>خصم الفاتورة</span><span dir="ltr">-{money(Number(invoice.discount) - Number(invoice.itemDiscount ?? 0))}</span></div> : null}
            <div className="flex justify-between gap-3 text-sm font-bold"><span>الإجمالي</span><strong dir="ltr">{money(invoice.subtotal)}</strong></div>
            <div className="flex justify-between gap-3"><span>الخصم</span><span dir="ltr">{Number(invoice.discount) > 0 ? `-${money(invoice.discount)}` : money(0)}</span></div>
            <div className="flex justify-between gap-3 border-t border-black pt-1 text-sm font-bold"><span>المدفوع</span><strong dir="ltr">{money(paid)}</strong></div>
          </div>
          {notes ? <section className="receipt-notes mt-3 border-t border-black pt-2 text-xs"><h3 className="mb-1 font-bold">ملاحظات</h3><p className="whitespace-pre-wrap break-words leading-5">{notes}</p></section> : null}
          <section className="receipt-metadata mt-3 border-t border-black pt-2 text-xs" aria-label="بيانات الفاتورة">
            <MetadataRow label="الفرع" value={invoice.branch} />
            <MetadataRow label="رقم الفاتورة" value={invoice.number} ltr />
            <MetadataRow label="التاريخ" value={formatDateShort(createdAt)} />
            <MetadataRow label="الوقت" value={invoiceTime(createdAt)} ltr />
            <MetadataRow label="نوع الطلب" value={orderTypeLabel(orderType)} />
            {isDineIn && invoice.table ? <MetadataRow label="الطاولة" value={invoice.table} /> : null}
            {invoice.creator ? <MetadataRow label="الكاشير" value={invoice.creator} /> : null}
            {method ? <MetadataRow label="طريقة الدفع" value={method} /> : null}
          </section>
          {invoice.status === 'cancelled' && invoice.cancelReason ? <p className="receipt-cancellation mt-3 border-t border-black pt-2 text-xs">سبب الإلغاء: {invoice.cancelReason}</p> : null}
          <footer className="mt-3 border-t border-black pt-2 text-center text-[11px]">شكرًا لزيارتكم</footer>
        </section>
      </div>
      <footer data-print-controls className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-3 no-print">
        <label className="flex items-center gap-2 text-sm">عرض الورق
          <select disabled={isPrinting} value={paperWidth} onChange={(event) => setPaperWidth(event.target.value as PaperWidth)} className="rounded border bg-background px-2 py-1 text-sm"><option value="80mm">80 مم</option><option value="58mm">58 مم</option></select>
        </label>
        <Button onClick={printReceipt} disabled={isPrinting}>{isPrinting ? 'جارٍ الإرسال للطابعة…' : 'طباعة'}</Button>
      </footer>
    </Card>
  </div>
}

function MetadataRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 py-0.5"><span className="font-medium">{label}</span><bdi className="min-w-0 break-words text-left font-normal" dir={ltr ? 'ltr' : 'auto'}>{value}</bdi></div>
}
