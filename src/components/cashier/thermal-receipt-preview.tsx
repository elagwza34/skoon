'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatCurrency, formatDateShort, formatTime } from '@/lib/format'
import type { InvoiceRow } from '@/lib/staff-invoices'

export type ThermalPaymentResult = {
  paid: string
  change: string
  method: string
}

type PaperWidth = '80mm' | '58mm'

const money = (value: number | string) => formatCurrency(Number(value))
const dateTime = (value: string) => {
  const date = new Date(value)
  return `${formatDateShort(date)} ${formatTime(date)}`
}

export function ThermalReceiptPreview({ invoice, payment, autoPrint = false, onClose }: {
  invoice: InvoiceRow
  payment?: ThermalPaymentResult
  autoPrint?: boolean
  onClose: () => void
}) {
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('80mm')
  const printedAutomatically = useRef(false)
  const printing = useRef(false)
  const [isPrinting, setIsPrinting] = useState(false)

  function printReceipt() {
    // Do not queue another browser print dialog while one is already pending.
    // This is particularly important on kiosk workstations where repeated clicks
    // would otherwise produce duplicate physical receipts.
    if (printing.current) return
    printing.current = true
    setIsPrinting(true)
    document.body.classList.add('skoon-thermal-printing')

    // The receipt is already mounted before this handler is available. One frame
    // lets Chrome apply the print-only target without initiating a print on load.
    requestAnimationFrame(() => window.print())
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

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="thermal-receipt-title">
    <style>{`@media print { @page { size: ${paperWidth} auto; margin: 0; } }`}</style>
    <Card className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div><h2 id="thermal-receipt-title" className="font-bold">معاينة الإيصال الحراري</h2><p className="text-xs text-muted-foreground">لن يتغير التحصيل أو حالة الفاتورة بالطباعة.</p></div>
        <Button variant="ghost" onClick={onClose}>إغلاق</Button>
      </header>
      <div className="overflow-y-auto bg-muted/30 p-4">
        <section
          data-thermal-receipt
          style={{
            '--thermal-content-width': paperWidth === '80mm' ? '72mm' : '50mm',
          } as CSSProperties}
          className="thermal-receipt mx-auto w-full bg-white p-3 text-right text-black shadow-sm"
          dir="rtl"
        >
          <header className="border-b border-black pb-2 text-center">
            <h1 className="text-base font-bold">سكون</h1>
            <p className="mt-1 text-xs">{invoice.branch}</p>
            <p className="mt-1 text-xs">فاتورة {invoice.number}</p>
            <p className="text-xs">{dateTime(invoice.createdAt)}</p>
            {invoice.creator && <p className="text-xs">الكاشير: {invoice.creator}</p>}
            {invoice.table && <p className="text-xs">الطاولة: {invoice.table}</p>}
          </header>
          <div className="py-2 text-xs">
            {invoice.items.map((item) => <div key={item.id} className="receipt-item grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-dashed border-black/40 py-1.5">
              <div className="min-w-0"><p className="break-words font-medium">{item.name}</p><p className="text-[11px]">{item.quantity} × {money(item.unitPrice)}</p></div>
              <strong className="self-center whitespace-nowrap">{money(item.lineTotal)}</strong>
            </div>)}
          </div>
          <div className="space-y-1 border-t border-black pt-2 text-xs">
            <div className="flex justify-between gap-3"><span>قبل الضريبة</span><span>{money(invoice.subtotal)}</span></div>
            {Number(invoice.discount) > 0 && <div className="flex justify-between gap-3"><span>الخصم</span><span>-{money(invoice.discount)}</span></div>}
            {Number(invoice.tax) > 0 && <div className="flex justify-between gap-3"><span>الضريبة</span><span>{money(invoice.tax)}</span></div>}
            <div className="flex justify-between gap-3 border-t border-black pt-1 text-sm font-bold"><span>الإجمالي</span><span>{money(invoice.total)}</span></div>
            <div className="flex justify-between gap-3"><span>المدفوع</span><span>{money(paid)}</span></div>
            {payment && <div className="flex justify-between gap-3"><span>الباقي للعميل</span><span>{money(payment.change)}</span></div>}
            {Number(invoice.remaining) > 0 && <div className="flex justify-between gap-3"><span>المتبقي</span><span>{money(invoice.remaining)}</span></div>}
            {method && <div className="flex justify-between gap-3"><span>طريقة الدفع</span><span>{method}</span></div>}
            <div className="flex justify-between gap-3"><span>حالة الدفع</span><span>{invoice.paymentStatus}</span></div>
          </div>
          {invoice.status === 'cancelled' && <p className="mt-3 border-t border-black pt-2 text-xs">سبب الإلغاء: {invoice.cancelReason ?? 'غير مسجل'}</p>}
          <footer className="mt-3 border-t border-black pt-2 text-center text-[11px]">شكرًا لزيارتكم</footer>
        </section>
      </div>
      <footer data-print-controls className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-3">
        <label className="flex items-center gap-2 text-sm">عرض الورق
          <select disabled={isPrinting} value={paperWidth} onChange={(event) => setPaperWidth(event.target.value as PaperWidth)} className="rounded border bg-background px-2 py-1 text-sm"><option value="80mm">80 مم</option><option value="58mm">58 مم</option></select>
        </label>
        <Button onClick={printReceipt} disabled={isPrinting}>{isPrinting ? 'جارٍ الإرسال للطابعة…' : 'طباعة'}</Button>
      </footer>
    </Card>
  </div>
}
