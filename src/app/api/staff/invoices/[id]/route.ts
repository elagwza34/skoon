import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { editOpenInvoice, InvoiceError } from '@/lib/staff-invoices'
import { invoiceDeletionRejection } from '@/lib/invoice-deletion-policy'
export const dynamic = 'force-dynamic'
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { return NextResponse.json(await editOpenInvoice(session, (await params).id, await req.json())) }
  catch (error) { return NextResponse.json({ error: error instanceof InvoiceError ? error.message : 'Invoice edit failed' }, { status: error instanceof InvoiceError ? error.status : 500 }) }
}

/** Permanent deletion is disabled so invoice, payment, and order history survives. */
export async function DELETE(_req: Request, _context: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  const rejection = invoiceDeletionRejection(session)
  return NextResponse.json(
    { error: rejection.error },
    { status: rejection.status, headers: rejection.allow ? { Allow: rejection.allow } : undefined },
  )
}
