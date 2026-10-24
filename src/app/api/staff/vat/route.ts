import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { getVatReport, VatReportError } from '@/lib/vat-report'

export const dynamic = 'force-dynamic'

function csvCell(value: string) { return `"${value.replace(/"/g, '""')}"` }

/** Owner-only VAT export. Values come from stored invoice tax snapshots. */
export async function GET(request: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const query = new URL(request.url).searchParams
  try {
    const report = await getVatReport(session, { from: query.get('from') ?? undefined, to: query.get('to') ?? undefined, branchId: query.get('branchId') ?? undefined })
    if (query.get('format') !== 'csv') return NextResponse.json(report)
    const lines = [
      ['invoice_number', 'branch', 'payment_at', 'tax_rate', 'sales_excluding_vat', 'vat', 'sales_including_vat', 'state', 'note'],
      ...report.invoices.map((invoice) => [invoice.number, invoice.branch, invoice.paymentAt, invoice.taxRate, invoice.salesExcludingVat.toFixed(2), invoice.vatCollected.toFixed(2), invoice.salesIncludingVat.toFixed(2), invoice.state, invoice.note ?? '']),
    ]
    const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="vat-report.csv"', 'cache-control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof VatReportError ? error.message : 'Unable to generate VAT report' }, { status: error instanceof VatReportError ? error.status : 500 })
  }
}
