import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { editOpenInvoice, InvoiceError } from '@/lib/staff-invoices'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { return NextResponse.json(await editOpenInvoice(session, (await params).id, await req.json())) }
  catch (error) { return NextResponse.json({ error: error instanceof InvoiceError ? error.message : 'Invoice edit failed' }, { status: error instanceof InvoiceError ? error.status : 500 }) }
}

/** Delete an invoice/order — Owner only. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'owner') return NextResponse.json({ error: 'غير مصرح — الحذف للمالك فقط' }, { status: 403 })

  const { id } = await params
  try {
    const orderId = BigInt(id)
    await prisma.payment.deleteMany({ where: { orderId } })
    await prisma.order.delete({ where: { id: orderId } })
    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed' }, { status: 500 })
  }
}
