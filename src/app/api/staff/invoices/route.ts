import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { getCashierInvoices } from '@/lib/staff-invoices'

export const dynamic = 'force-dynamic'

function parseDate(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD')
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid date')
  return parsed
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  mobile_wallet: 'محفظة إلكترونية',
  instapay: 'إنستا باي',
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'داخل المطعم',
  takeaway: 'تيك أواي',
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  served: 'تم التقديم',
  cancelled: 'ملغى',
  paid: 'مدفوعة',
  settled: 'مسددة',
}

/** Paid-invoice export. The query is branch-scoped by getCashierInvoices; the client does not provide branch, totals, payment state, or collector data. */
export async function GET(request: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح', status: 401 }, { status: 401 })

  // Waiters cannot access invoices
  if (session.role === 'waiter') return NextResponse.json({ error: 'غير مصرح — الوصول للفواتير للكاشير فقط', status: 403 }, { status: 403 })
  const search = new URL(request.url).searchParams
  if (search.get('format') !== 'csv') return NextResponse.json({ error: 'تنسيق غير مدعوم', status: 400 }, { status: 400 })
  let from: Date | undefined
  let to: Date | undefined
  try {
    from = parseDate(search.get('from'))
    to = parseDate(search.get('to'), true)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'نطاق تاريخ غير صحيح', status: 400 }, { status: 400 })
  }
  if (from && to && from > to) return NextResponse.json({ error: 'تاريخ البدء لا يمكن أن يكون بعد تاريخ الانتهاء', status: 400 }, { status: 400 })
  if (from && to && to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'لا يمكن أن يتجاوز نطاق التاريخ 366 يوماً', status: 400 }, { status: 400 })

  const invoices = await getCashierInvoices(session, { from, to })
  const rows = invoices.filter((invoice) => invoice.status !== 'cancelled' && Number(invoice.remaining) <= 0)

  const headers = [
    'رقم الفاتورة',
    'الفرع',
    'التاريخ',
    'نوع الطلب',
    'الحالة',
    'الإجمالي',
    'المدفوع',
    'المتبقي',
    'طرق الدفع',
    'تم التحصيل بواسطة',
  ]

  const csvCell = (value: string | number) => {
    const text = String(value)
    if (/^-?\d+(\.\d+)?$/.test(text)) return text
    return `"${text.replace(/"/g, '""')}"`
  }

  const lines = [
    headers,
    ...rows.map((invoice) => [
      invoice.number,
      invoice.branch,
      invoice.createdAt,
      ORDER_TYPE_LABELS[invoice.orderType ?? 'dine_in'] ?? invoice.orderType,
      INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status,
      Number(invoice.total),
      Number(invoice.paid),
      Number(invoice.remaining),
      invoice.payments.map((payment) => PAYMENT_METHOD_LABELS[payment.method] ?? payment.method).join(' | '),
      invoice.payments.map((payment) => payment.collector ?? '').filter(Boolean).join(' | '),
    ]),
  ]

  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="paid-invoices-ar.csv"', 'cache-control': 'no-store' } })
}
