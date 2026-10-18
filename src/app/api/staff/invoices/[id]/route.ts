import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { editOpenInvoice, InvoiceError } from '@/lib/staff-invoices'
export const dynamic = 'force-dynamic'
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { return NextResponse.json(await editOpenInvoice(session, (await params).id, await req.json())) }
  catch (error) { return NextResponse.json({ error: error instanceof InvoiceError ? error.message : 'Invoice edit failed' }, { status: error instanceof InvoiceError ? error.status : 500 }) }
}
