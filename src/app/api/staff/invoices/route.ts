import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { getCashierInvoices } from '@/lib/staff-invoices'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function parseDate(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD')
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid date')
  return parsed
}

/** Paid-invoice export. The query is branch-scoped by getCashierInvoices; the client does not provide branch, totals, payment state, or collector data. */
export async function GET(request: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Waiters cannot access invoices
  if (session.role === 'waiter') return NextResponse.json({ error: 'غير مصرح — الوصول للفواتير للكاشير فقط' }, { status: 403 })
  const search = new URL(request.url).searchParams
  if (search.get('format') !== 'csv') return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
  let from: Date | undefined
  let to: Date | undefined
  try {
    from = parseDate(search.get('from'))
    to = parseDate(search.get('to'), true)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid date range' }, { status: 400 })
  }
  if (from && to && from > to) return NextResponse.json({ error: 'The start date must not be after the end date' }, { status: 400 })
  if (from && to && to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'Date range may not exceed 366 days' }, { status: 400 })

  const invoices = await getCashierInvoices(session, { from, to })
  const rows = invoices.filter((invoice) => invoice.status !== 'cancelled' && Number(invoice.remaining) <= 0)
  const lines = [
    ['invoice_number', 'branch', 'created_at', 'total', 'paid', 'payment_methods', 'collected_by'],
    ...rows.map((invoice) => [
      invoice.number, invoice.branch, invoice.createdAt, invoice.total, invoice.paid,
      invoice.payments.map((payment) => payment.method).join(' | '),
      invoice.payments.map((payment) => payment.collector ?? '').filter(Boolean).join(' | '),
    ]),
  ]
  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="paid-invoices.csv"', 'cache-control': 'no-store' } })
}

/**
 * Delete invoice — Owner only
 * DELETE /api/staff/invoices/[id]
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Only Owner can delete invoices
  if (session.role !== 'owner') return NextResponse.json({ error: 'غير مصرح — الحذف للمالك فقط' }, { status: 403 })

  const { id } = await params
  try {
    // Delete related payments first
    await prisma.payment.deleteMany({ where: { invoiceId: id } })

    // Delete the invoice
    await prisma.invoice.delete({ where: { id } })

    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed' }, { status: 500 })
  }
}
